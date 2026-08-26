import {
    INVITATION_CONTENT_SCHEMA_VERSION,
    INVITATION_EDITABLE_FIELDS,
    cloneInvitationValue,
    createInvitationContent,
    getDraftValue,
    setDraftValue
} from './content-schema.js?v=phase171-demo-mode-20260826';
import { validateInvitationDraft } from './builder-validation.js?v=phase89-dress-code-media-20260820';
import { getInvitationFormat, getPackageById, getSectionById } from './section-registry.js?v=phase93-package-sections-format-20260821';
import { getThemeById } from './theme-registry.js?v=phase3-logistics-20260813';
import { normalizeAppearance } from './appearance-schema.js?v=phase86-appearance-20260820';
import { normalizeDeviceAvailability } from './device-availability.js?v=phase168-device-availability-20260825';
import {
    DRESS_COLOR_GROUPS,
    createDressColor,
    normalizeEntity
} from './logistics-schema.js?v=phase145-native-ics-calendar-handoff-20260825';
import {
    CURRENT_DRAFT_SCHEMA_VERSION,
    migrateInvitationDraftToCurrentSchema
} from './draft-migrations.js?v=phase171-demo-mode-20260826';

export const INVITATION_DRAFT_DOCUMENT_ID = 'draft';
export const INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION = CURRENT_DRAFT_SCHEMA_VERSION;

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
const SETTINGS_FIELDS = Object.freeze(['renderMode', 'packageId', 'format', 'deviceAvailability', 'demoMode']);
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
    return {
        renderMode,
        packageId: normalizedPackage,
        format,
        deviceAvailability: normalizeDeviceAvailability(settings?.deviceAvailability),
        demoMode: settings?.demoMode === undefined ? false : (() => {
            if (typeof settings.demoMode !== 'boolean') fail('draft/invalid-demo-mode');
            return settings.demoMode;
        })()
    };
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
    const isLegacyEnvelope = document?.schemaVersion === 1;
    const isCurrentEnvelope = document?.schemaVersion === INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION;
    if (!isLegacyEnvelope && !isCurrentEnvelope) {
        fail(document?.schemaVersion > INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION
            ? 'draft/unsupported-future-schema'
            : 'draft/unsupported-schema');
    }
    if (!exactKeys(document, isLegacyEnvelope ? LEGACY_DOCUMENT_FIELDS : DOCUMENT_FIELDS)) {
        fail('draft/invalid-document-shape');
    }
    const migratedDocument = migrateInvitationDraftToCurrentSchema(document);
    if (migratedDocument.eventId !== safeEventId) fail('draft/event-ownership-mismatch');
    if (!isTimestamp(migratedDocument.updatedAt)) fail('draft/invalid-updated-at');
    const updatedBy = String(migratedDocument.updatedBy ?? '');
    if (!updatedBy || updatedBy.length > 128) fail('draft/invalid-updated-by');
    if (!exactKeys(migratedDocument, DOCUMENT_FIELDS)) fail('draft/invalid-document-shape');
    if (!exactKeys(migratedDocument.settings, SETTINGS_FIELDS)) fail('draft/invalid-settings-shape');

    const normalized = {
        schemaVersion: INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION,
        contentSchemaVersion: INVITATION_CONTENT_SCHEMA_VERSION,
        eventId: safeEventId,
        theme: normalizeTheme(migratedDocument.theme),
        sections: normalizeSections(migratedDocument.sections),
        content: normalizeGeneralContent(migratedDocument.content),
        locations: normalizeCollection('locations', migratedDocument.locations),
        itinerary: normalizeCollection('itinerary', migratedDocument.itinerary),
        gifts: normalizeCollection('gifts', migratedDocument.gifts),
        accommodations: normalizeCollection('accommodations', migratedDocument.accommodations),
        links: normalizeCollection('links', migratedDocument.links),
        appearance: normalizeAppearance(migratedDocument.appearance),
        settings: normalizeSettings(migratedDocument.settings),
        updatedAt: migratedDocument.updatedAt,
        updatedBy
    };

    if (migratedDocument.contentSchemaVersion === INVITATION_CONTENT_SCHEMA_VERSION) {
        const comparable = { ...normalized, updatedAt: migratedDocument.updatedAt };
        const canonicalDocument = migratedDocument;
        if (stableStringify(comparable) !== stableStringify(canonicalDocument)) {
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
