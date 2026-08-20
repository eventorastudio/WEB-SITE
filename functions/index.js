import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { reconcileCurrentRsvpResponse } from './src/rsvp-reconciliation.js';
import { resolveGuestQrToken } from './src/guest-qr-access.js';

initializeApp();

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

function safeErrorCode(error) {
    const code = String(error?.code ?? error?.message ?? 'rsvp-sync/unknown');
    return /^rsvp-sync\/[a-z0-9-]+$/.test(code) ? code : 'rsvp-sync/unknown';
}
