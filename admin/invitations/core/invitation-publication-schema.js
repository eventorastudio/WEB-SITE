import { INVITATION_CONTENT_SCHEMA_VERSION, cloneInvitationValue } from './content-schema.js?v=phase61-draft-persistence-20260817';
import {
    INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION,
    createInvitationDraftSnapshot,
    deserializeInvitationDraft
} from './draft-persistence-schema.js?v=phase86-appearance-20260820';

export const INVITATION_PUBLICATION_DOCUMENT_ID = 'publication';
export const INVITATION_PUBLICATION_SCHEMA_VERSION = 2;
export const INVITATION_REVISION_SCHEMA_VERSION = 1;

const SAFE_EVENT_ID = /^[A-Za-z0-9_-]{1,150}$/;
const SAFE_REVISION_ID = /^REV-[0-9]{6,}$/;
const SAFE_PUBLIC_KEY = /^[a-f0-9]{48}$/;
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
const PUBLICATION_FIELDS = Object.freeze([
    'schemaVersion',
    'eventId',
    'currentRevisionId',
    'currentRevisionNumber',
    'publicKey',
    'publishedAt',
    'publishedBy'
]);
const LEGACY_PUBLICATION_FIELDS = Object.freeze(
    PUBLICATION_FIELDS.filter((field) => field !== 'publicKey')
);
const REVISION_FIELDS = Object.freeze([
    'schemaVersion',
    'contentSchemaVersion',
    'eventId',
    'revisionNumber',
    ...SNAPSHOT_FIELDS,
    'publishedAt',
    'publishedBy'
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
    if (!SAFE_EVENT_ID.test(normalized)) fail('publication/invalid-event-id');
    return normalized;
}

function assertUid(uid) {
    const normalized = String(uid ?? '');
    if (!normalized || normalized.length > 128) fail('publication/published-by-required');
    return normalized;
}

export function isInvitationPublicKey(value) {
    return SAFE_PUBLIC_KEY.test(String(value ?? ''));
}

export function assertInvitationPublicKey(value) {
    const normalized = String(value ?? '');
    if (!isInvitationPublicKey(normalized)) fail('publication/invalid-public-key');
    return normalized;
}

export function createInvitationPublicKey({ cryptoApi = globalThis.crypto } = {}) {
    if (typeof cryptoApi?.getRandomValues !== 'function') fail('publication/random-source-unavailable');
    const bytes = new Uint8Array(24);
    cryptoApi.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertRevisionNumber(value) {
    if (!Number.isInteger(value) || value < 1 || value > 999999999) {
        fail('publication/invalid-revision-number');
    }
    return value;
}

function assertTimestamp(value, code) {
    const valid = (value instanceof Date && !Number.isNaN(value.getTime()))
        || (typeof value?.toDate === 'function' && value.toDate() instanceof Date)
        || Number.isFinite(value?.seconds ?? value?._seconds);
    if (!valid) fail(code);
    return value;
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableStringify(value) {
    return JSON.stringify(stableValue(value));
}

function pickSnapshot(source) {
    return Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, source[field]]));
}

export function createInvitationRevisionId(revisionNumber) {
    return `REV-${String(assertRevisionNumber(revisionNumber)).padStart(6, '0')}`;
}

export function serializeInvitationRevision(draft, {
    eventId = draft?.eventId,
    revisionNumber,
    publishedAt,
    publishedBy
} = {}) {
    const safeEventId = assertEventId(eventId);
    const safeRevisionNumber = assertRevisionNumber(revisionNumber);
    if (publishedAt == null) fail('publication/published-at-required');
    return {
        schemaVersion: INVITATION_REVISION_SCHEMA_VERSION,
        contentSchemaVersion: INVITATION_CONTENT_SCHEMA_VERSION,
        eventId: safeEventId,
        revisionNumber: safeRevisionNumber,
        ...createInvitationDraftSnapshot(draft, { eventId: safeEventId }),
        publishedAt,
        publishedBy: assertUid(publishedBy)
    };
}

