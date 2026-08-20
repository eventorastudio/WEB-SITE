import {
    assertRsvpAccessEventId,
    assertRsvpAccessGuestId,
    assertRsvpAccessToken,
    deserializeRsvpAccessDocument,
    isRsvpAccessExpired
} from '../generated/rsvp-access-contract.js';

const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const PUBLIC_ERROR_CODE = 'guest-qr-access/unavailable';

export class GuestQrAccessError extends Error {
    constructor(code = PUBLIC_ERROR_CODE) {
        super(code);
        this.name = 'GuestQrAccessError';
        this.code = code;
    }
}

/**
 * Resolves the canonical guest QR token without exposing the guest document.
 * This function deliberately returns only the QR payload.
 */
export async function resolveGuestQrToken({ db, eventId, rsvpToken, now = new Date() } = {}) {
    if (!db || typeof db.collection !== 'function') throw new GuestQrAccessError();

    const safeEventId = assertInput(assertRsvpAccessEventId, eventId);
    const safeRsvpToken = assertInput(assertRsvpAccessToken, rsvpToken);
    const eventReference = db.collection('eventos').doc(safeEventId);
    const accessSnapshot = await eventReference.collection('rsvpAccess').doc(safeRsvpToken).get();
    if (!accessSnapshot.exists) throw new GuestQrAccessError();

    let access;
    try {
        access = deserializeRsvpAccessDocument(accessSnapshot.data(), { expectedEventId: safeEventId });
    } catch {
        throw new GuestQrAccessError();
    }
    if (!access.active || isRsvpAccessExpired(access.expiresAt, now)) throw new GuestQrAccessError();

    const safeGuestId = assertInput(assertRsvpAccessGuestId, access.guestId);
    const guestSnapshot = await eventReference.collection('invitados').doc(safeGuestId).get();
    if (!guestSnapshot.exists) throw new GuestQrAccessError();

    const guest = guestSnapshot.data() ?? {};
    if (guest.qrActivo !== true || !QR_TOKEN_PATTERN.test(String(guest.qrToken ?? ''))) {
        throw new GuestQrAccessError();
    }

    return Object.freeze({
        schemaVersion: 1,
        qrToken: guest.qrToken
    });
}

function assertInput(assertion, value) {
    try {
        return assertion(value);
    } catch {
        throw new GuestQrAccessError();
    }
}

export { PUBLIC_ERROR_CODE };
