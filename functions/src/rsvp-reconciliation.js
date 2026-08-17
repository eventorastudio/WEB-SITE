import { FieldValue } from 'firebase-admin/firestore';

import { createEventStatsMutation } from '../generated/event-stats.js';
import { RSVP_GUEST_FIELDS, createGuestRsvpPatch } from '../generated/guest-contract.js';
import {
    RSVP_RESPONSE_STATUSES,
    deserializeRsvpResponseDocument
} from '../generated/rsvp-response-contract.js';
import {
    assertRsvpAccessEventId,
    assertRsvpAccessGuestId,
    assertRsvpAccessToken
} from '../generated/rsvp-access-contract.js';

export const RSVP_STATE_SCHEMA_VERSION = 1;

const STATE_FIELDS = Object.freeze([
    'eventId',
    'guestId',
    'passesConfirmed',
    'respondedAt',
    'schemaVersion',
    'status',
    'syncedAt'
]);

export class RsvpReconciliationError extends Error {
    constructor(code) {
        super(code);
        this.name = 'RsvpReconciliationError';
        this.code = code;
    }
}

export async function reconcileCurrentRsvpResponse({
    db,
    eventId,
    token,
    references = null,
    beforeCommit = null,
    serverTimestampFactory = defaultServerTimestampFactory
} = {}) {
    if (!db || typeof db.runTransaction !== 'function') fail('rsvp-sync/invalid-firestore');
    if (typeof serverTimestampFactory !== 'function') fail('rsvp-sync/invalid-clock');
    const safeEventId = assertEventId(eventId);
    const safeToken = assertToken(token);
    const responseReference = references?.response
        ?? db.collection('eventos').doc(safeEventId).collection('rsvpResponses').doc(safeToken);

    return db.runTransaction(async (transaction) => {
        const responseSnapshot = await transaction.get(responseReference);
        if (!responseSnapshot.exists) return Object.freeze({ status: 'missing', eventId: safeEventId });
        const response = validateResponse(responseSnapshot.data(), safeEventId);
        const refs = resolveReferences(db, safeEventId, response.guestId, references);
        const stateSnapshot = await transaction.get(refs.state);
        if (stateSnapshot.exists) {
            const currentState = validateState(stateSnapshot.data(), safeEventId, response.guestId);
            const order = compareTimestamps(response.respondedAt, currentState.respondedAt);
            if (order < 0) return result('ignored', response);
            if (order === 0) {
                return sameLogicalResponse(response, currentState)
                    ? result('unchanged', response)
                    : result('conflict', response);
            }
        }

        const [guestSnapshot, eventSnapshot] = await Promise.all([
            transaction.get(refs.guest),
            transaction.get(refs.event)
        ]);
        if (!guestSnapshot.exists) fail('rsvp-sync/guest-not-found');
        if (!eventSnapshot.exists) fail('rsvp-sync/event-not-found');

        const guestBefore = guestSnapshot.data();
        const guestPatch = createGuestRsvpPatch(response, guestBefore);
        if (Object.keys(guestPatch).some((field) => !RSVP_GUEST_FIELDS.includes(field))) {
            fail('rsvp-sync/unsafe-guest-patch');
        }

        const syncedAt = serverTimestampFactory();
        transaction.set(refs.state, {
            schemaVersion: RSVP_STATE_SCHEMA_VERSION,
            eventId: safeEventId,
            guestId: response.guestId,
            status: response.status,
            passesConfirmed: response.passesConfirmed,
            respondedAt: response.respondedAt,
            syncedAt
        });

        if (Object.keys(guestPatch).length > 0) {
            const guestAfter = { ...guestBefore, ...guestPatch };
            transaction.update(refs.guest, guestPatch);
            transaction.update(refs.event, {
                ...createEventStatsMutation(
                    eventSnapshot.data(),
                    [{ before: guestBefore, after: guestAfter }],
                    syncedAt
                ),
                fechaActualizacion: syncedAt
            });
        }

        if (typeof beforeCommit === 'function') {
            await beforeCommit({ response, guestPatch, refs, transaction });
        }
        return result('applied', response);
    });
}

