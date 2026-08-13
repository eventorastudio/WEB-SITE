import { getPackageById, getSectionById, isSectionAllowed } from './section-registry.js';
import { getThemeById } from './theme-registry.js';
import { validateBasicContent } from './builder-validation.js';

const CONTENT_FIELDS = Object.freeze(['title', 'date', 'time', 'eventType', 'city']);
const PREVIEW_DEVICES = Object.freeze(['mobile', 'tablet', 'desktop']);

export function assertEnabledSections(value) {
    if (!Array.isArray(value)) throw new TypeError('builder/enabled-sections-must-be-array');
    const unique = new Set();
    value.forEach((sectionId) => {
        if (typeof sectionId !== 'string' || !sectionId || !getSectionById(sectionId)) {
            throw new TypeError(`builder/invalid-enabled-section:${String(sectionId)}`);
        }
        if (unique.has(sectionId)) throw new TypeError(`builder/duplicate-enabled-section:${sectionId}`);
        unique.add(sectionId);
    });
    return value;
}

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function text(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeDate(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const direct = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
        if (direct) return direct;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
    }
    if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
    const seconds = value.seconds ?? value._seconds;
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString().slice(0, 10);
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    return '';
}

function resolveEventPackage(eventData) {
    const candidate = text(eventData?.packageId ?? eventData?.paqueteId ?? eventData?.paquete).toLowerCase();
    return getPackageById(candidate) ? candidate : 'esencial';
}

export function createInvitationDraft(eventId, eventData = {}) {
    const packageId = resolveEventPackage(eventData);
    const packageWasStored = [eventData.packageId, eventData.paqueteId, eventData.paquete]
        .some((candidate) => text(candidate).toLowerCase() === packageId);

    return {
        schemaVersion: 1,
        eventId,
        packageId,
        themeId: null,
        enabledSections: [],
        content: {
            title: text(eventData.nombreEvento ?? eventData.nombre, 'Evento sin título'),
            date: normalizeDate(eventData.fecha),
            time: text(eventData.hora),
            eventType: text(eventData.tipoEvento),
            city: text(eventData.ciudad)
        },
        media: { hero: null, gallery: [], audio: null, video: null },
        locations: [],
        itinerary: [],
        gifts: [],
        links: {},
        appearance: {},
        settings: { renderMode: 'builder' },
        meta: {
            packageSource: packageWasStored ? 'event' : 'phase-1-default',
            loadedAt: new Date().toISOString()
        }
    };
}

export class InvitationBuilderState {
    constructor() {
        this._draft = null;
        this._ui = {
            isDirty: false,
            activeStep: 'theme',
            previewDevice: 'mobile',
            validationErrors: {}
        };
        this._listeners = new Set();
        this._errorListeners = new Set();
    }

    initialize(eventId, eventData) {
        if (!eventId) throw new Error('builder/event-required');
        this._draft = createInvitationDraft(eventId, eventData);
        this._ui = {
            isDirty: false,
            activeStep: 'theme',
            previewDevice: 'mobile',
            validationErrors: validateBasicContent(this._draft.content)
        };
        this._notify('initialized', null);
        return this.getSnapshot();
    }

    getSnapshot() {
        return clone({ draft: this._draft, ui: this._ui });
    }

    subscribe(listener, { source = 'anonymous' } = {}) {
        if (typeof listener !== 'function') return () => {};
        const subscription = Object.freeze({ listener, source });
        this._listeners.add(subscription);
        return () => this._listeners.delete(subscription);
    }

    subscribeToErrors(listener) {
        if (typeof listener !== 'function') return () => {};
        this._errorListeners.add(listener);
        return () => this._errorListeners.delete(listener);
    }

    setPackage(packageId) {
        if (!this._draft) throw new Error('builder/not-initialized');
        if (!getPackageById(packageId)) return { ok: false, code: 'builder/unknown-package' };
        if (this._draft.packageId === packageId) return { ok: true, changed: false };
        const previous = this.getSnapshot();
        this._draft.packageId = packageId;
        this._markDirty();
        this._notify('package-changed', previous);
        return { ok: true, changed: true };
    }

