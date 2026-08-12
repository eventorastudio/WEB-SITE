import assert from 'node:assert/strict';
import test from 'node:test';
import {
    REFERENCE_GUEST_ID,
    aggregateCheckins,
    analyseGuest,
    auditCheckins,
    auditReference,
    buildFieldDiffs,
    buildIdentityRegistry,
    firestoreType,
    matchesExpectedType,
    parseArguments,
    prepareWrite,
    summarize,
    validateAfterApply
} from '../scripts/normalize-guests-from-reference.mjs';

function snapshot(id, data) {
    return { id, data: () => data, ref: { id } };
}

function timestamp(millis = 0) {
    return {
        constructor: { name: 'Timestamp' },
        toDate: () => new Date(millis),
        toMillis: () => millis
    };
}

function canonicalReference(overrides = {}) {
    return {
        codigoInvitado: 'INV-0001',
        nombre: 'Luis Pablo García',
        correo: '',
        telefono: '8443884334',
        pases: 2,
        pasesUtilizados: 0,
        pasesDisponibles: 2,
        checkinSecuencia: 0,
        mesa: 15,
        estado: 'pendiente',
        confirmado: false,
        llegadaRegistrada: false,
        horaLlegada: null,
        tipoAcceso: 'qr',
        qrToken: 'Abcdefghijklmnop_1234',
        qrActivo: true,
        notas: 'Invitado Especial',
        fechaCreacion: timestamp(1000),
        fechaActualizacion: timestamp(2000),
        ...overrides
    };
}

test('el CLI es dry-run por defecto y solo acepta --apply explícito', () => {
    assert.deepEqual(parseArguments(['EVT-0001']), { valid: true, eventId: 'EVT-0001', apply: false });
    assert.deepEqual(parseArguments(['EVT-0001', '--apply']), { valid: true, eventId: 'EVT-0001', apply: true });
    assert.equal(parseArguments(['EVT-0001', '--yes']).valid, false);
    assert.equal(parseArguments(['bad/id']).valid, false);
});

test('agrega check-ins y conserva la primera hora', () => {
    const history = aggregateCheckins([
        snapshot('c2', { invitadoId: 'g1', pasesRegistrados: 2, fechaHora: timestamp(2000) }),
        snapshot('c1', { invitadoId: 'g1', pasesRegistrados: 1, fechaHora: timestamp(1000) })
    ]).get('g1');
    assert.equal(history.passes, 3);
    assert.equal(history.firstAt.toMillis(), 1000);
    assert.deepEqual(history.invalid, []);
});

test('audita check-ins por invitadoId, guestId y codigoInvitado', () => {
    const guests = [
        snapshot('INV-0001', canonicalReference()),
        snapshot('guest-2', canonicalReference({ codigoInvitado: 'INV-0002' }))
    ];
    const audit = auditCheckins([
        snapshot('c1', { invitadoId: 'guest-2', pasesRegistrados: 1, fechaHora: timestamp(1000) }),
        snapshot('c2', { guestId: 'guest-2', pasesRegistrados: 1, fechaHora: timestamp(2000) }),
        snapshot('c3', { codigoInvitado: 'INV-0002', pasesRegistrados: 1, fechaHora: timestamp(3000) })
    ], guests);

    assert.equal(audit.errors.length, 0);
    assert.equal(audit.history.get('guest-2').count, 3);
    assert.equal(audit.history.has(REFERENCE_GUEST_ID), false);
});

test('cero documentos de check-in equivale a cero historial para INV-0001', () => {
    const audit = auditCheckins([], [snapshot(REFERENCE_GUEST_ID, canonicalReference())]);
    assert.equal(audit.total, 0);
    assert.equal(audit.history.has(REFERENCE_GUEST_ID), false);
    assert.deepEqual(audit.errors, []);
});

