import {
    assertRsvpAccessEventId,
    assertRsvpAccessGuestId
} from './rsvp-access-contract.js?v=phase56-rsvp-operations-20260817';
import {
    RSVP_RESPONSE_STATUSES
} from './rsvp-response-contract.js?v=phase56-rsvp-operations-20260817';

export const RSVP_STATE_SCHEMA_VERSION = 1;
export const RSVP_CONFLICT_TYPE_SAME_TIMESTAMP = 'same-responded-at';

const STATE_FIELDS = Object.freeze([
    'eventId',
    'guestId',
    'passesConfirmed',
    'respondedAt',
    'schemaVersion',
    'status',
    'syncedAt'
]);
const CONFLICT_FIELDS = Object.freeze([
    'candidate',
    'canonical',
    'conflictType',
    'createdAt',
    'eventId',
    'guestId',
    'respondedAt'
]);
const COMPARABLE_FIELDS = Object.freeze(['passesConfirmed', 'status']);

export class RsvpOperationsContractError extends Error {
    constructor(code) {
        super(code);
        this.name = 'RsvpOperationsContractError';
        this.code = code;
    }
}

export function deserializeRsvpStateDocument(document, {
    expectedEventId,
    expectedGuestId
} = {}) {
    if (!hasExactKeys(document, STATE_FIELDS)) fail('rsvp-operations/invalid-state-shape');
    if (document.schemaVersion !== RSVP_STATE_SCHEMA_VERSION) fail('rsvp-operations/unsupported-state-schema');
    const eventId = assertEventId(document.eventId);
    const guestId = assertGuestId(document.guestId);
    assertOwnership(eventId, guestId, expectedEventId, expectedGuestId, 'state');
    const comparable = normalizeComparable({
        status: document.status,
        passesConfirmed: document.passesConfirmed
    }, 'state');
    assertTimestamp(document.respondedAt, 'rsvp-operations/invalid-state-responded-at');
    assertTimestamp(document.syncedAt, 'rsvp-operations/invalid-state-synced-at');
    return Object.freeze({
        schemaVersion: RSVP_STATE_SCHEMA_VERSION,
        eventId,
        guestId,
        ...comparable,
        respondedAt: document.respondedAt,
        syncedAt: document.syncedAt
    });
}

export function buildRsvpConflictDocument({
    eventId,
    guestId,
    respondedAt,
    canonical,
    candidate,
    createdAt
} = {}) {
    if (createdAt == null) fail('rsvp-operations/conflict-created-at-required');
    const safeEventId = assertEventId(eventId);
    const safeGuestId = assertGuestId(guestId);
    assertTimestamp(respondedAt, 'rsvp-operations/invalid-conflict-responded-at');
    const safeCanonical = normalizeComparable(canonical, 'conflict-canonical');
    const safeCandidate = normalizeComparable(candidate, 'conflict-candidate');
    if (sameComparable(safeCanonical, safeCandidate)) fail('rsvp-operations/not-a-conflict');
    return {
        eventId: safeEventId,
        guestId: safeGuestId,
        conflictType: RSVP_CONFLICT_TYPE_SAME_TIMESTAMP,
        respondedAt,
        canonical: safeCanonical,
        candidate: safeCandidate,
        createdAt
    };
}

export function deserializeRsvpConflictDocument(document, {
    expectedEventId,
    expectedGuestId
} = {}) {
    if (!hasExactKeys(document, CONFLICT_FIELDS)) fail('rsvp-operations/invalid-conflict-shape');
    const eventId = assertEventId(document.eventId);
    const guestId = assertGuestId(document.guestId);
    assertOwnership(eventId, guestId, expectedEventId, expectedGuestId, 'conflict');
    if (document.conflictType !== RSVP_CONFLICT_TYPE_SAME_TIMESTAMP) {
        fail('rsvp-operations/invalid-conflict-type');
    }
    assertTimestamp(document.respondedAt, 'rsvp-operations/invalid-conflict-responded-at');
    assertTimestamp(document.createdAt, 'rsvp-operations/invalid-conflict-created-at');
    const canonical = normalizeComparable(document.canonical, 'conflict-canonical');
    const candidate = normalizeComparable(document.candidate, 'conflict-candidate');
    if (sameComparable(canonical, candidate)) fail('rsvp-operations/not-a-conflict');
    return Object.freeze({
        eventId,
        guestId,
        conflictType: RSVP_CONFLICT_TYPE_SAME_TIMESTAMP,
        respondedAt: document.respondedAt,
        canonical,
        candidate,
        createdAt: document.createdAt
    });
}

export function projectRsvpOperationalView(state = null, { hasConflict = false } = {}) {
    if (!state) {
        return Object.freeze({
            status: 'pending',
            label: 'Pendiente',
            passesConfirmed: null,
            passesLabel: 'Sin respuesta',
            hasConflict: hasConflict === true
        });
    }
    const safeState = deserializeRsvpStateDocument(state);
    const accepted = safeState.status === 'accepted';
    const passes = safeState.passesConfirmed;
    return Object.freeze({
        status: accepted ? 'confirmed' : 'declined',
        label: accepted ? 'Confirmado' : 'No asistirá',
        passesConfirmed: passes,
        passesLabel: `${passes} ${passes === 1 ? 'pase confirmado' : 'pases confirmados'}`,
        hasConflict: hasConflict === true
    });
}

function normalizeComparable(value, source) {
    if (!hasExactKeys(value, COMPARABLE_FIELDS)) fail(`rsvp-operations/invalid-${source}`);
    if (!RSVP_RESPONSE_STATUSES.includes(value.status)) fail(`rsvp-operations/invalid-${source}`);
    const passes = value.passesConfirmed;
    if (!Number.isInteger(passes) || passes < 0 || passes > 999) fail(`rsvp-operations/invalid-${source}`);
    if (value.status === 'accepted' && passes < 1) fail(`rsvp-operations/invalid-${source}`);
    if (value.status === 'declined' && passes !== 0) fail(`rsvp-operations/invalid-${source}`);
    return Object.freeze({ status: value.status, passesConfirmed: passes });
}

function sameComparable(left, right) {
    return left.status === right.status && left.passesConfirmed === right.passesConfirmed;
}

function assertOwnership(eventId, guestId, expectedEventId, expectedGuestId, source) {
    if (expectedEventId != null && eventId !== assertEventId(expectedEventId)) {
        fail(`rsvp-operations/${source}-event-mismatch`);
    }
    if (expectedGuestId != null && guestId !== assertGuestId(expectedGuestId)) {
        fail(`rsvp-operations/${source}-guest-mismatch`);
    }
}

function assertEventId(value) {
    try {
        return assertRsvpAccessEventId(value);
    } catch {
        fail('rsvp-operations/invalid-event-id');
    }
}

function assertGuestId(value) {
    try {
        return assertRsvpAccessGuestId(value);
    } catch {
        fail('rsvp-operations/invalid-guest-id');
    }
}

function assertTimestamp(value, code) {
    if (!value || typeof value.toDate !== 'function') fail(code);
    try {
        const date = value.toDate();
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) fail(code);
    } catch {
        fail(code);
    }
}

function hasExactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && expected.every((field, index) => field === keys[index]);
}

function fail(code) {
    throw new RsvpOperationsContractError(code);
}
