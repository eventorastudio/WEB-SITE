import { getPackageById, getSectionById, isSectionAllowed } from './section-registry.js?v=phase3-logistics-20260813';
import { getThemeById } from './theme-registry.js?v=phase3-logistics-20260813';
import {
    INVITATION_CONTENT_SCHEMA_VERSION,
    INVITATION_DRAFT_SCHEMA_VERSION,
    cloneInvitationValue,
    createInitialLocations,
    createInvitationContent,
    getDraftValue,
    setDraftValue
} from './content-schema.js?v=phase4-media-20260813';
import { validateInvitationDraft } from './builder-validation.js?v=phase4-media-20260813';
import {
    DRESS_COLOR_GROUPS,
    ENTITY_COLLECTIONS,
    createAccommodation,
    createDressColor,
    createEntityId,
    createGift,
    createItineraryItem,
    createLink,
    createLocation,
    normalizeEntity,
    packageAllowsMultipleLocations
} from './logistics-schema.js?v=phase3-logistics-20260813';
import {
    createEmptyInvitationMedia,
    createMediaAsset,
    getMediaRole,
    getMediaRoleAvailability
} from './media-schema.js?v=phase4-media-20260813';

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
        media: createEmptyInvitationMedia(),
        locations: createInitialLocations(eventData),
        itinerary: [],
        gifts: [],
        accommodations: [],
        links: [],
        appearance: {},
        settings: { renderMode: 'builder' },
        meta: {
            packageSource: packageId ? 'event' : 'unselected',
            touchedPaths: [],
            touchedCollections: [],
            touchedMediaRoles: [],
            entitySequences: {
                location: 1,
                itinerary: 0,
                gift: 0,
                accommodation: 0,
                link: 0,
                dressColor: 0,
                media: 0
            },
            loadedAt: new Date().toISOString()
        }
    };
}

