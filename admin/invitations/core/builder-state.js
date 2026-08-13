import { getPackageById, getSectionById, isSectionAllowed } from './section-registry.js?v=phase2-content-20260813';
import { getThemeById } from './theme-registry.js?v=phase2-content-20260813';
import {
    INVITATION_CONTENT_SCHEMA_VERSION,
    INVITATION_DRAFT_SCHEMA_VERSION,
    cloneInvitationValue,
    createInitialLocations,
    createInvitationContent,
    getDraftValue,
    setDraftValue
} from './content-schema.js?v=phase2-content-20260813';
import { validateInvitationDraft } from './builder-validation.js?v=phase2-content-20260813';

const PREVIEW_DEVICES = Object.freeze(['mobile', 'tablet', 'desktop']);
const LEGACY_CONTENT_PATHS = Object.freeze({
    title: 'content.identity.primaryName',
    date: 'content.schedule.date',
    time: 'content.schedule.time',
    eventType: 'content.identity.eventType',
    city: 'content.place.city',
    state: 'content.place.state',
    phrase: 'content.identity.phrase'
});

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

function text(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function resolveEventPackage(eventData) {
    const candidate = text(eventData?.packageId ?? eventData?.paqueteId ?? eventData?.paquete).toLowerCase();
    return getPackageById(candidate) ? candidate : null;
}

export function createInvitationDraft(eventId, eventData = {}) {
    const packageId = resolveEventPackage(eventData);

    return {
        schemaVersion: INVITATION_DRAFT_SCHEMA_VERSION,
        contentSchemaVersion: INVITATION_CONTENT_SCHEMA_VERSION,
        eventId,
        packageId,
        themeId: null,
        enabledSections: [],
        content: createInvitationContent(eventData),
        media: { hero: null, gallery: [], audio: null, video: null },
        locations: createInitialLocations(eventData),
        itinerary: [],
        gifts: [],
        links: {},
        appearance: {},
        settings: { renderMode: 'builder' },
        meta: {
            packageSource: packageId ? 'event' : 'unselected',
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
            validationErrors: validateInvitationDraft(this._draft)
        };
        this._notify('initialized', null);
        return this.getSnapshot();
    }

    getSnapshot() {
        return cloneInvitationValue({ draft: this._draft, ui: this._ui });
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
        this._draft.meta.packageSource = 'local-selection';
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
        const fields = Object.fromEntries(Object.entries(patch)
            .filter(([field]) => LEGACY_CONTENT_PATHS[field])
            .map(([field, value]) => [LEGACY_CONTENT_PATHS[field], value]));
        return this.updateDraftFields(fields);
    }

    updateDraftField(path, value) {
        return this.updateDraftFields({ [path]: value });
    }

    updateDraftFields(fields = {}) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const entries = Object.entries(fields);
        if (!entries.length) return { ok: false, code: 'builder/empty-content-patch' };

        const normalized = entries.map(([path, value]) => {
            const draftCopy = cloneInvitationValue(this._draft);
            setDraftValue(draftCopy, path, value);
            return [path, getDraftValue(draftCopy, path)];
        });
        const changed = normalized.some(([path, value]) => getDraftValue(this._draft, path) !== value);
        if (!changed) {
            return { ok: true, changed: false, errors: cloneInvitationValue(this._ui.validationErrors) };
        }

        const previous = this.getSnapshot();
        normalized.forEach(([path, value]) => setDraftValue(this._draft, path, value));
        this._ui.validationErrors = validateInvitationDraft(this._draft);
        this._markDirty();
        this._notify('content-changed', previous);
        return { ok: true, changed: true, errors: cloneInvitationValue(this._ui.validationErrors) };
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
