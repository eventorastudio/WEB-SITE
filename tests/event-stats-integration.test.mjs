import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('Dashboard y Eventos recientes sólo consumen el resumen canónico', async () => {
    const source = await read('admin/dashboard.js');
    assert.match(source, /getStoredEventStats\(data\)/);
    assert.match(source, /eventStats\?\.totalPases/);
    assert.doesNotMatch(source, /data\.(?:totalInvitados|invitados|confirmados|pendientes|llegaron)/);
    assert.doesNotMatch(source, /event\.(?:totalInvitados|invitados|confirmados|pendientes|llegaron)/);
});

test('event.html carga estadísticas reales antes de almacenar y renderizar el estado', async () => {
    const source = await read('admin/event.js');
    const recalculateAt = source.indexOf('recalculateEventStats(eventId, { sync: true })');
    const storeAt = source.indexOf('storeStateAndContext(session, eventId, eventData, eventStats)');
    assert.ok(recalculateAt > 0 && storeAt > recalculateAt);
    assert.match(source, /stats: eventStats/);
    assert.match(source, /EVENT_STATS_UPDATED/);
});

test('el controlador nunca reconstruye estadísticas desde campos legacy del evento', async () => {
    const source = await read('admin/modules/event-controller.js');
    assert.match(source, /getState\('event\.stats'\)/);
    assert.match(source, /pasesUtilizados/);
    assert.doesNotMatch(source, /eventData\.(?:totalInvitados|invitados|confirmados|pendientes|llegaron|noAsisten|noAsiste)/);
    assert.doesNotMatch(source, /window\.location\.reload/);
});

test('CREATE UPDATE DELETE e IMPORT reconcilian el resumen después de escribir', async () => {
    const source = await read('admin/services/guest-service.js');
    assert.ok((source.match(/await reconcileEventStats\(eventId\)/g) || []).length >= 6);
    assert.match(source, /createEventStatsMutation/);
});

test('check-in actualiza invitado, historial y resumen del evento en la misma transacción', async () => {
    const source = await read('portal/services/checkin-service.js');
    const guestWrite = source.indexOf('transaction.update(guestRef');
    const checkinWrite = source.indexOf('transaction.set(checkinRef');
    const statsWrite = source.indexOf('transaction.update(eventRef, createEventStatsMutation');
    assert.ok(guestWrite > 0 && checkinWrite > guestWrite && statsWrite > checkinWrite);
});

test('las etiquetas distinguen registros de invitados y pases', async () => {
    const [eventHtml, dashboard] = await Promise.all([read('admin/event.html'), read('admin/dashboard.js')]);
    assert.match(eventHtml, /Registros de invitados/);
    assert.match(eventHtml, /Total pases/);
    assert.match(eventHtml, /Pases utilizados/);
    assert.match(dashboard, /Total pases/);
});