    setTheme(themeId) {
        if (!this._draft) throw new Error('builder/not-initialized');
        if (!getThemeById(themeId)) return { ok: false, code: 'builder/unknown-theme' };
        if (this._draft.themeId === themeId) return { ok: true, changed: false };
        const previous = this.getSnapshot();
        this._draft.themeId = themeId;
        this._markDirty();
        this._notify('theme-changed', previous);
        return { ok: true, changed: true };
    }

    toggleSection(sectionId, enabled) {
        if (!this._draft) throw new Error('builder/not-initialized');
        if (typeof sectionId !== 'string') return { ok: false, code: 'builder/invalid-section-id' };
        if (typeof enabled !== 'boolean') return { ok: false, code: 'builder/invalid-section-state' };
        if (!getSectionById(sectionId)) return { ok: false, code: 'builder/unknown-section' };
        if (enabled && !isSectionAllowed(sectionId, this._draft.packageId)) {
            return { ok: false, code: 'builder/section-not-allowed' };
        }

        const current = new Set(assertEnabledSections(this._draft.enabledSections));
        const hadSection = current.has(sectionId);
        if (enabled) current.add(sectionId);
        else current.delete(sectionId);
        if (hadSection === current.has(sectionId)) return { ok: true, changed: false };

        const previous = this.getSnapshot();
        this._draft.enabledSections = [...current];
        this._markDirty();
        this._notify('sections-changed', previous);
        return { ok: true, changed: true };
    }

    updateContent(patch = {}) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const next = {};
        CONTENT_FIELDS.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(patch, field)) next[field] = String(patch[field] ?? '').slice(0, 180);
        });
        if (!Object.keys(next).length) return { ok: false, code: 'builder/empty-content-patch' };

        const previous = this.getSnapshot();
        this._draft.content = { ...this._draft.content, ...next };
        this._ui.validationErrors = validateBasicContent(this._draft.content);
        this._markDirty();
        this._notify('content-changed', previous);
        return { ok: true, changed: true, errors: clone(this._ui.validationErrors) };
    }

    setPreviewDevice(device) {
        if (!PREVIEW_DEVICES.includes(device)) return { ok: false, code: 'builder/unknown-device' };
        if (this._ui.previewDevice === device) return { ok: true, changed: false };
        const previous = this.getSnapshot();
        this._ui.previewDevice = device;
        this._notify('preview-device-changed', previous);
        return { ok: true, changed: true };
    }

    setActiveStep(stepId) {
        if (!stepId || this._ui.activeStep === stepId) return;
        const previous = this.getSnapshot();
        this._ui.activeStep = stepId;
        this._notify('active-step-changed', previous);
    }

    getUnavailableEnabledSections() {
        if (!this._draft) return [];
        return this._draft.enabledSections.filter((sectionId) => !isSectionAllowed(sectionId, this._draft.packageId));
    }

    _markDirty() {
        this._ui.isDirty = true;
    }

    _notify(reason, previous) {
        if (this._draft) assertEnabledSections(this._draft.enabledSections);
        const payload = Object.freeze({ reason, snapshot: this.getSnapshot(), previous });
        [...this._listeners].forEach(({ listener, source }) => {
            try {
                listener(payload);
            } catch (error) {
                this._reportSubscriberError({ error, source, payload, listener });
            }
        });
    }

    _reportSubscriberError({ error, source, payload, listener }) {
        const incident = Object.freeze({
            error,
            source,
            reason: payload.reason,
            snapshot: payload.snapshot,
            retry: () => listener(payload)
        });
        if (!this._errorListeners.size) {
            console.error(`[InvitationBuilder] Falló el listener "${source}" durante "${payload.reason}".`, error);
            return;
        }
        [...this._errorListeners].forEach((errorListener) => {
            try {
                errorListener(incident);
            } catch (reportingError) {
                console.error('[InvitationBuilder] Falló el reporte visible de un error de listener.', reportingError, error);
            }
        });
    }
}

export const builderState = new InvitationBuilderState();
