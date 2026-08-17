import { createHash } from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';

import { createEventStatsMutation } from '../generated/event-stats.js';
import { RSVP_GUEST_FIELDS, createGuestRsvpPatch } from '../generated/guest-contract.js';
import {
    deserializeRsvpResponseDocument
} from '../generated/rsvp-response-contract.js';
import {
    assertRsvpAccessEventId,
    assertRsvpAccessToken
} from '../generated/rsvp-access-contract.js';
import {
    RSVP_STATE_SCHEMA_VERSION,
    buildRsvpConflictDocument,
    deserializeRsvpConflictDocument,
    deserializeRsvpStateDocument
} from '../generated/rsvp-operations-contract.js';

export { RSVP_STATE_SCHEMA_VERSION };

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
                if (sameLogicalResponse(response, currentState)) return result('unchanged', response);
                return registerSameTimestampConflict({
                    transaction,
                    refs,
                    response,
                    currentState,
                    serverTimestampFactory
                });
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
        state: references?.state ?? eventReference.collection('rsvpState').doc(guestId),
        conflicts: references?.conflicts ?? eventReference.collection('rsvpConflicts')
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
    try {
        return deserializeRsvpStateDocument(data, { expectedEventId, expectedGuestId });
    } catch {
        fail('rsvp-sync/invalid-state');
    }
}

async function registerSameTimestampConflict({
    transaction,
    refs,
    response,
    currentState,
    serverTimestampFactory
}) {
    const conflictId = createConflictId(response, currentState);
    const conflictReference = refs.conflicts.doc(conflictId);
    const conflictSnapshot = await transaction.get(conflictReference);
    if (conflictSnapshot.exists) {
        const existing = validateConflict(
            conflictSnapshot.data(),
            response.eventId,
            response.guestId
        );
        if (!sameConflict(existing, currentState, response)) fail('rsvp-sync/conflict-record-mismatch');
        return result('conflict', response, { conflictId, conflictCreated: false });
    }

    transaction.set(conflictReference, buildRsvpConflictDocument({
        eventId: response.eventId,
        guestId: response.guestId,
        respondedAt: response.respondedAt,
        canonical: comparable(currentState),
        candidate: comparable(response),
        createdAt: serverTimestampFactory()
    }));
    return result('conflict', response, { conflictId, conflictCreated: true });
}

function validateConflict(data, expectedEventId, expectedGuestId) {
    try {
        return deserializeRsvpConflictDocument(data, { expectedEventId, expectedGuestId });
    } catch {
        fail('rsvp-sync/invalid-conflict-record');
    }
}

function createConflictId(response, currentState) {
    const timestamp = assertTimestamp(response.respondedAt, 'rsvp-sync/invalid-response-time');
    const identity = JSON.stringify([
        response.eventId,
        response.guestId,
        timestamp.seconds,
        timestamp.nanoseconds,
        currentState.status,
        currentState.passesConfirmed,
        response.status,
        response.passesConfirmed
    ]);
    return `RSVP-CONFLICT-${createHash('sha256').update(identity).digest('hex')}`;
}

function sameConflict(existing, currentState, response) {
    return compareTimestamps(existing.respondedAt, response.respondedAt) === 0
        && sameLogicalResponse(existing.canonical, currentState)
        && sameLogicalResponse(existing.candidate, response);
}

function comparable(value) {
    return Object.freeze({
        status: value.status,
        passesConfirmed: value.passesConfirmed
    });
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

function assertToken(value) {
    try {
        return assertRsvpAccessToken(value);
    } catch {
        fail('rsvp-sync/invalid-token');
    }
}

function result(status, response, details = {}) {
    return Object.freeze({
        status,
        eventId: response.eventId,
        guestId: response.guestId,
        respondedAt: response.respondedAt,
        ...details
    });
}

function fail(code) {
    throw new RsvpReconciliationError(code);
}

function defaultServerTimestampFactory() {
    return FieldValue.serverTimestamp();
}
