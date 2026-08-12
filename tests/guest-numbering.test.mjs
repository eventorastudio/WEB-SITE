import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildGuestRenumberPlan,
    compareGuestsForNumbering,
    findNextAvailableGuestSequence,
    formatGuestId,
    normalizeGuestSortName,
    parseGuestId,
    planCheckinReferenceUpdates,
    selectNextAvailableGuestSequence
} from '../shared/guest-numbering.js';
import {
    backupFileName,
    buildBackupPayload,
    chunkWrites,
    createMigrationPlan,
    executeMigrationPhases,
    parseArguments,
    verifyCreatedRecords,
    verifyFinalRecords,
    verifyNoOldReferences,
    verifyReferenceRecords,
    verifySourceUnchanged
} from '../scripts/renumber-guests-alphabetically.mjs';

function guest(id, nombre, overrides = {}) {
    return {
        id,
        data: {
            nombre,
            codigoInvitado: id,
            qrToken: `token_${id.padEnd(16, '_')}`,
            pases: 2,
            pasesUtilizados: 0,
            pasesDisponibles: 2,
            ...overrides
        }
    };
}

test('formatea IDs con cuatro dígitos mínimos y sin truncar', () => {
    assert.equal(formatGuestId(1), 'INV-0001');
    assert.equal(formatGuestId(99), 'INV-0099');
    assert.equal(formatGuestId(10_000), 'INV-10000');
    assert.equal(parseGuestId('INV-0100'), 100);
    assert.equal(parseGuestId('INV-10000'), 10_000);
    assert.equal(parseGuestId('INV-12'), null);
});

test('ordena en español ignorando acentos y conserva desempates deterministas', () => {
    const records = [
        guest('z', 'José'),
        guest('b', 'Érika'),
        guest('d', 'Carlos'),
        guest('c', 'Andrea'),
        guest('a', 'Ángel')
    ].sort(compareGuestsForNumbering);
    assert.deepEqual(records.map((item) => item.data.nombre), ['Andrea', 'Ángel', 'Carlos', 'Érika', 'José']);
    assert.equal(normalizeGuestSortName('  ÁNGEL  '), 'angel');

    const duplicates = [
        guest('doc-b', 'Ana', { codigoInvitado: 'OLD-2' }),
        guest('doc-a', 'Ana', { codigoInvitado: 'OLD-1' })
    ].sort(compareGuestsForNumbering);
    assert.deepEqual(duplicates.map((item) => item.id), ['doc-a', 'doc-b']);
});

test('conserva INV-0001 y numera veinte IDs automáticos desde INV-0002', () => {
    const guests = [guest('INV-0001', 'Luis')];
    for (let index = 20; index >= 1; index -= 1) guests.push(guest(`auto-${index}`, `Nombre ${String(index).padStart(2, '0')}`));
    const plan = buildGuestRenumberPlan(guests);
    assert.equal(plan.canApply, true);
    assert.equal(plan.preserved[0].oldId, 'INV-0001');
    assert.equal(plan.moves.length, 20);
    assert.equal(plan.moves[0].newId, 'INV-0002');
    assert.equal(plan.moves[19].newId, 'INV-0021');
});

test('sincroniza código vacío o legado y conserva QR y datos restantes', () => {
    const source = guest('auto-a', 'Andrea', {
        codigoInvitado: '',
        qrToken: 'qr_token_original_1234',
        mesa: 7,
        campoLegitimo: { valor: true }
    });
    const plan = buildGuestRenumberPlan([guest('INV-0001', 'Luis'), source]);
    const [move] = plan.moves;
    assert.equal(move.newId, 'INV-0002');
    assert.equal(move.newData.codigoInvitado, 'INV-0002');
    assert.equal(move.newData.qrToken, source.data.qrToken);
    assert.equal(move.newData.mesa, 7);
    assert.deepEqual(move.newData.campoLegitimo, { valor: true });
});

test('bloquea una colisión con un INV-XXXX ocupado por otro invitado', () => {
    const plan = buildGuestRenumberPlan([
        guest('INV-0001', 'Luis'),
        guest('INV-0005', 'Aaron'),
        guest('auto-b', 'Beto'),
        guest('auto-c', 'Carlos'),
        guest('auto-d', 'Diana')
    ]);
    assert.equal(plan.canApply, false);
    assert.ok(plan.conflicts.some((conflict) => conflict.targetId === 'INV-0005'));
});

