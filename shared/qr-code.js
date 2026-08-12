import { isValidQrToken, supportsQrAccess } from './guest-contract.js';

/** El payload definitivo no contiene PII: es únicamente el token seguro. */
export function buildQrPayload({ qrToken } = {}) {
    const token = String(qrToken ?? '').trim();
    if (!isValidQrToken(token)) throw new Error('qr/invalid-token');
    return token;
}

export function parseQrPayloadValue(rawValue) {
    const raw = String(rawValue ?? '').trim();
    if (!raw) throw new Error('qr/empty-payload');

    try {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && typeof data.token === 'string') {
            return validated(data.token, typeof data.eventId === 'string' ? data.eventId : null);
        }
    } catch {
        // Continúa con URL o token directo.
    }

    try {
        const url = new URL(raw);
        const token = url.searchParams.get('t');
        if (token) return validated(token, url.searchParams.get('eventId') || url.searchParams.get('event'));
    } catch {
        if (isValidQrToken(raw)) return { token: raw, eventId: null };
    }

    throw new Error('qr/invalid-payload');
}

export function validateQrPayload(payload, expectedToken = null) {
    const parsed = parseQrPayloadValue(payload);
    if (expectedToken !== null && parsed.token !== expectedToken) throw new Error('qr/token-mismatch');
    return parsed;
}

export function getGuestQrAvailability(guest = {}) {
    if (!supportsQrAccess(guest.tipoAcceso)) return { status: 'unsupported', available: false };
    if (guest.qrActivo !== true) return { status: 'disabled', available: false };
    if (!isValidQrToken(guest.qrToken)) return { status: 'missing', available: false };
    return { status: 'available', available: true };
}

function validated(tokenValue, eventIdValue) {
    const token = String(tokenValue ?? '').trim();
    if (!isValidQrToken(token)) throw new Error('qr/invalid-payload');
    const eventId = typeof eventIdValue === 'string' ? eventIdValue.trim() || null : null;
    return { token, eventId };
}
