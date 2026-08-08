import assert from 'node:assert/strict';
import test from 'node:test';
import {
    REFERENCE_GUEST_ID,
    aggregateCheckins,
    analyseGuest,
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

test('el CLI es dry-run por defecto y solo acepta --apply explícito', () => {
    assert.deepEqual(parseArguments(['EVT-0001']), { valid: true, eventId: 'EVT-0001', apply: false });
    assert.deepEqual(parseArguments(['EVT-0001', '--apply']), { valid: true, eventId: 'EVT-0001', apply: true });
    assert.equal(parseArguments(['EVT-0001', '--yes']).valid, false);
    assert.equal(parseArguments(['bad/id']).valid, false);
});

test('agrega check-ins y conserva la primera hora', () => {
    const timestamp = (millis) => ({
        constructor: { name: 'Timestamp' },
        toDate: () => new Date(millis),
        toMillis: () => millis
    });
    const history = aggregateCheckins([
        snapshot('c2', { invitadoId: 'g1', pasesRegistrados: 2, fechaHora: timestamp(2000) }),
        snapshot('c1', { invitadoId: 'g1', pasesRegistrados: 1, fechaHora: timestamp(1000) })
    ]).get('g1');
    assert.equal(history.passes, 3);
    assert.equal(history.firstAt.toMillis(), 1000);
    assert.deepEqual(history.invalid, []);
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
