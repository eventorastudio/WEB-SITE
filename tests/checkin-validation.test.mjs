import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGuestForCreate } from '../shared/guest-contract.js';
import {
    CheckinValidationError,
    buildCheckinMutation,
    normalizeCheckinPassState,
    parseQrPayload
} from '../portal/services/checkin-validation.js';

test('un invitado antes incompleto puede recorrer el contrato de check-in', () => {
    const guest = normalizeGuestForCreate({
        nombre: 'Abuela Sol',
        pases: '4',
        mesa: '5',
        tipoAcceso: 'ambos'
    }, { documentId: 'INV-0001' });
    const timestamp = { serverTimestamp: true };
    const mutation = buildCheckinMutation({
        guest,
        eventId: 'EVT-0001',
        guestId: 'INV-0001',
        requestedPasses: 1,
        method: 'qr',
        qrToken: guest.qrToken,
        userId: 'portalUserId',
        timestamp
    });

    assert.equal(guest.codigoInvitado, 'INV-0001');
    assert.equal(mutation.guestUpdate.pasesUtilizados, 1);
    assert.equal(mutation.guestUpdate.pasesDisponibles, 3);
    assert.equal(mutation.guestUpdate.llegadaRegistrada, true);
    assert.equal(mutation.guestUpdate.horaLlegada, timestamp);
    assert.equal(mutation.checkinRecord.invitadoId, 'INV-0001');
    assert.equal(mutation.checkinId, 'INV-0001-001');
    assert.equal(mutation.checkinRecord.pasesRegistrados, 1);
    assert.equal(mutation.checkinRecord.pasesDisponiblesDespues, 3);
    assert.equal(mutation.checkinRecord.resultado, 'parcial');
});

test('el portal infiere contadores legacy, pero rechaza estados incoherentes', () => {
    assert.deepEqual(normalizeCheckinPassState({ pases: '3' }), {
        pasesTotales: 3,
        pasesUtilizados: 0,
        pasesDisponibles: 3
    });
    assert.throws(
        () => normalizeCheckinPassState({ pases: 2, pasesUtilizados: 0, pasesDisponibles: 1 }),
        (error) => error instanceof CheckinValidationError && error.code === 'checkin/invalid-guest-pass-data'
    );
});

test('un código visible no se acepta como token QR', () => {
    assert.throws(
        () => parseQrPayload('INV-0001'),
        (error) => error instanceof CheckinValidationError && error.code === 'checkin/invalid-qr-format'
    );
});
