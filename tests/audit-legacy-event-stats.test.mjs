import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    auditLegacyEventData,
    parseArguments
} from '../scripts/audit-legacy-event-stats.mjs';

const canonical = {
    guestCount: 21,
    totalPases: 46,
    pasesConfirmados: 15,
    pasesPendientes: 31,
    pasesNoAsistiran: 0,
    pasesUtilizados: 12,
    pasesDisponibles: 34,
    gruposConfirmados: 6,
    gruposPendientes: 15,
    gruposNoAsistiran: 0,
    gruposConLlegada: 6
};

test('audita raíces legacy y conserva por separado el contrato canónico', () => {
    const audit = auditLegacyEventData('EVT-0001', {
        totalInvitados: 2,
        confirmados: 0,
        pendientes: 2,
        llegaron: 0,
        estadisticas: canonical
    });
    assert.equal(audit.hasLegacyFields, true);
    assert.deepEqual(audit.legacy, { totalInvitados: 2, confirmados: 0, pendientes: 2, llegaron: 0 });
    assert.deepEqual(audit.estadisticas, canonical);
    assert.match(audit.status, /IGNORED BY APPLICATION/);
});

test('el CLI acepta un evento opcional y rechaza rutas', () => {
    assert.deepEqual(parseArguments([]), { valid: true, eventId: null });
    assert.deepEqual(parseArguments(['EVT-0001']), { valid: true, eventId: 'EVT-0001' });
    assert.equal(parseArguments(['../EVT-0001']).valid, false);
});

test('la herramienta no contiene operaciones de escritura Firestore', async () => {
    const source = await readFile(new URL('../scripts/audit-legacy-event-stats.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.(?:set|update|delete|create)\s*\(/);
    assert.doesNotMatch(source, /writeBatch|runTransaction|FieldValue/);
});