test('la auditoría bloquea check-ins huérfanos o con datos operativos inválidos', () => {
    const guests = [snapshot(REFERENCE_GUEST_ID, canonicalReference())];
    const audit = auditCheckins([
        snapshot('orphan', { invitadoId: 'missing', pasesRegistrados: 1, fechaHora: timestamp(1000) }),
        snapshot('invalid', { invitadoId: REFERENCE_GUEST_ID, pasesRegistrados: 'x', fechaHora: null })
    ], guests);

    assert.equal(audit.errors.length, 3);
    assert.match(audit.errors[0], /no se puede asociar/);
    assert.match(audit.errors[1], /pasesRegistrados/);
    assert.match(audit.errors[2], /fechaHora/);
    assert.deepEqual(audit.history.get(REFERENCE_GUEST_ID).invalid, ['invalid']);
});

test('detecta códigos y tokens duplicados', () => {
    const registry = buildIdentityRegistry([
        snapshot('a', { codigoInvitado: 'INV-1', qrToken: 'abcdefghijklmnop' }),
        snapshot('b', { codigoInvitado: 'INV-1', qrToken: 'abcdefghijklmnop' })
    ]);
    assert.deepEqual(registry.duplicateCodes, ['INV-1']);
    assert.deepEqual(registry.duplicateTokens, ['abcdefghijklmnop']);
});

test('tipos Firestore distinguen timestamp y nullables', () => {
    const timestamp = { constructor: { name: 'Timestamp' }, toDate() {}, toMillis() {} };
    assert.equal(firestoreType(timestamp), 'timestamp');
    assert.equal(matchesExpectedType(null, 'timestamp|null'), true);
    assert.equal(matchesExpectedType(2, 'number'), true);
    assert.equal(matchesExpectedType('2', 'number'), false);
});

test('el diff distingue "false" string de false boolean y explica la derivación', () => {
    const [difference] = buildFieldDiffs({
        source: { estado: 'pendiente', confirmado: 'false' },
        patch: { confirmado: false }
    });

    assert.equal(difference.field, 'confirmado');
    assert.equal(difference.currentDisplay, '"false"');
    assert.equal(difference.currentJsType, 'string');
    assert.equal(difference.currentFirestoreType, 'string');
    assert.equal(difference.proposedDisplay, 'false');
    assert.equal(difference.proposedJsType, 'boolean');
    assert.equal(difference.proposedFirestoreType, 'boolean');
    assert.match(difference.reason, /tipo distinto/);
    assert.match(difference.reason, /estado normalizado = "pendiente"/);
    assert.equal(difference.statusContext.rawDisplay, '"pendiente"');
    assert.equal(difference.statusContext.normalizedDisplay, '"pendiente"');
});

test('el INV-0001 conceptual es una referencia canónica sin cambios', () => {
    const data = canonicalReference();
    const audit = auditReference({
        data,
        keys: Object.keys(data),
        documentId: REFERENCE_GUEST_ID,
        history: null
    });

    const state = audit.referenceState.fields.find((field) => field.field === 'estado');
    const confirmed = audit.referenceState.fields.find((field) => field.field === 'confirmado');
    assert.equal(state.current.display, '"pendiente"');
    assert.equal(state.proposed.display, '"pendiente"');
    assert.equal(confirmed.current.display, 'false');
    assert.equal(confirmed.current.jsType, 'boolean');
    assert.equal(confirmed.proposed.display, 'false');
    assert.equal(audit.referenceState.checkinCount, 0);
    assert.equal(audit.referenceState.result, 'REFERENCIA VÁLIDA');
    assert.deepEqual(audit.referenceState.requiredChanges, []);
    assert.deepEqual(audit.errors, []);
    assert.deepEqual(audit.differences, []);
});

test('los campos generados y serverTimestamp explican la operación real', () => {
    const timestamp = { constructor: { name: 'Timestamp' }, toDate: () => new Date(0), toMillis: () => 0 };
    const differences = buildFieldDiffs({
        source: { codigoInvitado: '', fechaActualizacion: timestamp },
        patch: { fechaActualizacion: '[serverTimestamp]' },
        generatedFields: ['codigoInvitado']
    });
    const code = differences.find((difference) => difference.field === 'codigoInvitado');
    const updatedAt = differences.find((difference) => difference.field === 'fechaActualizacion');

    assert.equal(code.reason, 'codigoInvitado vacío; se generará un código único durante --apply');
    assert.equal(updatedAt.proposedJsType, 'object (FieldValue)');
    assert.equal(updatedAt.proposedFirestoreType, 'timestamp');
    assert.equal(updatedAt.reason, 'fechaActualizacion se actualizará mediante serverTimestamp() debido a que el documento tendrá cambios');
});