test('actualiza únicamente referencias de identidad en checkins', () => {
    const moves = buildGuestRenumberPlan([
        guest('INV-0001', 'Luis'),
        guest('old-a', 'Andrea', { codigoInvitado: 'OLD-A' })
    ]).moves;
    const checkin = {
        id: 'check-1',
        data: {
            invitadoId: 'old-a',
            codigoInvitado: 'OLD-A',
            fechaHora: 'sin-cambios',
            pasesRegistrados: 1,
            metodo: 'qr'
        }
    };
    const plan = planCheckinReferenceUpdates([checkin], moves);
    assert.deepEqual(plan.updates[0].patch, {
        invitadoId: 'INV-0002',
        codigoInvitado: 'INV-0002'
    });
    const updated = { ...checkin.data, ...plan.updates[0].patch };
    assert.deepEqual(verifyReferenceRecords([{ id: 'check-1', data: updated }], plan.updates), []);
    assert.deepEqual(verifyNoOldReferences([{ id: 'check-1', data: updated }], moves), []);
    assert.ok(verifyNoOldReferences([checkin], moves).length > 0);
});

test('funciona sin checkins y reporta cero referencias', () => {
    const plan = createMigrationPlan({
        eventId: 'EVT-0001',
        guests: [guest('INV-0001', 'Luis'), guest('auto-a', 'Andrea')],
        checkins: []
    });
    assert.equal(plan.checkinsAffected, 0);
    assert.deepEqual(plan.referenceUpdates, []);
});

test('un evento nuevo finaliza su numeración desde INV-0001 sin reserva especial', () => {
    const plan = createMigrationPlan({
        eventId: 'EVT-0002',
        guests: [guest('auto-c', 'Carlos'), guest('auto-a', 'Andrea')],
        checkins: []
    });
    assert.equal(plan.protectedGuestId, null);
    assert.deepEqual(plan.moves.map((move) => [move.name, move.newId]), [
        ['Andrea', 'INV-0001'],
        ['Carlos', 'INV-0002']
    ]);
    assert.equal(plan.canApply, true);
});

test('el CLI es dry-run por defecto y --apply debe ser explícito', () => {
    assert.deepEqual(parseArguments(['EVT-0001']), { valid: true, eventId: 'EVT-0001', apply: false });
    assert.deepEqual(parseArguments(['EVT-0001', '--apply']), { valid: true, eventId: 'EVT-0001', apply: true });
    assert.equal(parseArguments(['EVT-0001', '--yes']).valid, false);
});

test('el backup contiene evento, invitados, checkins y plan de recuperación', () => {
    const guests = [guest('INV-0001', 'Luis'), guest('auto-a', 'Andrea')];
    const checkins = [{ id: 'check-1', data: { invitadoId: 'auto-a' } }];
    const migration = createMigrationPlan({ eventId: 'EVT-0001', guests, checkins });
    const payload = buildBackupPayload({
        eventId: 'EVT-0001',
        event: { guestListFinalized: false },
        guests,
        checkins,
        migration,
        createdAt: new Date('2026-01-02T03:04:05Z')
    });
    assert.equal(payload.format, 'eventora-guest-renumber-backup-v1');
    assert.equal(payload.guests.length, 2);
    assert.equal(payload.checkins.length, 1);
    assert.equal(payload.plan.moves[0].newId, 'INV-0002');
    assert.match(backupFileName('EVT-0001', new Date('2026-01-02T03:04:05Z')), /^EVT-0001-before-guest-renumber-/);
});

test('divide operaciones en batches de máximo 400', () => {
    const chunks = chunkWrites(Array.from({ length: 801 }, (_, index) => index));
    assert.deepEqual(chunks.map((chunk) => chunk.length), [400, 400, 1]);
});

test('bloquea si invitados o checkins cambian después de construir el plan', () => {
    const initial = [guest('INV-0001', 'Luis')];
    assert.deepEqual(verifySourceUnchanged(initial, initial, 'invitados'), []);
    const changed = [guest('INV-0001', 'Luis', { mesa: 99 })];
    assert.match(verifySourceUnchanged(changed, initial, 'invitados')[0], /cambió después del plan/);
});

