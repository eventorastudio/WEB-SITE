import {
    INVITATION_CONTENT_SCHEMA_VERSION,
    INVITATION_EDITABLE_FIELDS,
    cloneInvitationValue,
    createInvitationContent,
    getDraftValue,
    setDraftValue
} from './content-schema.js?v=phase94-opening-cover-20260821';
import { validateInvitationDraft } from './builder-validation.js?v=phase89-dress-code-media-20260820';
import { getInvitationFormat, getPackageById, getSectionById } from './section-registry.js?v=phase93-package-sections-format-20260821';
import { getThemeById } from './theme-registry.js?v=phase3-logistics-20260813';
import { normalizeAppearance } from './appearance-schema.js?v=phase86-appearance-20260820';
import {
    DRESS_COLOR_GROUPS,
    createDressColor,
    normalizeEntity
} from './logistics-schema.js?v=phase121-draft-canonical-full-diagnostics-20260824';

export const INVITATION_DRAFT_DOCUMENT_ID = 'draft';
export const INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION = 2;

const LEGACY_INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION = 1;

const SAFE_EVENT_ID = /^[A-Za-z0-9_-]{1,150}$/;
const GENERAL_CONTENT_PATHS = Object.freeze(
    Object.keys(INVITATION_EDITABLE_FIELDS).filter((path) => !path.startsWith('content.rsvp.'))
);
const DOCUMENT_FIELDS = Object.freeze([
    'schemaVersion',
    'contentSchemaVersion',
    'eventId',
    'theme',
    'sections',
    'content',
    'locations',
    'itinerary',
    'gifts',
    'accommodations',
    'links',
    'appearance',
    'settings',
    'updatedAt',
    'updatedBy'
]);
const LEGACY_DOCUMENT_FIELDS = Object.freeze(
    DOCUMENT_FIELDS.filter((field) => field !== 'accommodations')
);
const SETTINGS_FIELDS = Object.freeze(['renderMode', 'packageId', 'format']);
const LEGACY_SETTINGS_FIELDS = Object.freeze(['renderMode', 'packageId']);
const LEGACY_ACCESS_FIELDS = Object.freeze(['title', 'description', 'label']);
const COLLECTION_LIMITS = Object.freeze({
    locations: 20,
    itinerary: 80,
    gifts: 50,
    accommodations: 1,
    links: 50
});
const SNAPSHOT_FIELDS = Object.freeze([
    'theme',
    'sections',
    'content',
    'locations',
    'itinerary',
    'gifts',
    'accommodations',
    'links',
    'appearance',
    'settings'
]);

function fail(code, details = {}) {
    const error = new TypeError(code);
    error.code = code;
    Object.assign(error, details);
    throw error;
}

function exactKeys(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length === fields.length && keys.every((key) => fields.includes(key));
}

function hasLegacyAccessShape(document) {
    const access = document?.content?.access;
    if (!access || typeof access !== 'object' || Array.isArray(access)) return false;
    const keys = Object.keys(access);
    return keys.length === LEGACY_ACCESS_FIELDS.length
        && keys.every((key) => LEGACY_ACCESS_FIELDS.includes(key))
        && LEGACY_ACCESS_FIELDS.every((key) => typeof access[key] === 'string');
}