test('el análisis nunca prepara INV-0001 y marca fecha histórica faltante', () => {
    const item = analyseGuest({
        snapshot: snapshot('legacy', { nombre: 'Ana', pases: 2, tipoAcceso: 'manual' }),
        referenceKeys: ['nombre', 'pases', 'tipoAcceso', 'fechaCreacion', 'fechaActualizacion'],
        history: null
    });
    assert.equal(item.status, 'invalid');
    assert.match(item.reasons.join(' '), /fechaCreacion/);
    assert.throws(
        () => prepareWrite({ id: REFERENCE_GUEST_ID }, new Set(), new Set(), {}),
        /protegido/
    );
});

test('un invitado incompleto recibe solo campos operativos propios', () => {
    const referenceKeys = Object.keys(canonicalReference());
    const source = {
        codigoInvitado: '',
        nombre: 'Invitado Propio',
        correo: 'propio@example.com',
        telefono: '8440000000',
        pases: 2,
        mesa: 8,
        estado: 'pendiente',
        confirmado: false,
        llegadaRegistrada: false,
        horaLlegada: null,
        tipoAcceso: 'qr',
        notas: 'Nota propia',
        fechaCreacion: timestamp(3000),
        fechaActualizacion: timestamp(4000)
    };
    const item = analyseGuest({
        snapshot: snapshot('yHyO5JHq1KAX8VXDBjkU', source),
        referenceKeys,
        history: null
    });

    assert.equal(item.status, 'update');
    assert.equal(item.patch.pasesUtilizados, 0);
    assert.equal(item.patch.pasesDisponibles, 2);
    assert.equal(item.patch.qrActivo, true);
    assert.equal(item.patch.fechaActualizacion, '[serverTimestamp]');
    assert.deepEqual(item.generatedFields.sort(), ['codigoInvitado', 'qrToken']);
    assert.equal(item.patch.qrToken, undefined);
    assert.equal(item.patch.codigoInvitado, undefined);
    ['nombre', 'correo', 'telefono', 'pases', 'mesa', 'estado', 'confirmado',
        'llegadaRegistrada', 'horaLlegada', 'tipoAcceso', 'notas', 'fechaCreacion']
        .forEach((field) => assert.equal(item.patch[field], undefined, field));
});

test('el resumen separa correctos, cambios e inválidos', () => {
    const result = summarize([
        { status: 'correct', source: { codigoInvitado: 'A', tipoAcceso: 'manual' }, incorrectTypes: [] },
        { status: 'update', source: { tipoAcceso: 'qr' }, incorrectTypes: ['pases'] },
        { status: 'invalid', source: { codigoInvitado: 'C', tipoAcceso: 'manual' }, incorrectTypes: [] }
    ]);
    assert.deepEqual(result, {
        total: 3, normalized: 1, requiresChanges: 1, invalid: 1,
        withoutCode: 1, withoutQrToken: 1, wrongTypes: 1
    });
});

test('la validación posterior exige todas las claves', () => {
    const issues = validateAfterApply([snapshot('a', { nombre: 'Ana' })], ['nombre', 'pases']);
    assert.deepEqual(issues, [{ id: 'a', issues: ['faltan: pases'] }]);
});

test('la validación posterior detecta incoherencias aunque los tipos sean válidos', () => {
    const data = canonicalReference({ confirmado: true });
    const issues = validateAfterApply(
        [snapshot(REFERENCE_GUEST_ID, data)],
        Object.keys(data)
    );
    assert.deepEqual(issues, [{
        id: REFERENCE_GUEST_ID,
        issues: ['aún requeriría cambios: confirmado']
    }]);
});
