import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
    allocateNextCheckin,
    createCheckinRenumberPlan,
    formatCheckinId,
    parseCheckinId
} from '../shared/checkin-numbering.js';
import { normalizeGuestForCreate } from '../shared/guest-contract.js';
import { buildCheckinMutation } from '../portal/services/checkin-validation.js';
import {
    backupFileName,
    buildBackupPayload,
    executeMigrationPhases,
    parseArguments,
    verifyFinalRecords
} from '../scripts/renumber-checkins-by-guest.mjs';

const timestamp = (seconds, nanoseconds = 0) => ({ seconds, nanoseconds });
const guest = (id, extra = {}) => ({ id, data: { nombre: `Nombre ${id}`, ...extra } });
const checkin = (id, guestId, seconds, extra = {}) => ({
    id,
    data: {
        eventId: 'EVT-0001',
        invitadoId: guestId,
        codigoInvitado: guestId,
        fechaHora: timestamp(seconds),
        pasesRegistrados: 1,
        pasesDisponiblesDespues: 0,
        registradoPor: 'user-1',
        metodo: 'manual',
        resultado: 'aprobado',
        ...extra
    }
});

function canonicalGuest(sequence = 0) {
    return {
        ...normalizeGuestForCreate({
        nombre: 'Familia Moncada',
        pases: 5,
        tipoAcceso: 'manual'
        }, { documentId: 'INV-0013' }),
        checkinSecuencia: sequence
    };
}

function mutation(sequence, requestedPasses = 1) {
    return buildCheckinMutation({
        guest: canonicalGuest(sequence),
        eventId: 'EVT-0001',
        guestId: 'INV-0013',
        requestedPasses,
        method: 'manual',
        userId: 'portal-user',
        timestamp: { serverTimestamp: true }
    });
}

test('1. invitado sin check-in queda con secuencia inicial 0', () => {
    const plan = createCheckinRenumberPlan({ guests: [guest('INV-0001')], checkins: [] });
    assert.equal(plan.totalCheckins, 0);
    assert.deepEqual(plan.guestSequenceUpdates, [{ guestId: 'INV-0001', current: undefined, expected: 0 }]);
});

test('2. un check-in siempre recibe sufijo 001', () => {
    const plan = createCheckinRenumberPlan({
        guests: [guest('INV-0013')],
        checkins: [checkin('auto-a', 'INV-0013', 10)]
    });
    assert.equal(plan.moves[0].newId, 'INV-0013-001');
    assert.equal(plan.guestSequenceUpdates[0].expected, 1);
});

test('3. múltiples check-ins se numeran cronológicamente por invitado', () => {
    const plan = createCheckinRenumberPlan({
        guests: [guest('INV-0013')],
        checkins: [checkin('late', 'INV-0013', 30), checkin('early', 'INV-0013', 10), checkin('middle', 'INV-0013', 20)]
    });
    assert.deepEqual(plan.moves.map(({ oldId, newId }) => [oldId, newId]), [
        ['early', 'INV-0013-001'], ['middle', 'INV-0013-002'], ['late', 'INV-0013-003']
    ]);
});

test('4. una entrada parcial conserva todos sus campos', () => {
    const original = checkin('auto', 'INV-0013', 10, { pasesRegistrados: 4, pasesDisponiblesDespues: 1, resultado: 'parcial' });
    const plan = createCheckinRenumberPlan({ guests: [guest('INV-0013')], checkins: [original] });
    assert.deepEqual(plan.moves[0].data, original.data);
});

test('5. una entrada posterior usa la secuencia siguiente', () => {
    assert.deepEqual(allocateNextCheckin('INV-0013', 1), { guestId: 'INV-0013', sequence: 2, id: 'INV-0013-002' });
});

test('6. dos fechas iguales se desempatan por Document ID anterior', () => {
    const plan = createCheckinRenumberPlan({
        guests: [guest('INV-0001')],
        checkins: [checkin('z-old', 'INV-0001', 10), checkin('a-old', 'INV-0001', 10)]
    });
    assert.deepEqual(plan.moves.map((item) => item.oldId), ['a-old', 'z-old']);
});

test('7. el orden es determinista aunque cambie el orden de lectura', () => {
    const records = [checkin('b', 'INV-0001', 10), checkin('a', 'INV-0001', 10), checkin('c', 'INV-0001', 20)];
    const left = createCheckinRenumberPlan({ guests: [guest('INV-0001')], checkins: records });
    const right = createCheckinRenumberPlan({ guests: [guest('INV-0001')], checkins: [...records].reverse() });
    assert.deepEqual(left.moves.map((item) => item.newId + item.oldId), right.moves.map((item) => item.newId + item.oldId));
});

test('8. los IDs usan mínimo tres dígitos y no truncan después de 999', () => {
    assert.equal(formatCheckinId('INV-0001', 1), 'INV-0001-001');
    assert.equal(formatCheckinId('INV-0001', 999), 'INV-0001-999');
    assert.equal(formatCheckinId('INV-0001', 1000), 'INV-0001-1000');
    assert.deepEqual(parseCheckinId('INV-0001-1000'), { guestId: 'INV-0001', sequence: 1000 });
});