export class InvitationBuilderState {
    constructor() {
        this._draft = null;
        this._ui = {
            isDirty: false,
            draftDirty: false,
            mediaDirty: false,
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
            draftDirty: false,
            mediaDirty: false,
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
        const touchedPaths = new Set(this._draft.meta.touchedPaths ?? []);
        const changed = normalized.some(([path, value]) => (
            getDraftValue(this._draft, path) !== value || !touchedPaths.has(path)
        ));
        if (!changed) {
            return { ok: true, changed: false, errors: cloneInvitationValue(this._ui.validationErrors) };
        }

        const previous = this.getSnapshot();
        normalized.forEach(([path, value]) => {
            setDraftValue(this._draft, path, value);
            touchedPaths.add(path);
        });
        this._draft.meta.touchedPaths = [...touchedPaths];
        this._ui.validationErrors = validateInvitationDraft(this._draft);
        this._markDirty();
        this._notify('content-changed', previous);
        return { ok: true, changed: true, errors: cloneInvitationValue(this._ui.validationErrors) };
    }

    addLocation(seed = {}) {
        if (!this._draft) throw new Error('builder/not-initialized');
        if (this._draft.locations.length >= 1 && !packageAllowsMultipleLocations(this._draft.packageId)) {
            return { ok: false, code: 'builder/multiple-locations-not-allowed' };
        }
        return this._addEntity('locations', (id) => createLocation(id, seed));
    }

    updateLocation(id, patch) { return this._updateEntity('locations', id, patch); }
    removeLocation(id) {
        return this._removeEntity('locations', id, (draft) => {
            let clearedReferences = 0;
            draft.itinerary = draft.itinerary.map((item) => {
                if (item.locationId !== id) return item;
                clearedReferences += 1;
                return { ...item, locationId: '' };
            });
            return { clearedReferences };
        });
    }
    moveLocation(id, direction) { return this._moveEntity('locations', id, direction); }

    addItineraryItem(seed = {}) { return this._addEntity('itinerary', (id) => createItineraryItem(id, seed)); }
    updateItineraryItem(id, patch) {
        const locationId = Object.hasOwn(patch ?? {}, 'locationId') ? String(patch.locationId ?? '') : null;
        if (locationId && !this._draft?.locations.some((location) => location.id === locationId)) {
            return { ok: false, code: 'builder/unknown-location-reference' };
        }
        return this._updateEntity('itinerary', id, patch);
    }
    removeItineraryItem(id) { return this._removeEntity('itinerary', id); }
    moveItineraryItem(id, direction) { return this._moveEntity('itinerary', id, direction); }

    addGift(seed = {}) { return this._addEntity('gifts', (id) => createGift(id, seed)); }
    updateGift(id, patch) { return this._updateEntity('gifts', id, patch); }
    removeGift(id) { return this._removeEntity('gifts', id); }
    moveGift(id, direction) { return this._moveEntity('gifts', id, direction); }

    addAccommodation(seed = {}) {
        if (this._draft?.accommodations.length >= 1) {
            return { ok: false, code: 'builder/multiple-accommodations-not-contracted' };
        }
        return this._addEntity('accommodations', (id) => createAccommodation(id, seed));
    }
    updateAccommodation(id, patch) { return this._updateEntity('accommodations', id, patch); }
    removeAccommodation(id) { return this._removeEntity('accommodations', id); }

    addLink(seed = {}) { return this._addEntity('links', (id) => createLink(id, seed)); }
    updateLink(id, patch) { return this._updateEntity('links', id, patch); }
    removeLink(id) { return this._removeEntity('links', id); }
    moveLink(id, direction) { return this._moveEntity('links', id, direction); }

    addDressColor(group, seed = {}) {
        if (!DRESS_COLOR_GROUPS.includes(group)) return { ok: false, code: 'builder/unknown-dress-color-group' };
        if (!this._draft) throw new Error('builder/not-initialized');
        const previous = this.getSnapshot();
        const id = this._nextEntityId('dressCodeColors');
        const color = createDressColor(id, seed);
        this._draft.content.dressCode[group].push(color);
        this._markCollectionTouched('dressCodeColors');
        this._commitEntityChange(previous, 'dressCodeColors', 'add', id, { group });
        return { ok: true, changed: true, entity: cloneInvitationValue(color) };
    }

    updateDressColor(group, id, patch = {}) {
        if (!DRESS_COLOR_GROUPS.includes(group)) return { ok: false, code: 'builder/unknown-dress-color-group' };
        const colors = this._draft?.content.dressCode[group];
        const index = colors?.findIndex((color) => color.id === id) ?? -1;
        if (index < 0) return { ok: false, code: 'builder/entity-not-found' };
        const next = createDressColor(id, { ...colors[index], ...patch });
        if (JSON.stringify(next) === JSON.stringify(colors[index])) return { ok: true, changed: false };
        const previous = this.getSnapshot();
        colors[index] = next;
        this._markCollectionTouched('dressCodeColors');
        this._commitEntityChange(previous, 'dressCodeColors', 'update', id, { group });
        return { ok: true, changed: true };
    }

    removeDressColor(group, id) {
        if (!DRESS_COLOR_GROUPS.includes(group)) return { ok: false, code: 'builder/unknown-dress-color-group' };
        const colors = this._draft?.content.dressCode[group];
        const index = colors?.findIndex((color) => color.id === id) ?? -1;
        if (index < 0) return { ok: false, code: 'builder/entity-not-found' };
        const previous = this.getSnapshot();
        colors.splice(index, 1);
        this._markCollectionTouched('dressCodeColors');
        this._commitEntityChange(previous, 'dressCodeColors', 'remove', id, { group });
        return { ok: true, changed: true };
    }

    moveDressColor(group, id, direction) {
        if (!DRESS_COLOR_GROUPS.includes(group)) return { ok: false, code: 'builder/unknown-dress-color-group' };
        return this._moveArrayEntity(this._draft?.content.dressCode[group], 'dressCodeColors', id, direction, { group });
    }

    addMediaAsset(role, seed = {}) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const definition = getMediaRole(role);
        if (!definition) return { ok: false, code: 'builder/unknown-media-role' };
        const availability = getMediaRoleAvailability(role, this._draft.packageId, this._draft.enabledSections);
        if (!availability.editable) return { ok: false, code: availability.packageAllowed ? 'builder/media-section-disabled' : 'builder/media-not-allowed' };
        if (definition.multiple && this._draft.media.gallery.length >= definition.technicalMaxItems) {
            return { ok: false, code: 'builder/media-gallery-limit' };
        }
        if (!definition.multiple && this._draft.media[role]) return { ok: false, code: 'builder/media-role-occupied' };

        const previous = this.getSnapshot();
        const id = this._nextMediaId();
        const target = definition.multiple ? this._draft.media.gallery : null;
        const asset = createMediaAsset(id, {
            ...seed,
            role,
            sortOrder: definition.multiple ? target.length : 0
        });
        if (definition.multiple) target.push(asset);
        else this._draft.media[role] = asset;
        this._markMediaRoleTouched(role);
        this._commitMediaChange(previous, role, 'add', id);
        return { ok: true, changed: true, entity: cloneInvitationValue(asset) };
    }

