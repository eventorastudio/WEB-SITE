import { isExactDate, validateRsvpConfig } from './builder-validation.js?v=phase52-rsvp-persistence-20260816';
import { INVITATION_CONTENT_SCHEMA_VERSION } from './content-schema.js?v=phase52-rsvp-persistence-20260816';
import {
    RSVP_EDITABLE_FIELD_DEFINITIONS,
    RSVP_GUEST_POLICIES,
    RSVP_METHODS,
    normalizeRsvpConfig
} from './rsvp-schema.js?v=phase52-rsvp-persistence-20260816';

export const RSVP_PERSISTENCE_SCHEMA_VERSION = 1;
export const RSVP_DOCUMENT_ID = 'rsvp';

export const RSVP_PERSISTED_TOUCHED_PATHS = Object.freeze(
    RSVP_EDITABLE_FIELD_DEFINITIONS.map(([path]) => path)
);

const SAFE_EVENT_ID = /^[A-Za-z0-9_-]{1,150}$/;
const SAFE_UID = /^.{1,128}$/;
const RSVP_DOCUMENT_FIELDS = Object.freeze([
    'buttonLabel',
    'contentSchemaVersion',
    'deadline',
    'enabled',
    'eventId',
    'guestPolicy',
    'message',
    'method',
    'responses',
    'schemaVersion',
    'title',
    'touchedPaths',
    'updatedAt',
    'updatedBy',
    'whatsapp'
]);
const RSVP_FIELDS = Object.freeze([
    'buttonLabel', 'deadline', 'enabled', 'guestPolicy', 'message', 'method',
    'responses', 'title', 'whatsapp'
]);
const WHATSAPP_FIELDS = Object.freeze(['message', 'phone']);
const RESPONSE_FIELDS = Object.freeze(['acceptedLabel', 'confirmationMessage', 'declinedLabel']);
const PATH_LIMITS = Object.freeze(Object.fromEntries(
    RSVP_EDITABLE_FIELD_DEFINITIONS.map(([path, type, maxLength]) => [path, { type, maxLength }])
));