test('9. un destino existente diferente bloquea por conflicto', () => {
    const plan = createCheckinRenumberPlan({
        guests: [guest('INV-0001')],
        checkins: [checkin('auto-first', 'INV-0001', 1), checkin('INV-0001-001', 'INV-0001', 2)]
    });
    assert.equal(plan.canApply, false);
    assert.match(plan.conflicts.join('\n'), /ya existe/);
});

test('10. el backup incluye todos los originales y no altera sus datos', () => {
    const checkins = [checkin('auto-a', 'INV-0001', 1), checkin('auto-b', 'INV-0001', 2)];
    const guests = [guest('INV-0001', { checkinSecuencia: 7 })];
    const migration = createCheckinRenumberPlan({ guests, checkins });
    const payload = buildBackupPayload({ eventId: 'EVT-0001', event: { nombre: 'Evento' }, guests, checkins, migration });
    assert.deepEqual(payload.checkins.map((item) => item.oldDocumentId), ['auto-a', 'auto-b']);
    assert.equal(payload.checkins[0].data.resultado, 'aprobado');
    assert.match(backupFileName('EVT-0001', new Date(2026, 7, 11, 16, 47, 39)), /^EVT-0001-checkins-before-renumber-20260811-164739\.json$/);
});

test('11. el CLI es dry-run por defecto', () => {
    assert.deepEqual(parseArguments(['EVT-0001']), { valid: true, eventId: 'EVT-0001', apply: false });
    assert.equal(parseArguments(['EVT-0001', '--apply']).apply, true);
});

test('12. el apply simulado respeta crear-verificar-contador-borrar-verificar', async () => {
    const calls = [];
    const adapter = Object.fromEntries([
        'acquireLock', 'createNew', 'verifyCreated', 'updateGuestSequences',
        'verifyGuestSequences', 'deleteOld', 'verifyFinal', 'releaseLock'
    ].map((name) => [name, async () => { calls.push(name); }]));
    await executeMigrationPhases({ migration: { moves: [], guestSequenceUpdates: [] }, adapter });
    assert.deepEqual(calls, [
        'acquireLock', 'createNew', 'verifyCreated', 'updateGuestSequences',
        'verifyGuestSequences', 'deleteOld', 'verifyFinal', 'releaseLock'
    ]);
});

test('13. el contrato oficial crea checkinSecuencia en 0', () => {
    assert.equal(canonicalGuest().checkinSecuencia, 0);
    assert.throws(() => allocateNextCheckin('INV-0013', undefined), /invalid-sequence/);
});

test('14. el registro incrementa checkinSecuencia junto con los pases', () => {
    const result = mutation(0, 4);
    assert.equal(result.guestUpdate.checkinSecuencia, 1);
    assert.equal(result.guestUpdate.pasesUtilizados, 4);
    assert.equal(result.checkinId, 'INV-0013-001');
});

test('15. dos dispositivos que leen el mismo contador proponen el mismo candidato', () => {
    assert.equal(mutation(2).checkinId, 'INV-0013-003');
    assert.equal(mutation(2).checkinId, 'INV-0013-003');
});

test('16. el retry transaccional con el contador nuevo avanza a otro ID', () => {
    assert.equal(mutation(2).checkinId, 'INV-0013-003');
    assert.equal(mutation(3).checkinId, 'INV-0013-004');
});

test('17. los campos consumidos por el historial Portal permanecen intactos', () => {
    const original = checkin('auto', 'INV-0013', 10, { nombreInvitado: 'Familia', metodo: 'qr', resultado: 'parcial' });
    const plan = createCheckinRenumberPlan({ guests: [guest('INV-0013')], checkins: [original] });
    for (const field of ['invitadoId', 'codigoInvitado', 'nombreInvitado', 'fechaHora', 'metodo', 'resultado']) {
        assert.deepEqual(plan.moves[0].data[field], original.data[field]);
    }
});

test('18. los datos usados por estadísticas no cambian al renumerar', () => {
    const originals = [checkin('a', 'INV-0013', 1, { pasesRegistrados: 4 }), checkin('b', 'INV-0013', 2, { pasesRegistrados: 1 })];
    const plan = createCheckinRenumberPlan({ guests: [guest('INV-0013')], checkins: originals });
    assert.equal(plan.moves.reduce((sum, item) => sum + item.data.pasesRegistrados, 0), 5);
});

test('19. la propuesta de Rules exige prefijo, contador y whitelist acotada', async () => {
    const rules = await readFile(new URL('../firestore.rules.proposed', import.meta.url), 'utf8');
    assert.match(rules, /checkinIdMatchesGuest/);
    assert.match(rules, /after\.checkinSecuencia == before\.checkinSecuencia \+ 1/);
    assert.match(rules, /affectedKeys\(\)\.hasOnly/);
});

test('20. la verificación final exige igual total y solo IDs planificados', () => {
    const originals = [checkin('a', 'INV-0013', 1), checkin('b', 'INV-0013', 2)];
    const migration = createCheckinRenumberPlan({ guests: [guest('INV-0013')], checkins: originals });
    const finalRecords = migration.moves.map((move) => ({ id: move.newId, data: move.data }));
    assert.deepEqual(verifyFinalRecords(finalRecords, migration, originals.length), []);
    assert.match(verifyFinalRecords(finalRecords.slice(1), migration, originals.length).join('\n'), /total final/);
});