    updateMediaAsset(id, patch = {}) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const found = this._findMediaAsset(id);
        if (!found) return { ok: false, code: 'builder/media-not-found' };
        const availability = getMediaRoleAvailability(found.asset.role, this._draft.packageId, this._draft.enabledSections);
        if (!availability.editable) return { ok: false, code: availability.packageAllowed ? 'builder/media-section-disabled' : 'builder/media-not-allowed' };
        const next = createMediaAsset(id, {
            ...found.asset,
            ...cloneInvitationValue(patch),
            focalPoint: { ...found.asset.focalPoint, ...(patch.focalPoint ?? {}) },
            role: found.asset.role,
            sortOrder: found.asset.sortOrder
        });
        if (JSON.stringify(next) === JSON.stringify(found.asset)) return { ok: true, changed: false };
        const previous = this.getSnapshot();
        found.assign(next);
        this._markMediaRoleTouched(next.role);
        this._commitMediaChange(previous, next.role, 'update', id);
        return { ok: true, changed: true, entity: cloneInvitationValue(next) };
    }

    replaceMediaAsset(id, seed = {}) {
        const found = this._findMediaAsset(id);
        if (!found) return { ok: false, code: 'builder/media-not-found' };
        return this.updateMediaAsset(id, {
            ...seed,
            role: found.asset.role,
            sortOrder: found.asset.sortOrder,
            status: seed.status ?? 'ready',
            error: seed.error ?? ''
        });
    }

    removeMediaAsset(id) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const found = this._findMediaAsset(id);
        if (!found) return { ok: false, code: 'builder/media-not-found' };
        const availability = getMediaRoleAvailability(found.asset.role, this._draft.packageId, this._draft.enabledSections);
        if (!availability.editable) return { ok: false, code: availability.packageAllowed ? 'builder/media-section-disabled' : 'builder/media-not-allowed' };
        const previous = this.getSnapshot();
        found.remove();
        this._normalizeGalleryOrder();
        this._markMediaRoleTouched(found.asset.role);
        this._commitMediaChange(previous, found.asset.role, 'remove', id);
        return { ok: true, changed: true, entity: cloneInvitationValue(found.asset) };
    }

    clearMediaRole(role) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const definition = getMediaRole(role);
        if (!definition) return { ok: false, code: 'builder/unknown-media-role' };
        const availability = getMediaRoleAvailability(role, this._draft.packageId, this._draft.enabledSections);
        if (!availability.editable) return { ok: false, code: availability.packageAllowed ? 'builder/media-section-disabled' : 'builder/media-not-allowed' };
        const previous = this.getSnapshot();
        const removed = definition.multiple ? [...this._draft.media.gallery] : [this._draft.media[role]].filter(Boolean);
        if (definition.multiple) this._draft.media.gallery = [];
        else this._draft.media[role] = null;
        this._markMediaRoleTouched(role);
        this._commitMediaChange(previous, role, 'clear', null, { removedIds: removed.map(({ id }) => id) });
        return { ok: true, changed: removed.length > 0, removedIds: removed.map(({ id }) => id) };
    }

    moveGalleryAsset(id, direction) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const availability = getMediaRoleAvailability('gallery', this._draft.packageId, this._draft.enabledSections);
        if (!availability.editable) return { ok: false, code: availability.packageAllowed ? 'builder/media-section-disabled' : 'builder/media-not-allowed' };
        if (!['up', 'down'].includes(direction)) return { ok: false, code: 'builder/invalid-move-direction' };
        const items = this._draft.media.gallery;
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) return { ok: false, code: 'builder/media-not-found' };
        const target = direction === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= items.length) return { ok: true, changed: false };
        const previous = this.getSnapshot();
        [items[index], items[target]] = [items[target], items[index]];
        this._normalizeGalleryOrder();
        this._markMediaRoleTouched('gallery');
        this._commitMediaChange(previous, 'gallery', 'move', id, { direction });
        return { ok: true, changed: true };
    }

    hydrateMedia(media, { persisted = true } = {}) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const previous = this.getSnapshot();
        const normalize = (asset, role, sortOrder = 0) => asset ? createMediaAsset(asset.id, { ...asset, role, sortOrder }) : null;
        this._draft.media = {
            ...createEmptyInvitationMedia(),
            schemaVersion: media?.schemaVersion ?? createEmptyInvitationMedia().schemaVersion,
            cover: normalize(media?.cover, 'cover'),
            gallery: (Array.isArray(media?.gallery) ? media.gallery : []).map((asset, sortOrder) => normalize(asset, 'gallery', sortOrder)),
            video: normalize(media?.video, 'video'),
            videoPoster: normalize(media?.videoPoster, 'videoPoster'),
            music: normalize(media?.music, 'music')
        };
        const ids = [
            this._draft.media.cover,
            ...this._draft.media.gallery,
            this._draft.media.video,
            this._draft.media.videoPoster,
            this._draft.media.music
        ].filter(Boolean).map(({ id }) => Number.parseInt(String(id).replace(/^MED-LOCAL-/, ''), 10)).filter(Number.isFinite);
        this._draft.meta.entitySequences.media = Math.max(this._draft.meta.entitySequences.media, ...ids, 0);
        this._draft.meta.touchedMediaRoles = persisted
            ? ['cover', 'gallery', 'video', 'videoPoster', 'music']
            : ['cover', 'gallery', 'video', 'videoPoster', 'music']
                .filter((role) => role === 'gallery' ? this._draft.media.gallery.length : this._draft.media[role]);
        this._ui.mediaDirty = false;
        this._ui.isDirty = this._ui.draftDirty;
        this._ui.validationErrors = validateInvitationDraft(this._draft);
        this._notify('media-hydrated', previous);
        return this.getSnapshot();
    }

    markMediaPersisted() {
        if (!this._draft) throw new Error('builder/not-initialized');
        if (!this._ui.mediaDirty) return { ok: true, changed: false };
        const previous = this.getSnapshot();
        this._ui.mediaDirty = false;
        this._ui.isDirty = this._ui.draftDirty;
        this._notify('media-persisted', previous);
        return { ok: true, changed: true };
    }

    markMediaPending() {
        if (!this._draft) throw new Error('builder/not-initialized');
        if (this._ui.mediaDirty) return { ok: true, changed: false };
        const previous = this.getSnapshot();
        this._ui.mediaDirty = true;
        this._ui.isDirty = true;
        this._notify('media-pending', previous);
        return { ok: true, changed: true };
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

    _markDirty(scope = 'draft') {
        if (scope === 'media') this._ui.mediaDirty = true;
        else this._ui.draftDirty = true;
        this._ui.isDirty = this._ui.draftDirty || this._ui.mediaDirty;
    }

    _nextEntityId(collection) {
        const definition = ENTITY_COLLECTIONS[collection];
        if (!definition) throw new TypeError(`builder/unknown-entity-collection:${String(collection)}`);
        const sequences = this._draft.meta.entitySequences;
        sequences[definition.sequence] = (sequences[definition.sequence] ?? 0) + 1;
        return createEntityId(definition.prefix, sequences[definition.sequence]);
    }

    _markCollectionTouched(collection) {
        const touched = new Set(this._draft.meta.touchedCollections ?? []);
        touched.add(collection);
        this._draft.meta.touchedCollections = [...touched];
    }

    _nextMediaId() {
        const sequences = this._draft.meta.entitySequences;
        sequences.media = (sequences.media ?? 0) + 1;
        return `MED-LOCAL-${String(sequences.media).padStart(3, '0')}`;
    }

    _markMediaRoleTouched(role) {
        const touched = new Set(this._draft.meta.touchedMediaRoles ?? []);
        touched.add(role);
        this._draft.meta.touchedMediaRoles = [...touched];
    }

    _findMediaAsset(id) {
        const media = this._draft?.media;
        if (!media) return null;
        const galleryIndex = media.gallery.findIndex((asset) => asset.id === id);
        if (galleryIndex >= 0) {
            const asset = media.gallery[galleryIndex];
            return {
                asset,
                assign: (next) => { media.gallery[galleryIndex] = next; },
                remove: () => { media.gallery.splice(galleryIndex, 1); }
            };
        }
        for (const role of ['cover', 'video', 'videoPoster', 'music']) {
            if (media[role]?.id !== id) continue;
            const asset = media[role];
            return {
                asset,
                assign: (next) => { media[role] = next; },
                remove: () => { media[role] = null; }
            };
        }
        return null;
    }

    _normalizeGalleryOrder() {
        this._draft.media.gallery = this._draft.media.gallery.map((asset, sortOrder) => ({ ...asset, sortOrder }));
    }

    _commitMediaChange(previous, role, operation, id, details = {}) {
        this._ui.validationErrors = validateInvitationDraft(this._draft);
        this._markDirty('media');
        this._notify('media-changed', previous, { role, operation, id, ...details });
    }

    _addEntity(collection, factory) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const previous = this.getSnapshot();
        const id = this._nextEntityId(collection);
        const entity = factory(id);
        this._draft[collection].push(entity);
        this._markCollectionTouched(collection);
        this._commitEntityChange(previous, collection, 'add', id);
        return { ok: true, changed: true, entity: cloneInvitationValue(entity) };
    }

    _updateEntity(collection, id, patch = {}) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const items = this._draft[collection];
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) return { ok: false, code: 'builder/entity-not-found' };
        const sourcePatch = cloneInvitationValue(patch);
        const merged = { ...items[index], ...sourcePatch, id: items[index].id };
        if (collection === 'gifts' && sourcePatch.details) {
            merged.details = { ...items[index].details, ...sourcePatch.details };
        }
        const next = normalizeEntity(collection, merged);
        if (JSON.stringify(next) === JSON.stringify(items[index])) return { ok: true, changed: false };
        const previous = this.getSnapshot();
        items[index] = next;
        this._markCollectionTouched(collection);
        this._commitEntityChange(previous, collection, 'update', id);
        return { ok: true, changed: true, errors: cloneInvitationValue(this._ui.validationErrors) };
    }

    _removeEntity(collection, id, afterRemove = null) {
        if (!this._draft) throw new Error('builder/not-initialized');
        const items = this._draft[collection];
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) return { ok: false, code: 'builder/entity-not-found' };
        const previous = this.getSnapshot();
        items.splice(index, 1);
        const details = afterRemove?.(this._draft) ?? {};
        this._markCollectionTouched(collection);
        this._commitEntityChange(previous, collection, 'remove', id, details);
        return { ok: true, changed: true, ...details };
    }

    _moveEntity(collection, id, direction) {
        return this._moveArrayEntity(this._draft?.[collection], collection, id, direction);
    }

    _moveArrayEntity(items, collection, id, direction, details = {}) {
        if (!this._draft) throw new Error('builder/not-initialized');
        if (!['up', 'down'].includes(direction)) return { ok: false, code: 'builder/invalid-move-direction' };
        const index = items?.findIndex((item) => item.id === id) ?? -1;
        if (index < 0) return { ok: false, code: 'builder/entity-not-found' };
        const target = direction === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= items.length) return { ok: true, changed: false };
        const previous = this.getSnapshot();
        [items[index], items[target]] = [items[target], items[index]];
        this._markCollectionTouched(collection);
        this._commitEntityChange(previous, collection, 'move', id, { ...details, direction });
        return { ok: true, changed: true };
    }

    _commitEntityChange(previous, collection, operation, id, details = {}) {
        this._ui.validationErrors = validateInvitationDraft(this._draft);
        this._markDirty();
        this._notify('entities-changed', previous, { collection, operation, id, ...details });
    }

    _notify(reason, previous, details = {}) {
        if (this._draft) assertEnabledSections(this._draft.enabledSections);
        const payload = Object.freeze({ reason, snapshot: this.getSnapshot(), previous, details: Object.freeze(details) });
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