export function deserializeInvitationRevision(document, expectedEventId, {
    expectedRevisionId = null,
    expectedRevisionNumber = null
} = {}) {
    const safeEventId = assertEventId(expectedEventId);
    if (!exactKeys(document, REVISION_FIELDS)) fail('publication/invalid-revision-shape');
    if (document.schemaVersion !== INVITATION_REVISION_SCHEMA_VERSION) {
        fail('publication/unsupported-revision-schema');
    }
    if (document.contentSchemaVersion !== INVITATION_CONTENT_SCHEMA_VERSION) {
        fail('publication/unsupported-content-schema');
    }
    if (document.eventId !== safeEventId) fail('publication/event-ownership-mismatch');
    const revisionNumber = assertRevisionNumber(document.revisionNumber);
    if (expectedRevisionNumber != null && revisionNumber !== expectedRevisionNumber) {
        fail('publication/revision-number-mismatch');
    }
    if (expectedRevisionId != null && createInvitationRevisionId(revisionNumber) !== expectedRevisionId) {
        fail('publication/revision-id-mismatch');
    }
    const publishedAt = assertTimestamp(document.publishedAt, 'publication/invalid-published-at');
    const publishedBy = assertUid(document.publishedBy);
    const normalizedDraft = deserializeInvitationDraft({
        schemaVersion: INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION,
        contentSchemaVersion: document.contentSchemaVersion,
        eventId: safeEventId,
        ...pickSnapshot(document),
        updatedAt: publishedAt,
        updatedBy: publishedBy
    }, safeEventId);
    return Object.freeze(cloneInvitationValue({
        schemaVersion: INVITATION_REVISION_SCHEMA_VERSION,
        contentSchemaVersion: INVITATION_CONTENT_SCHEMA_VERSION,
        eventId: safeEventId,
        revisionNumber,
        ...pickSnapshot(normalizedDraft),
        publishedAt,
        publishedBy
    }));
}

export function serializeInvitationPublication({
    eventId,
    currentRevisionId,
    currentRevisionNumber,
    publicKey,
    publishedAt,
    publishedBy
} = {}) {
    const safeRevisionNumber = assertRevisionNumber(currentRevisionNumber);
    const safeRevisionId = String(currentRevisionId ?? '');
    if (!SAFE_REVISION_ID.test(safeRevisionId)
        || safeRevisionId !== createInvitationRevisionId(safeRevisionNumber)) {
        fail('publication/invalid-current-revision-id');
    }
    if (publishedAt == null) fail('publication/published-at-required');
    return {
        schemaVersion: INVITATION_PUBLICATION_SCHEMA_VERSION,
        eventId: assertEventId(eventId),
        currentRevisionId: safeRevisionId,
        currentRevisionNumber: safeRevisionNumber,
        publicKey: assertInvitationPublicKey(publicKey),
        publishedAt,
        publishedBy: assertUid(publishedBy)
    };
}

export function deserializeInvitationPublication(document, expectedEventId) {
    const safeEventId = assertEventId(expectedEventId);
    const isLegacy = document?.schemaVersion === 1;
    const isCurrent = document?.schemaVersion === INVITATION_PUBLICATION_SCHEMA_VERSION;
    if (!isLegacy && !isCurrent) {
        fail('publication/unsupported-metadata-schema');
    }
    if (!exactKeys(document, isLegacy ? LEGACY_PUBLICATION_FIELDS : PUBLICATION_FIELDS)) {
        fail('publication/invalid-metadata-shape');
    }
    if (document.eventId !== safeEventId) fail('publication/event-ownership-mismatch');
    const currentRevisionNumber = assertRevisionNumber(document.currentRevisionNumber);
    const currentRevisionId = String(document.currentRevisionId ?? '');
    if (!SAFE_REVISION_ID.test(currentRevisionId)
        || currentRevisionId !== createInvitationRevisionId(currentRevisionNumber)) {
        fail('publication/invalid-current-revision-id');
    }
    return Object.freeze({
        schemaVersion: document.schemaVersion,
        eventId: safeEventId,
        currentRevisionId,
        currentRevisionNumber,
        publicKey: isCurrent ? assertInvitationPublicKey(document.publicKey) : null,
        publishedAt: assertTimestamp(document.publishedAt, 'publication/invalid-published-at'),
        publishedBy: assertUid(document.publishedBy)
    });
}

export function createInvitationPublicationFingerprint(draft, { eventId = draft?.eventId } = {}) {
    return stableStringify(createInvitationDraftSnapshot(draft, { eventId }));
}

export function createInvitationRevisionFingerprint(revision, expectedEventId, options = {}) {
    return stableStringify(pickSnapshot(deserializeInvitationRevision(revision, expectedEventId, options)));
}
