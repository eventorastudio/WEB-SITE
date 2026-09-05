import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';

import { reconcileCurrentRsvpResponse } from './src/rsvp-reconciliation.js';
import { resolveGuestQrToken } from './src/guest-qr-access.js';
import { createCalendarHttpHandler } from './src/calendar-http.js';
import { isCeoClaims, prepareRefundPurgeDryRun } from './src/purge/refund-purge-preparation.js';
import { authorizeRefundProjectPurge as authorizeRefundProjectPurgeCore, cancelRefundProjectPurge as cancelRefundProjectPurgeCore } from './src/purge/refund-purge-authorization.js';
import { confirmRefundRecord as confirmRefundRecordCore, recordRefundProcessed as recordRefundProcessedCore } from './src/purge/refund-records.js';
import { acknowledgeProductionPurgeDisabled, handleLatePurgedEventObject } from './src/purge/late-upload-sweeper.js';

initializeApp();

const ADMIN_PURGE_CALLABLE_OPTIONS = Object.freeze({
    region: 'us-central1',
    enforceAppCheck: true
});

function assertAdminPurgeCeo(request) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticación requerida.');
    if (!isCeoClaims(request.auth.token)) throw new HttpsError('permission-denied', 'No autorizado.');
}

export const calendar = onRequest({ region: 'us-central1' }, createCalendarHttpHandler({ db: getFirestore() }));

export const syncRsvpResponseToGuest = onDocumentWritten({
    document: 'eventos/{eventId}/rsvpResponses/{token}',
    region: 'us-central1',
    retry: false
}, async (event) => {
    if (!event.data?.after.exists) return null;
    const eventId = event.params.eventId;
    try {
        const outcome = await reconcileCurrentRsvpResponse({
            db: getFirestore(),
            eventId,
            token: event.params.token
        });
        if (outcome.status === 'conflict') {
            logger.error('RSVP reconciliation requires conflict review.', {
                code: 'rsvp-sync/same-timestamp-conflict',
                eventId: outcome.eventId,
                guestId: outcome.guestId,
                conflictId: outcome.conflictId,
                conflictCreated: outcome.conflictCreated
            });
        }
        return outcome;
    } catch (error) {
        logger.error('RSVP reconciliation failed.', {
            code: safeErrorCode(error),
            eventId
        });
        throw error;
    }
});

export const refundPurgeLateUploadSweeper = onObjectFinalized({
    bucket: 'eventorastudio-d6d95.firebasestorage.app',
    region: 'us-east1',
    retry: true
}, async (event) => {
    if (acknowledgeProductionPurgeDisabled()) {
        return { action: 'DISABLED', reason: 'PRODUCTION_PURGE_DISABLED' };
    }
    return handleLatePurgedEventObject({
        event,
        db: getFirestore(),
        bucket: getStorage().bucket(),
        expectedBucket: 'eventorastudio-d6d95.firebasestorage.app'
    });
});

export const getGuestQrToken = onCall({
    region: 'us-central1'
}, async (request) => {
    try {
        return await resolveGuestQrToken({
            db: getFirestore(),
            eventId: request.data?.eventId,
            rsvpToken: request.data?.rsvpToken
        });
    } catch {
        // Deliberately do not log bearer tokens, guest IDs or QR values.
        throw new HttpsError('not-found', 'No disponible.');
    }
});

export const prepareRefundProjectPurge = onCall({
    ...ADMIN_PURGE_CALLABLE_OPTIONS
}, async (request) => {
    assertAdminPurgeCeo(request);
    if (!request.data?.refundRecordId) {
        throw new HttpsError('failed-precondition', 'REFUND_EVIDENCE_NOT_PRODUCTION_READY');
    }
    try {
        const result = await prepareRefundPurgeDryRun({
            db: getFirestore(),
            bucket: getStorage().bucket(),
            eventId: request.data?.eventId,
            actorUid: request.auth.uid,
            claims: request.auth.token,
            refundRecordId: request.data?.refundRecordId
        });
        return result;
    } catch (error) {
        const code = String(error?.code ?? 'DRY_RUN_FAILED');
        const safeCodes = new Set([
            'INVALID_EVENT_ID', 'EVENT_NOT_FOUND', 'DEMO_PURGE_BLOCKED', 'REFUND_NOT_CONFIRMED',
            'REFUND_REFERENCE_MISSING', 'REFUNDED_AT_MISSING', 'COMMERCIAL_RECORD_MISSING', 'REFUND_RECORD_NOT_FOUND',
            'REFUND_EVENT_MISMATCH', 'REFUND_ALREADY_LINKED', 'REFUND_EVIDENCE_NOT_PRODUCTION_READY',
            'REFUND_DOES_NOT_TERMINATE_SERVICE', 'REFUND_EVIDENCE_STALE', 'REFUND_RECORD_INVALID',
            'PURGE_ALREADY_PENDING', 'DRY_RUN_FAILED', 'MANIFEST_PRIVACY_VIOLATION'
        ]);
        throw new HttpsError(safeCodes.has(code) ? 'failed-precondition' : 'internal', code);
    }
});