function resolveReferences(db, eventId, guestId, references) {
    const eventReference = references?.event ?? db.collection('eventos').doc(eventId);
    return Object.freeze({
        event: eventReference,
        guest: references?.guest ?? eventReference.collection('invitados').doc(guestId),
        state: references?.state ?? eventReference.collection('rsvpState').doc(guestId)
    });
}

function validateResponse(data, expectedEventId) {
    try {
        return deserializeRsvpResponseDocument(data, { expectedEventId });
    } catch {
        fail('rsvp-sync/invalid-response');
    }
}

function validateState(data, expectedEventId, expectedGuestId) {
    if (!hasExactKeys(data, STATE_FIELDS)) fail('rsvp-sync/invalid-state-shape');
    if (data.schemaVersion !== RSVP_STATE_SCHEMA_VERSION) fail('rsvp-sync/unsupported-state-schema');
    if (assertEventId(data.eventId) !== expectedEventId) fail('rsvp-sync/state-event-mismatch');
    if (assertGuestId(data.guestId) !== expectedGuestId) fail('rsvp-sync/state-guest-mismatch');
    if (!RSVP_RESPONSE_STATUSES.includes(data.status)) fail('rsvp-sync/invalid-state-status');
    if (!Number.isInteger(data.passesConfirmed) || data.passesConfirmed < 0 || data.passesConfirmed > 999) {
        fail('rsvp-sync/invalid-state-passes');
    }
    if (data.status === 'accepted' && data.passesConfirmed < 1) fail('rsvp-sync/invalid-state-passes');
    if (data.status === 'declined' && data.passesConfirmed !== 0) fail('rsvp-sync/invalid-state-passes');
    assertTimestamp(data.respondedAt, 'rsvp-sync/invalid-state-time');
    assertTimestamp(data.syncedAt, 'rsvp-sync/invalid-state-sync-time');
    return data;
}

function sameLogicalResponse(response, state) {
    return response.status === state.status
        && response.passesConfirmed === state.passesConfirmed;
}

function compareTimestamps(left, right) {
    const a = assertTimestamp(left, 'rsvp-sync/invalid-response-time');
    const b = assertTimestamp(right, 'rsvp-sync/invalid-state-time');
    if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
    if (a.nanoseconds === b.nanoseconds) return 0;
    return a.nanoseconds < b.nanoseconds ? -1 : 1;
}

function assertTimestamp(value, code) {
    const seconds = Number(value?.seconds ?? value?._seconds);
    const nanoseconds = Number(value?.nanoseconds ?? value?._nanoseconds ?? 0);
    if (!Number.isSafeInteger(seconds)
        || !Number.isSafeInteger(nanoseconds)
        || nanoseconds < 0
        || nanoseconds >= 1_000_000_000) {
        fail(code);
    }
    return { seconds, nanoseconds };
}

function assertEventId(value) {
    try {
        return assertRsvpAccessEventId(value);
    } catch {
        fail('rsvp-sync/invalid-event-id');
    }
}

function assertGuestId(value) {
    try {
        return assertRsvpAccessGuestId(value);
    } catch {
        fail('rsvp-sync/invalid-guest-id');
    }
}

function assertToken(value) {
    try {
        return assertRsvpAccessToken(value);
    } catch {
        fail('rsvp-sync/invalid-token');
    }
}

function hasExactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && expected.every((field, index) => field === keys[index]);
}

function result(status, response) {
    return Object.freeze({
        status,
        eventId: response.eventId,
        guestId: response.guestId,
        respondedAt: response.respondedAt
    });
}

function fail(code) {
    throw new RsvpReconciliationError(code);
}

function defaultServerTimestampFactory() {
    return FieldValue.serverTimestamp();
}