function persistenceError(code, details = {}) {
    const error = new TypeError(code);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function isRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function exactKeys(value, fields) {
    if (!isRecord(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === fields.length && fields.every((field, index) => field === keys[index]);
}

function readPath(value, path) {
    return path.replace(/^content\.rsvp\.?/, '').split('.').filter(Boolean)
        .reduce((current, key) => current?.[key], value);
}

export function assertSafeRsvpEventId(eventId) {
    const normalized = String(eventId ?? '');
    if (!SAFE_EVENT_ID.test(normalized)) throw persistenceError('rsvp/invalid-event-id');
    return normalized;
}

export function normalizeRsvpTouchedPaths(paths = []) {
    const source = Array.isArray(paths) ? new Set(paths) : new Set();
    return RSVP_PERSISTED_TOUCHED_PATHS.filter((path) => source.has(path));
}

function assertRsvpSource(config) {
    if (!isRecord(config)) throw persistenceError('rsvp/invalid-config-shape');
    if (config.whatsapp !== undefined && !isRecord(config.whatsapp)) {
        throw persistenceError('rsvp/invalid-whatsapp-shape');
    }
    if (config.responses !== undefined && !isRecord(config.responses)) {
        throw persistenceError('rsvp/invalid-responses-shape');
    }

    for (const [path, definition] of Object.entries(PATH_LIMITS)) {
        const value = readPath(config, path);
        if (value === undefined) continue;
        if (definition.type === 'boolean') {
            if (typeof value !== 'boolean') throw persistenceError('rsvp/invalid-field-type', { path });
            continue;
        }
        if (typeof value !== 'string') throw persistenceError('rsvp/invalid-field-type', { path });
        if (value.length > definition.maxLength) throw persistenceError('rsvp/field-too-long', { path });
    }

    if (config.method !== undefined && !RSVP_METHODS.includes(config.method)) {
        throw persistenceError('rsvp/invalid-method');
    }
    if (config.guestPolicy !== undefined && !RSVP_GUEST_POLICIES.includes(config.guestPolicy)) {
        throw persistenceError('rsvp/invalid-guest-policy');
    }
    if (config.method === 'whatsapp' && !/^\+?[0-9 ()-]{7,32}$/.test(config.whatsapp?.phone ?? '')) {
        throw persistenceError('rsvp/invalid-whatsapp-phone');
    }
    if (config.deadline && !isExactDate(config.deadline)) {
        throw persistenceError('rsvp/invalid-deadline');
    }
}

function createSemanticPayload(config, { eventId, touchedPaths = [] } = {}) {
    assertRsvpSource(config);
    const normalized = normalizeRsvpConfig(config);
    const validationErrors = validateRsvpConfig(normalized);
    if (Object.keys(validationErrors).length) {
        throw persistenceError('rsvp/invalid-config', { validationErrors });
    }
    return {
        schemaVersion: RSVP_PERSISTENCE_SCHEMA_VERSION,
        contentSchemaVersion: INVITATION_CONTENT_SCHEMA_VERSION,
        eventId: assertSafeRsvpEventId(eventId),
        enabled: normalized.enabled,
        title: normalized.title,
        message: normalized.message,
        buttonLabel: normalized.buttonLabel,
        deadline: normalized.deadline,
        method: normalized.method,
        whatsapp: {
            phone: normalized.whatsapp.phone,
            message: normalized.whatsapp.message
        },
        guestPolicy: normalized.guestPolicy,
        responses: {
            acceptedLabel: normalized.responses.acceptedLabel,
            declinedLabel: normalized.responses.declinedLabel,
            confirmationMessage: normalized.responses.confirmationMessage
        },
        touchedPaths: normalizeRsvpTouchedPaths(touchedPaths)
    };
}

export function serializeRsvpConfig(config, {
    eventId,
    touchedPaths = [],
    updatedAt,
    updatedBy
} = {}) {
    if (updatedAt == null) throw persistenceError('rsvp/updated-at-required');
    const uid = String(updatedBy ?? '');
    if (!SAFE_UID.test(uid)) throw persistenceError('rsvp/updated-by-required');
    return {
        ...createSemanticPayload(config, { eventId, touchedPaths }),
        updatedAt,
        updatedBy: uid
    };
}

function assertPersistedTouchedPaths(paths) {
    if (!Array.isArray(paths) || paths.length > RSVP_PERSISTED_TOUCHED_PATHS.length) {
        throw persistenceError('rsvp/invalid-touched-paths');
    }
    if (new Set(paths).size !== paths.length || paths.some((path) => !RSVP_PERSISTED_TOUCHED_PATHS.includes(path))) {
        throw persistenceError('rsvp/invalid-touched-paths');
    }
}

export function deserializeRsvpConfig(document, expectedEventId) {
    if (!exactKeys(document, RSVP_DOCUMENT_FIELDS)) throw persistenceError('rsvp/invalid-document-shape');
    if (document.schemaVersion !== RSVP_PERSISTENCE_SCHEMA_VERSION) throw persistenceError('rsvp/unsupported-schema');
    if (document.contentSchemaVersion !== INVITATION_CONTENT_SCHEMA_VERSION) {
        throw persistenceError('rsvp/unsupported-content-schema');
    }
    const eventId = assertSafeRsvpEventId(expectedEventId);
    if (document.eventId !== eventId) throw persistenceError('rsvp/cross-event-document');
    if (!exactKeys(document.whatsapp, WHATSAPP_FIELDS)) throw persistenceError('rsvp/invalid-whatsapp-shape');
    if (!exactKeys(document.responses, RESPONSE_FIELDS)) throw persistenceError('rsvp/invalid-responses-shape');
    assertPersistedTouchedPaths(document.touchedPaths);
    if (document.updatedAt == null || !SAFE_UID.test(String(document.updatedBy ?? ''))) {
        throw persistenceError('rsvp/invalid-audit-fields');
    }

    const config = Object.fromEntries(RSVP_FIELDS.map((field) => [field, document[field]]));
    assertRsvpSource(config);
    const normalized = normalizeRsvpConfig(config);
    const validationErrors = validateRsvpConfig(normalized);
    if (Object.keys(validationErrors).length) {
        throw persistenceError('rsvp/invalid-config', { validationErrors });
    }
    return Object.freeze({
        eventId,
        rsvp: normalized,
        touchedPaths: normalizeRsvpTouchedPaths(document.touchedPaths),
        schemaVersion: document.schemaVersion,
        contentSchemaVersion: document.contentSchemaVersion,
        updatedAt: document.updatedAt,
        updatedBy: document.updatedBy
    });
}

export function createRsvpPersistenceFingerprint(config, { eventId, touchedPaths = [] } = {}) {
    return JSON.stringify(createSemanticPayload(config, { eventId, touchedPaths }));
}