export const recordRefundProcessed = onCall(ADMIN_PURGE_CALLABLE_OPTIONS, async (request) => {
    assertAdminPurgeCeo(request);
    try {
        return await recordRefundProcessedCore({
            db: getFirestore(), input: request.data, actorUid: request.auth.uid, claims: request.auth.token
        });
    } catch (error) {
        const code = String(error?.code ?? 'REFUND_RECORD_FAILED');
        const safeCodes = new Set([
            'INVALID_EVENT_ID', 'COMMERCIAL_RECORD_MISSING', 'REFUND_REFERENCE_MISSING',
            'AMOUNT_INVALID', 'CURRENCY_INVALID', 'PAYMENT_METHOD_INVALID', 'REFUNDED_AT_INVALID',
            'REFUND_CONFIRMED_IMMUTABLE', 'REFUND_RECORD_ALREADY_EXISTS', 'TERMINATION_INTENT_INVALID'
        ]);
        throw new HttpsError(safeCodes.has(code) ? 'failed-precondition' : 'internal', code);
    }
});

export const confirmRefundRecord = onCall(ADMIN_PURGE_CALLABLE_OPTIONS, async (request) => {
    assertAdminPurgeCeo(request);
    try {
        return await confirmRefundRecordCore({
            db: getFirestore(), refundRecordId: request.data?.refundRecordId,
            actorUid: request.auth.uid, claims: request.auth.token
        });
    } catch (error) {
        const code = String(error?.code ?? 'REFUND_CONFIRM_FAILED');
        const safeCodes = new Set([
            'REFUND_RECORD_NOT_FOUND', 'REFUND_ALREADY_CONFIRMED', 'REFUND_RECORD_NOT_CONFIRMABLE', 'REFUND_RECORD_INVALID'
        ]);
        throw new HttpsError(safeCodes.has(code) ? 'failed-precondition' : 'internal', code);
    }
});

export const authorizeRefundProjectPurge = onCall({
    ...ADMIN_PURGE_CALLABLE_OPTIONS
}, async (request) => {
    assertAdminPurgeCeo(request);
    try {
        return await authorizeRefundProjectPurgeCore({
            db: getFirestore(),
            eventId: request.data?.eventId,
            actorUid: request.auth.uid,
            claims: request.auth.token,
            phrase: request.data?.phrase,
            confirmations: request.data?.confirmations,
            manifestHash: request.data?.manifestHash,
            refundReference: request.data?.refundReference,
            commercialFileReference: request.data?.commercialFileReference
        });
    } catch (error) {
        const code = String(error?.code ?? 'AUTHORIZATION_FAILED');
        const safeCodes = new Set([
            'INVALID_EVENT_ID', 'PURGE_RECORD_NOT_FOUND', 'ALREADY_PURGED', 'PURGE_NOT_READY',
            'MANIFEST_BLOCKED', 'MANIFEST_STALE', 'MANIFEST_HASH_INVALID', 'REFUND_REFERENCE_MISSING',
            'COMMERCIAL_RECORD_MISSING', 'PURGE_EVIDENCE_MISMATCH', 'CONFIRMATIONS_INCOMPLETE',
            'CONFIRMATION_PHRASE_INVALID', 'REAUTH_REQUIRED', 'AUTHORIZATION_ALREADY_ACTIVE', 'DEMO_PURGE_BLOCKED',
            'REFUND_EVIDENCE_NOT_PRODUCTION_READY', 'REFUND_EVENT_MISMATCH', 'REFUND_NOT_CONFIRMED',
            'REFUND_EVIDENCE_STALE'
        ]);
        throw new HttpsError(safeCodes.has(code) ? 'failed-precondition' : 'internal', code);
    }
});

export const cancelRefundProjectPurgeAuthorization = onCall({
    ...ADMIN_PURGE_CALLABLE_OPTIONS
}, async (request) => {
    assertAdminPurgeCeo(request);
    try {
        return await cancelRefundProjectPurgeCore({
            db: getFirestore(),
            eventId: request.data?.eventId,
            actorUid: request.auth.uid,
            claims: request.auth.token,
            authorizationId: request.data?.authorizationId
        });
    } catch (error) {
        const code = String(error?.code ?? 'AUTHORIZATION_CANCEL_FAILED');
        const safeCodes = new Set([
            'INVALID_EVENT_ID', 'PURGE_RECORD_NOT_FOUND', 'AUTHORIZATION_NOT_ACTIVE',
            'AUTHORIZATION_MISMATCH'
        ]);
        throw new HttpsError(safeCodes.has(code) ? 'failed-precondition' : 'internal', code);
    }
});

function safeErrorCode(error) {
    const code = String(error?.code ?? error?.message ?? 'rsvp-sync/unknown');
    return /^rsvp-sync\/[a-z0-9-]+$/.test(code) ? code : 'rsvp-sync/unknown';
}
