import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildReportDifferences,
    parseArguments,
    readLegacyStatsForReport
} from '../scripts/rebuild-event-stats.mjs';
import { calculateEventStats } from '../shared/event-stats.js';

test('rebuild de estadísticas es dry-run por defecto', () => {
    assert.deepEqual(parseArguments(['EVT-0001']), { valid: true, eventId: 'EVT-0001', apply: false });
});

test('rebuild sólo acepta --apply explícito', () => {
    assert.deepEqual(parseArguments(['EVT-0001', '--apply']), { valid: true, eventId: 'EVT-0001', apply: true });
    assert.equal(parseArguments(['EVT-0001', '--force']).valid, false);
    assert.equal(parseArguments(['../EVT-0001']).valid, false);
});

test('el reporte compara campos legacy sin convertirlos en fuente de la UI', () => {
    const legacy = readLegacyStatsForReport({ totalInvitados: 2, confirmados: 0, pendientes: 2, llegaron: 0 });
    const actual = calculateEventStats([
        { nombre: 'Pendiente', pases: 31, pasesUtilizados: 0, pasesDisponibles: 31, estado: 'pendiente' },
        { nombre: 'Llegó', pases: 15, pasesUtilizados: 15, pasesDisponibles: 0, estado: 'llego' }
    ]);
    const differences = buildReportDifferences(null, legacy, actual);
    assert.deepEqual(differences.totalPases, { stored: 2, actual: 46 });
    assert.deepEqual(differences.pasesConfirmados, { stored: 0, actual: 15 });
    assert.deepEqual(differences.pasesPendientes, { stored: 2, actual: 31 });
    assert.deepEqual(differences.pasesUtilizados, { stored: 0, actual: 15 });
});