function assertEventId(eventId) {
    const normalized = String(eventId ?? '');
    if (!SAFE_EVENT_ID.test(normalized)) fail('draft/invalid-event-id');
    return normalized;
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableStringify(value) {
    return JSON.stringify(stableValue(value));
}

function canonicalValueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

// This intentionally reports structure only. It is safe to leave enabled in
// production because it never includes values, URLs, IDs, or personal data.
export function findCanonicalDifferences(stored, normalized, { limit = 30 } = {}) {
    const differences = [];
    const visit = (storedValue, normalizedValue, path = '') => {
        if (differences.length >= limit) return;
        const storedType = canonicalValueType(storedValue);
        const normalizedType = canonicalValueType(normalizedValue);
        const currentPath = path || '(root)';
        if (storedType !== normalizedType) {
            differences.push({ path: currentPath, type: 'type-mismatch', storedPresence: 'present', normalizedPresence: 'present', storedType, normalizedType });
            return;
        }
        if (storedType === 'array') {
            if (storedValue.length !== normalizedValue.length) {
                differences.push({ path: currentPath, type: 'array-length-mismatch', storedPresence: 'present', normalizedPresence: 'present', storedType, normalizedType });
            }
            const count = Math.min(storedValue.length, normalizedValue.length);
            for (let index = 0; index < count && differences.length < limit; index += 1) {
                visit(storedValue[index], normalizedValue[index], `${path}[${index}]`);
            }
            return;
        }
        if (storedType === 'object' && storedValue && normalizedValue) {
            const keys = [...new Set([...Object.keys(storedValue), ...Object.keys(normalizedValue)])].sort();
            for (const key of keys) {
                if (differences.length >= limit) return;
                const childPath = path ? `${path}.${key}` : key;
                const storedPresent = Object.hasOwn(storedValue, key);
                const normalizedPresent = Object.hasOwn(normalizedValue, key);
                if (!storedPresent || !normalizedPresent) {
                    differences.push({
                        path: childPath,
                        type: 'key-presence-mismatch',
                        storedPresence: storedPresent ? 'present' : 'missing',
                        normalizedPresence: normalizedPresent ? 'present' : 'missing',
                        storedType: storedPresent ? canonicalValueType(storedValue[key]) : 'missing',
                        normalizedType: normalizedPresent ? canonicalValueType(normalizedValue[key]) : 'missing'
                    });
                    continue;
                }
                visit(storedValue[key], normalizedValue[key], childPath);
            }
            return;
        }
        if (!Object.is(storedValue, normalizedValue)) {
            differences.push({ path: currentPath, type: 'value-mismatch', storedPresence: 'present', normalizedPresence: 'present', storedType, normalizedType });
        }
    };
    visit(stored, normalized);
    return differences;
}

export function findFirstCanonicalDifference(stored, normalized) {
    return findCanonicalDifferences(stored, normalized, { limit: 1 })[0] ?? null;
}

function setGeneralContentValue(content, path, value) {
    setDraftValue({ content }, path, value);
}

function normalizeGeneralContent(source = {}) {
    const content = createInvitationContent();
    delete content.rsvp;
    GENERAL_CONTENT_PATHS.forEach((path) => {
        const value = getDraftValue({ content: source }, path);
        // Preserve defaults for newly introduced optional controls (for example access.showQr)
        // when normalizing drafts created before those fields existed.
        if (value !== undefined) setGeneralContentValue(content, path, value);
    });
    // Legacy drafts predate welcome.opening. Derive its visual stamp from the
    // already canonical identity/schedule values without mutating the source.
    if (!source?.welcome?.opening) {
        content.welcome.opening.stampLine1 = content.identity.eventType;
        content.welcome.opening.stampLine2 = content.schedule.date.slice(0, 4);
    }
    DRESS_COLOR_GROUPS.forEach((group) => {
        const colors = Array.isArray(source?.dressCode?.[group]) ? source.dressCode[group] : [];
        if (colors.length > 20) fail('draft/dress-colors-limit', { group });
        content.dressCode[group] = colors.map((color) => createDressColor(String(color?.id ?? ''), color));
    });
    return content;
}

function normalizeSections(sections = []) {
    if (!Array.isArray(sections)) fail('draft/invalid-sections');
    const normalized = sections.map((section) => String(section ?? ''));
    if (normalized.some((section) => !getSectionById(section))) fail('draft/unknown-section');
    if (new Set(normalized).size !== normalized.length) fail('draft/duplicate-section');
    return normalized;
}

function normalizeTheme(theme) {
    if (theme == null || theme === '') return null;
    const normalized = String(theme);
    if (!getThemeById(normalized)) fail('draft/unknown-theme');
    return normalized;
}

function normalizeSettings(settings = {}, packageId = undefined) {
    const sourcePackage = packageId === undefined ? settings?.packageId : packageId;
    const normalizedPackage = sourcePackage == null || sourcePackage === '' ? null : String(sourcePackage);
    if (normalizedPackage && !getPackageById(normalizedPackage)) fail('draft/unknown-package');
    const renderMode = String(settings?.renderMode ?? 'builder');
    if (renderMode !== 'builder') fail('draft/invalid-render-mode');
    const requestedFormat = settings?.format;
    if (requestedFormat != null && requestedFormat !== '' && getInvitationFormat(requestedFormat).id !== requestedFormat) {
        fail('draft/unknown-format');
    }
    const format = getInvitationFormat(requestedFormat).id;
    return { renderMode, packageId: normalizedPackage, format };
}

function normalizeCollection(collection, value) {
    if (!Array.isArray(value)) fail(`draft/invalid-${collection}`);
    if (value.length > COLLECTION_LIMITS[collection]) fail(`draft/${collection}-limit`);
    const normalized = value.map((entity) => normalizeEntity(collection, entity));
    const ids = normalized.map(({ id }) => id);
    if (ids.some((id) => !/^[A-Z]{3}-LOCAL-[0-9]{3,}$/.test(id))) fail(`draft/invalid-${collection}-id`);
    if (new Set(ids).size !== ids.length) fail(`draft/duplicate-${collection}-id`);
    return normalized;
}

// Legacy compatibility is limited to the documented location alias. This
// prepares a comparison copy only; it never mutates or writes the stored draft.
export function canonicalizeSupportedLegacyDraftForComparison(storedDraft) {
    if (!Array.isArray(storedDraft?.locations)) return storedDraft;
    const hasLegacyAlias = storedDraft.locations.some((location) => (
        location && Object.hasOwn(location, 'imageId') && !Object.hasOwn(location, 'imageMediaId')
    ));
    if (!hasLegacyAlias) return storedDraft;
    const comparison = { ...storedDraft };
    comparison.locations = storedDraft.locations.map((location) => {
        if (!location || !Object.hasOwn(location, 'imageId') || Object.hasOwn(location, 'imageMediaId')) return location;
        const next = { ...location, imageMediaId: location.imageId };
        delete next.imageId;
        return next;
    });
    return comparison;
}

function assertGeneralValidation(draft) {
    const errors = validateInvitationDraft(draft);
    const relevant = Object.fromEntries(Object.entries(errors).filter(([path]) => (
        !path.startsWith('content.rsvp.')
        && !path.startsWith('media.')
    )));
    if (Object.keys(relevant).length) fail('draft/validation-failed', { validationErrors: relevant });
}

function createPayload(draft, eventId) {
    const safeEventId = assertEventId(eventId);
    if (!draft || draft.eventId !== safeEventId) fail('draft/event-ownership-mismatch');
    assertGeneralValidation(draft);
    return {
        schemaVersion: INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION,
        contentSchemaVersion: INVITATION_CONTENT_SCHEMA_VERSION,
        eventId: safeEventId,
        theme: normalizeTheme(draft.themeId),
        sections: normalizeSections(draft.enabledSections),
        content: normalizeGeneralContent(draft.content),
        locations: normalizeCollection('locations', draft.locations ?? []),
        itinerary: normalizeCollection('itinerary', draft.itinerary ?? []),
        gifts: normalizeCollection('gifts', draft.gifts ?? []),
        accommodations: normalizeCollection('accommodations', draft.accommodations ?? []),
        links: normalizeCollection('links', draft.links ?? []),
        appearance: normalizeAppearance(draft.appearance),
        settings: normalizeSettings(draft.settings, draft.packageId)
    };
}

function isTimestamp(value) {
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value?.toDate === 'function') return value.toDate() instanceof Date;
    return Number.isFinite(value?.seconds ?? value?._seconds);
}

