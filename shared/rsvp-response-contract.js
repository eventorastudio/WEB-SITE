import {
    assertRsvpAccessEventId,
    assertRsvpAccessGuestId
} from './rsvp-access-contract.js?v=phase54-public-rsvp-20260817';

export const RSVP_RESPONSE_SCHEMA_VERSION = 1;
export const RSVP_RESPONSE_STATUSES = Object.freeze(['accepted', 'declined']);

const RESPONSE_FIELDS = Object.freeze([
    'eventId',
    'guestId',
    'passesConfirmed',
    'respondedAt',
    'schemaVersion',
    'status'
]);

export class RsvpResponseContractError extends Error {
    constructor(code) {
        super(code);
        this.name = 'RsvpResponseContractError';
        this.code = code;
    }
}

export function assertRsvpResponseSelection({ status, passesConfirmed } = {}, {
    guestPolicy,
    passLimit
} = {}) {
    assertBaseSelection({ status, passesConfirmed });
    if (!Number.isInteger(passLimit) || passLimit < 1 || passLimit > 999) {
        throw new RsvpResponseContractError('rsvp-response/invalid-pass-limit');
    }
    if (status === 'declined') {
        if (passesConfirmed !== 0) throw new RsvpResponseContractError('rsvp-response/declined-passes-must-be-zero');
    } else if (guestPolicy === 'assigned-only') {
        if (passesConfirmed !== passLimit) throw new RsvpResponseContractError('rsvp-response/assigned-passes-required');
    } else if (guestPolicy === 'select-up-to-assigned') {
        if (passesConfirmed < 1 || passesConfirmed > passLimit) {
            throw new RsvpResponseContractError('rsvp-response/passes-out-of-range');
        }
    } else {
        throw new RsvpResponseContractError('rsvp-response/invalid-guest-policy');
    }
    return Object.freeze({ status, passesConfirmed });
}

export function buildRsvpResponseDocument({
    eventId,
    guestId,
    status,
    passesConfirmed,
    respondedAt,
    guestPolicy,
    passLimit
} = {}) {
    if (respondedAt == null) throw new RsvpResponseContractError('rsvp-response/responded-at-required');
    const selection = assertRsvpResponseSelection({ status, passesConfirmed }, { guestPolicy, passLimit });
    return {
        schemaVersion: RSVP_RESPONSE_SCHEMA_VERSION,
        eventId: assertRsvpAccessEventId(eventId),
        guestId: assertRsvpAccessGuestId(guestId),
        status: selection.status,
        passesConfirmed: selection.passesConfirmed,
        respondedAt
    };
}

export function deserializeRsvpResponseDocument(document, {
    expectedEventId,
    expectedGuestId,
    guestPolicy,
    passLimit
} = {}) {
    if (!hasExactKeys(document, RESPONSE_FIELDS)) {
        throw new RsvpResponseContractError('rsvp-response/invalid-document-shape');
    }
    if (document.schemaVersion !== RSVP_RESPONSE_SCHEMA_VERSION) {
        throw new RsvpResponseContractError('rsvp-response/unsupported-schema');
    }
    const eventId = assertRsvpAccessEventId(document.eventId);
    const guestId = assertRsvpAccessGuestId(document.guestId);
    if (expectedEventId != null && eventId !== assertRsvpAccessEventId(expectedEventId)) {
        throw new RsvpResponseContractError('rsvp-response/event-ownership-mismatch');
    }
    if (expectedGuestId != null && guestId !== assertRsvpAccessGuestId(expectedGuestId)) {
        throw new RsvpResponseContractError('rsvp-response/guest-ownership-mismatch');
    }
    const selection = guestPolicy === undefined && passLimit === undefined
        ? assertBaseSelection(document)
        : assertRsvpResponseSelection(document, { guestPolicy, passLimit });
    assertTimestamp(document.respondedAt);
    return Object.freeze({
        schemaVersion: RSVP_RESPONSE_SCHEMA_VERSION,
        eventId,
        guestId,
        status: selection.status,
        passesConfirmed: selection.passesConfirmed,
        respondedAt: document.respondedAt
    });
}

function assertBaseSelection({ status, passesConfirmed } = {}) {
    if (!RSVP_RESPONSE_STATUSES.includes(status)) {
        throw new RsvpResponseContractError('rsvp-response/invalid-status');
    }
    if (!Number.isInteger(passesConfirmed) || passesConfirmed < 0 || passesConfirmed > 999) {
        throw new RsvpResponseContractError('rsvp-response/invalid-passes');
    }
    if (status === 'declined' && passesConfirmed !== 0) {
        throw new RsvpResponseContractError('rsvp-response/declined-passes-must-be-zero');
    }
    if (status === 'accepted' && passesConfirmed < 1) {
        throw new RsvpResponseContractError('rsvp-response/invalid-passes');
    }
    return Object.freeze({ status, passesConfirmed });
}

export function areRsvpResponsesEquivalent(response, selection) {
    return Boolean(response)
        && response.status === selection?.status
        && response.passesConfirmed === selection?.passesConfirmed;
}

export function areRsvpResponsesLogicallyEqual(left, right) {
    return Boolean(left && right)
        && left.schemaVersion === right.schemaVersion
        && left.eventId === right.eventId
        && left.guestId === right.guestId
        && left.status === right.status
        && left.passesConfirmed === right.passesConfirmed
        && timestampMilliseconds(left.respondedAt) === timestampMilliseconds(right.respondedAt);
}

function assertTimestamp(value) {
    if (timestampMilliseconds(value) == null) {
        throw new RsvpResponseContractError('rsvp-response/invalid-responded-at');
    }
}

function timestampMilliseconds(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
    if (!value || typeof value.toDate !== 'function') return null;
    try {
        const date = value.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
    } catch {
        return null;
    }
}

function hasExactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && expected.every((field, index) => field === keys[index]);
}
