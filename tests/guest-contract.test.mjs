import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CANONICAL_GUEST_FIELDS,
    GuestContractError,
    normalizeGuestData,
    normalizeGuestForCreate,
    normalizeGuestForUpdate,
    normalizeGuestForRead,
    normalizeLegacyGuest
} from '../shared/guest-contract.js';

const persistedFields = CANONICAL_GUEST_FIELDS.filter((key) => !['fechaCreacion', 'fechaActualizacion'].includes(key));

test('manual y Excel obtienen el mismo contrato completo', () => {
    const guest = normalizeGuestForCreate({
        nombre: 'Abuela Sol',
        pases: '4',
        mesa: 'Mesa 5',
        tipoAcceso: 'ambos'
    }, { documentId: 'firestoreUniqueId' });

    assert.deepEqual(Object.keys(guest).sort(), [...persistedFields].sort());
    assert.equal(guest.codigoInvitado, 'INV-firestoreUniqueId');
    assert.equal(guest.pases, 4);
    assert.equal(guest.pasesUtilizados, 0);
    assert.equal(guest.pasesDisponibles, 4);
    assert.equal(guest.mesa, 5);
    assert.equal(guest.confirmado, false);
    assert.equal(guest.llegadaRegistrada, false);
    assert.equal(guest.horaLlegada, null);
    assert.equal(guest.qrActivo, true);
    assert.match(guest.qrToken, /^[A-Za-z0-9_-]{16,256}$/);
});

test('false textual inequívoco no se interpreta como true', () => {
    const guest = normalizeGuestData({ nombre: 'Ana', confirmado: 'false', llegadaRegistrada: 'false' });
    assert.equal(guest.estado, 'pendiente');
    assert.equal(guest.confirmado, false);
    assert.equal(guest.llegadaRegistrada, false);
});

test('pendiente con confirmado false booleano ya cumple el contrato legado', () => {
    const plan = normalizeLegacyGuest({
        nombre: 'Ana', correo: '', telefono: '', pases: 2,
        pasesUtilizados: 0, pasesDisponibles: 2, mesa: null,
        estado: 'pendiente', confirmado: false, llegadaRegistrada: false,
        horaLlegada: null, tipoAcceso: 'manual', qrToken: null,
        qrActivo: false, notas: '', codigoInvitado: 'INV-0001', checkinSecuencia: 0
    }, { documentId: 'INV-0001' });

    assert.equal(plan.status, 'correct');
    assert.equal(plan.patch.confirmado, undefined);
});

test('pendiente con confirmado "false" conserva el significado pero reporta el tipo', () => {
    const plan = normalizeLegacyGuest({
        nombre: 'Ana', correo: '', telefono: '', pases: 2,
        pasesUtilizados: 0, pasesDisponibles: 2, mesa: null,
        estado: 'pendiente', confirmado: 'false', llegadaRegistrada: false,
        horaLlegada: null, tipoAcceso: 'manual', qrToken: null,
        qrActivo: false, notas: '', codigoInvitado: 'INV-0001'
    }, { documentId: 'INV-0001' });

    assert.equal(plan.status, 'update');
    assert.equal(plan.patch.confirmado, false);
});

test('la edición conserva token, contadores y una llegada real', () => {
    const current = {
        nombre: 'Ana', pases: 4, pasesUtilizados: 2, pasesDisponibles: 2,
        tipoAcceso: 'qr', qrActivo: true, qrToken: 'Abcdefghijklmnop_1234567890',
        codigoInvitado: 'INV-0008', estado: 'llego', llegadaRegistrada: true,
        horaLlegada: { timestamp: true }
    };
    const updated = normalizeGuestForUpdate({ nombre: 'Ana María', pases: 5, estado: 'llego' }, current, { documentId: 'doc8' });
    assert.equal(updated.codigoInvitado, 'INV-0008');
    assert.equal(updated.qrToken, current.qrToken);
    assert.equal(updated.pasesUtilizados, 2);
    assert.equal(updated.pasesDisponibles, 3);
    assert.equal(updated.horaLlegada, current.horaLlegada);
    assert.throws(
        () => normalizeGuestForUpdate({ estado: 'pendiente' }, current, { documentId: 'doc8' }),
        (error) => error instanceof GuestContractError && error.code === 'guest/arrival-reset-not-allowed'
    );
});