export function serializeInvitationDraft(draft, {
    eventId = draft?.eventId,
    updatedAt,
    updatedBy
} = {}) {
    const uid = String(updatedBy ?? '');
    if (!uid || uid.length > 128) fail('draft/updated-by-required');
    if (updatedAt == null) fail('draft/updated-at-required');
    return {
        ...createPayload(draft, eventId),
        updatedAt,
        updatedBy: uid
    };
}

export function deserializeInvitationDraft(document, expectedEventId) {
    const safeEventId = assertEventId(expectedEventId);
    const isLegacyDocument = document?.schemaVersion === LEGACY_INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION;
    const isCurrentDocument = document?.schemaVersion === INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION;
    if (!isLegacyDocument && !isCurrentDocument) fail('draft/unsupported-schema');
    if (!exactKeys(document, isLegacyDocument ? LEGACY_DOCUMENT_FIELDS : DOCUMENT_FIELDS)) {
        fail('draft/invalid-document-shape');
    }
    if (!Number.isInteger(document.contentSchemaVersion)
        || document.contentSchemaVersion < 1
        || document.contentSchemaVersion > INVITATION_CONTENT_SCHEMA_VERSION) {
        fail('draft/unsupported-content-schema');
    }
    if (document.eventId !== safeEventId) fail('draft/event-ownership-mismatch');
    if (!isTimestamp(document.updatedAt)) fail('draft/invalid-updated-at');
    const updatedBy = String(document.updatedBy ?? '');
    if (!updatedBy || updatedBy.length > 128) fail('draft/invalid-updated-by');
    const settingsKeys = Object.keys(document.settings ?? {});
    const validSettingsShape = exactKeys(document.settings, SETTINGS_FIELDS)
        || exactKeys(document.settings, LEGACY_SETTINGS_FIELDS);
    if (!validSettingsShape) fail('draft/invalid-settings-shape');

    const normalized = {
        schemaVersion: INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION,
        contentSchemaVersion: INVITATION_CONTENT_SCHEMA_VERSION,
        eventId: safeEventId,
        theme: normalizeTheme(document.theme),
        sections: normalizeSections(document.sections),
        content: normalizeGeneralContent(document.content),
        locations: normalizeCollection('locations', document.locations),
        itinerary: normalizeCollection('itinerary', document.itinerary),
        gifts: normalizeCollection('gifts', document.gifts),
        accommodations: normalizeCollection('accommodations', document.accommodations ?? []),
        links: normalizeCollection('links', document.links),
        appearance: normalizeAppearance(document.appearance),
        settings: normalizeSettings(document.settings),
        updatedAt: document.updatedAt,
        updatedBy
    };

    const legacyAccessDocument = hasLegacyAccessShape(document);
    const legacySettingsDocument = exactKeys(document.settings, LEGACY_SETTINGS_FIELDS);
    // Drafts created before the Aloha opening contract do not contain the
    // optional welcome.opening object. Accept that legacy shape while keeping
    // the normalized defaults in memory; it is not an automatic migration.
    const legacyOpeningDocument = !Object.hasOwn(document.content?.welcome ?? {}, 'opening');
    if (isCurrentDocument && document.contentSchemaVersion === INVITATION_CONTENT_SCHEMA_VERSION) {
        const comparable = { ...normalized, updatedAt: document.updatedAt };
        let canonicalDocument = canonicalizeSupportedLegacyDraftForComparison(document);
        if (legacyAccessDocument || legacySettingsDocument || legacyOpeningDocument) {
            canonicalDocument = cloneInvitationValue(canonicalDocument);
        }
        if (legacyAccessDocument) canonicalDocument.content.access = normalized.content.access;
        if (legacySettingsDocument) canonicalDocument.settings = normalized.settings;
        if (legacyOpeningDocument) canonicalDocument.content.welcome = normalized.content.welcome;
        if (stableStringify(comparable) !== stableStringify(canonicalDocument)) {
            const differences = findCanonicalDifferences(canonicalDocument, comparable, { limit: 30 });
            console.error(
                '[Draft canonical mismatch phase121]',
                JSON.stringify({ reason: 'normalized-diff', differences }, null, 2)
            );
            fail('draft/non-canonical-document');
        }
    }
    return Object.freeze(cloneInvitationValue(normalized));
}

export function createInvitationDraftFingerprint(draft, { eventId = draft?.eventId } = {}) {
    return stableStringify(createPayload(draft, eventId));
}

export function createInvitationDraftSnapshot(draft, { eventId = draft?.eventId } = {}) {
    const payload = createPayload(draft, eventId);
    return Object.freeze(cloneInvitationValue(Object.fromEntries(
        SNAPSHOT_FIELDS.map((field) => [field, payload[field]])
    )));
}

export function getPersistedGeneralContentPaths() {
    return [...GENERAL_CONTENT_PATHS];
}