test('detiene las fases en el primer fallo y no borra orígenes', async () => {
    const calls = [];
    const adapter = {
        acquireLock: async () => calls.push('lock'),
        createGuests: async () => calls.push('create'),
        verifyCreated: async () => { calls.push('verify-created'); throw new Error('fallo simulado'); },
        updateReferences: async () => calls.push('references'),
        verifyReferences: async () => calls.push('verify-references'),
        deleteOldGuests: async () => calls.push('delete'),
        verifyFinal: async () => calls.push('verify-final'),
        finalize: async () => calls.push('finalize')
    };
    await assert.rejects(
        executeMigrationPhases({ migration: { moves: [], referenceUpdates: [], totalGuests: 1 }, adapter, backupPath: 'backup.json' }),
        /verificar documentos destino/
    );
    assert.deepEqual(calls, ['lock', 'create', 'verify-created']);
});

test('apply simulado respeta el orden crear-verificar-referencias-borrar-finalizar', async () => {
    const calls = [];
    const adapter = Object.fromEntries([
        ['acquireLock', 'lock'],
        ['createGuests', 'create'],
        ['verifyCreated', 'verify-created'],
        ['updateReferences', 'references'],
        ['verifyReferences', 'verify-references'],
        ['deleteOldGuests', 'delete'],
        ['verifyFinal', 'verify-final'],
        ['finalize', 'finalize']
    ].map(([method, label]) => [method, async () => calls.push(label)]));
    await executeMigrationPhases({
        migration: { moves: [], referenceUpdates: [], totalGuests: 1 },
        adapter,
        backupPath: 'backup.json'
    });
    assert.deepEqual(calls, [
        'lock', 'create', 'verify-created', 'references',
        'verify-references', 'delete', 'verify-final', 'finalize'
    ]);
});

test('la verificación posterior exige secuencia continua e integridad', () => {
    const migration = createMigrationPlan({
        eventId: 'EVT-0001',
        guests: [guest('INV-0001', 'Luis'), guest('old-a', 'Andrea')],
        checkins: []
    });
    const records = [
        guest('INV-0001', 'Luis'),
        { id: 'INV-0002', data: migration.moves[0].newData }
    ];
    assert.deepEqual(verifyCreatedRecords(records, migration.moves), []);
    assert.deepEqual(verifyFinalRecords(records, migration), []);
    assert.ok(verifyFinalRecords([records[0]], migration).length > 0);
});

test('selecciona el siguiente ID libre sin usar count + 1', () => {
    assert.deepEqual(selectNextAvailableGuestSequence(0, new Set()), { sequence: 1, id: 'INV-0001' });
    assert.deepEqual(
        selectNextAvailableGuestSequence(4, new Set(['INV-0005', 'INV-0006'])),
        { sequence: 7, id: 'INV-0007' }
    );
    assert.deepEqual(
        selectNextAvailableGuestSequence(125, new Set()),
        { sequence: 126, id: 'INV-0126' }
    );
});

test('la reserva asíncrona comprueba colisiones dentro de la transacción', async () => {
    const occupied = new Set(['INV-0005', 'INV-0006']);
    const allocation = await findNextAvailableGuestSequence(4, async (id) => occupied.has(id));
    assert.deepEqual(allocation, { sequence: 7, id: 'INV-0007' });
});

test('dos altas simultáneas terminan con secuencias distintas al reintentar la transacción', async () => {
    const state = { sequence: 0, version: 0, occupied: new Set() };
    async function reserveLikeFirestoreTransaction() {
        for (;;) {
            const readVersion = state.version;
            const readSequence = state.sequence;
            const allocation = await findNextAvailableGuestSequence(
                readSequence,
                async (id) => state.occupied.has(id)
            );
            await Promise.resolve();
            if (readVersion !== state.version) continue;
            state.sequence = allocation.sequence;
            state.occupied.add(allocation.id);
            state.version += 1;
            return allocation.id;
        }
    }

    const ids = await Promise.all([reserveLikeFirestoreTransaction(), reserveLikeFirestoreTransaction()]);
    assert.deepEqual(ids.sort(), ['INV-0001', 'INV-0002']);
});