test('la lectura no genera identidad faltante', () => {
    const guest = normalizeGuestForRead({ nombre: 'Ana', pases: 2, tipoAcceso: 'qr' }, { documentId: 'autoId' });
    assert.equal(guest.codigoInvitado, '');
    assert.equal(guest.qrToken, null);
    assert.equal(guest.qrActivo, false);
});

test('un legado sin contadores usa historial confiable y conserva datos propios', () => {
    const firstCheckinAt = { timestamp: 'primero' };
    const source = {
        nombre: 'Abuela Sol', correo: '', telefono: '', pases: '4', mesa: '5',
        estado: 'pendiente', tipoAcceso: 'ambos', notas: 'Propias'
    };
    const plan = normalizeLegacyGuest(source, {
        documentId: 'legacyDoc',
        checkinPasses: 1,
        firstCheckinAt
    });

    assert.equal(plan.status, 'update');
    assert.equal(plan.patch.nombre, undefined);
    assert.equal(plan.patch.notas, undefined);
    assert.equal(plan.patch.pases, 4);
    assert.equal(plan.patch.mesa, 5);
    assert.equal(plan.patch.pasesUtilizados, 1);
    assert.equal(plan.patch.pasesDisponibles, 3);
    assert.equal(plan.patch.estado, 'llego');
    assert.equal(plan.patch.confirmado, true);
    assert.equal(plan.patch.llegadaRegistrada, true);
    assert.equal(plan.patch.horaLlegada, firstCheckinAt);
    assert.deepEqual(plan.generatedFields.sort(), ['codigoInvitado', 'qrToken']);
});

test('un contador existente válido prevalece y una cadena numérica ambigua se rechaza', () => {
    const existing = normalizeLegacyGuest({
        nombre: 'Ana', pases: 4, pasesUtilizados: 1, pasesDisponibles: 3,
        estado: 'pendiente', tipoAcceso: 'manual', qrToken: null, qrActivo: false
    }, { checkinPasses: 2 });
    assert.equal(existing.patch.pasesUtilizados, undefined);
    assert.equal(existing.patch.pasesDisponibles, undefined);

    const ambiguous = normalizeLegacyGuest({ nombre: 'Ana', pases: '2.0' });
    assert.equal(ambiguous.status, 'invalid');
    assert.equal(ambiguous.reason, 'guest/invalid-passes');
});

test('qrActivo textual solo se convierte cuando es inequívoco', () => {
    const safe = normalizeLegacyGuest({
        nombre: 'Ana', pases: 1, estado: 'pendiente', tipoAcceso: 'qr',
        qrToken: 'Abcdefghijklmnop_1234', qrActivo: 'false'
    });
    assert.equal(safe.patch.qrActivo, false);

    const ambiguous = normalizeLegacyGuest({
        nombre: 'Ana', pases: 1, estado: 'pendiente', tipoAcceso: 'qr',
        qrToken: 'Abcdefghijklmnop_1234', qrActivo: 'quizá'
    });
    assert.equal(ambiguous.status, 'invalid');
    assert.equal(ambiguous.reason, 'guest/ambiguous-qr-active');
});

test('un QR desactivado explícitamente no se reactiva', () => {
    const plan = normalizeLegacyGuest({
        nombre: 'Ana', correo: '', telefono: '', pases: 1,
        pasesUtilizados: 0, pasesDisponibles: 1, mesa: null,
        estado: 'pendiente', confirmado: false, llegadaRegistrada: false,
        horaLlegada: null, tipoAcceso: 'qr', qrToken: 'Abcdefghijklmnop_1234',
        qrActivo: false, notas: '', codigoInvitado: 'INV-0002', checkinSecuencia: 0
    }, { documentId: 'INV-0002' });

    assert.equal(plan.status, 'correct');
    assert.equal(plan.patch.qrActivo, undefined);
});

test('una llegada real prevalece sobre un estado legado contradictorio', () => {
    const arrival = { timestamp: true };
    const plan = normalizeLegacyGuest({
        nombre: 'Ana', pases: 2, estado: 'pendiente', confirmado: false,
        llegadaRegistrada: true, horaLlegada: arrival, tipoAcceso: 'manual',
        qrToken: null, qrActivo: false
    });
    assert.equal(plan.patch.estado, 'llego');
    assert.equal(plan.patch.confirmado, true);
    assert.equal(plan.patch.llegadaRegistrada, undefined);
    assert.equal(plan.patch.horaLlegada, undefined);
    assert.equal(plan.patch.pasesUtilizados, 2);
    assert.equal(plan.patch.pasesDisponibles, 0);
});
