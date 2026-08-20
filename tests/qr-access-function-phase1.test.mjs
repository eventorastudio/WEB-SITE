import test from 'node:test';
import assert from 'node:assert/strict';

import {
    GuestQrAccessError,
    resolveGuestQrToken
} from '../functions/src/guest-qr-access.js';

const EVENT_ID = 'EVT-QR-1';
const RSVP_TOKEN = 'A'.repeat(43);
const GUEST_ID = 'INV-QR-1';
const QR_TOKEN = 'qr-token-canonical-1234';

function accessDocument(overrides = {}) {
    return {
        active: true,
        configKey: 'B'.repeat(43),
        displayName: 'Invitado de prueba',
        eventId: EVENT_ID,
        expiresAt: null,
        guestId: GUEST_ID,
        passLimit: 2,
        schemaVersion: 2,
        ...overrides
    };
}

function mockDb({ access = accessDocument(), guest = { qrActivo: true, qrToken: QR_TOKEN } } = {}) {
    const guestRef = { get: async () => ({ exists: Boolean(guest), data: () => guest }) };
    const accessRef = { get: async () => ({ exists: Boolean(access), data: () => access }) };
    const eventRef = {
        collection(name) {
            return { doc: () => name === 'rsvpAccess' ? accessRef : guestRef };
        }
    };
    return { collection: () => ({ doc: () => eventRef }) };
}

test('devuelve únicamente el qrToken canónico', async () => {
    const result = await resolveGuestQrToken({ db: mockDb(), eventId: EVENT_ID, rsvpToken: RSVP_TOKEN });
    assert.deepEqual(result, { schemaVersion: 1, qrToken: QR_TOKEN });
    assert.deepEqual(Object.keys(result).sort(), ['qrToken', 'schemaVersion']);
});

test('rechaza acceso inactivo o expirado', async () => {
    await assert.rejects(
        resolveGuestQrToken({ db: mockDb({ access: accessDocument({ active: false }) }), eventId: EVENT_ID, rsvpToken: RSVP_TOKEN }),
        GuestQrAccessError
    );
    await assert.rejects(
        resolveGuestQrToken({ db: mockDb({ access: accessDocument({ expiresAt: new Date('2020-01-01T00:00:00Z') }) }), eventId: EVENT_ID, rsvpToken: RSVP_TOKEN }),
        GuestQrAccessError
    );
});

test('rechaza invitado sin QR activo y valida formatos', async () => {
    await assert.rejects(
        resolveGuestQrToken({ db: mockDb({ guest: { qrActivo: false, qrToken: QR_TOKEN } }), eventId: EVENT_ID, rsvpToken: RSVP_TOKEN }),
        GuestQrAccessError
    );
    await assert.rejects(
        resolveGuestQrToken({ db: mockDb({ guest: { qrActivo: true, qrToken: 'rsvp-token' } }), eventId: EVENT_ID, rsvpToken: RSVP_TOKEN }),
        GuestQrAccessError
    );
    await assert.rejects(
        resolveGuestQrToken({ db: mockDb(), eventId: '../otro', rsvpToken: RSVP_TOKEN }),
        GuestQrAccessError
    );
});
