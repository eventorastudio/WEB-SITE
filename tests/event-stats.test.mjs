import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyGuestStatsChanges,
    calculateEventStats,
    createEmptyEventStats,
    createEventStatsMutation,
    diffEventStats,
    getStoredEventStats
} from '../shared/event-stats.js';

const guests = [
    { id: 'A', nombre: 'Pendiente', pases: 31, pasesUtilizados: 0, pasesDisponibles: 31, estado: 'pendiente' },
    { id: 'B', nombre: 'Llegó', pases: 15, pasesUtilizados: 15, pasesDisponibles: 0, estado: 'llego' }
];

test('calcula pases y registros sin confundir sus unidades', () => {
    assert.deepEqual(calculateEventStats(guests), {
        guestCount: 2,
        totalPases: 46,
        pasesConfirmados: 15,
        pasesPendientes: 31,
        pasesNoAsistiran: 0,
        pasesUtilizados: 15,
        pasesDisponibles: 31,
        gruposConfirmados: 1,
        gruposPendientes: 1,
        gruposNoAsistiran: 0,
        gruposConLlegada: 1
    });
});

test('un check-in parcial usa pasesUtilizados y conserva pases confirmados', () => {
    const confirmed = { id: 'C', nombre: 'Confirmado', pases: 10, pasesUtilizados: 0, pasesDisponibles: 10, estado: 'confirmado' };
    const initial = calculateEventStats([confirmed]);
    const next = applyGuestStatsChanges(initial, [{
        before: confirmed,
        after: { ...confirmed, estado: 'llego', pasesUtilizados: 4, pasesDisponibles: 6 }
    }]);
    assert.equal(next.pasesConfirmados, 10);
    assert.equal(next.pasesUtilizados, 4);
    assert.equal(next.pasesDisponibles, 6);
    assert.equal(next.gruposConLlegada, 1);
});

test('una transición pendiente a llegó mueve la categoría completa y sólo usa los pases registrados', () => {
    const before = { id: 'A', nombre: 'Ana', pases: 4, pasesUtilizados: 0, pasesDisponibles: 4, estado: 'pendiente' };
    const after = { ...before, estado: 'llego', pasesUtilizados: 1, pasesDisponibles: 3 };
    const next = applyGuestStatsChanges(calculateEventStats([before]), [{ before, after }]);
    assert.equal(next.pasesPendientes, 0);
    assert.equal(next.pasesConfirmados, 4);
    assert.equal(next.pasesUtilizados, 1);
});

test('el resumen legacy no se acepta como canónico', () => {
    assert.equal(getStoredEventStats({ totalInvitados: 2, confirmados: 0, pendientes: 2 }), null);
    assert.deepEqual(getStoredEventStats({ estadisticas: createEmptyEventStats() }), createEmptyEventStats());
});

test('la mutación incrementa revisión aun si el evento todavía no fue reconstruido', () => {
    const patch = createEventStatsMutation({ statsRevision: 7 }, [{ after: guests[0] }], 'timestamp');
    assert.deepEqual(patch, { statsRevision: 8 });
});

test('reporta diferencias campo por campo', () => {
    const actual = calculateEventStats(guests);
    const stored = { ...actual, totalPases: 2, pasesPendientes: 2, pasesConfirmados: 0, pasesDisponibles: 2 };
    const differences = diffEventStats(stored, actual);
    assert.equal(differences.totalPases.actual, 46);
    assert.equal(differences.totalPases.stored, null);
});
