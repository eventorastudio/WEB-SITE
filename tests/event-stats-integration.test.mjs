import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

async function readJavaScriptTree(relativeDirectory) {
    const root = new URL(`../${relativeDirectory}/`, import.meta.url);
    const files = [];
    async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
            if (entry.isDirectory()) await visit(url);
            else if (entry.name.endsWith('.js')) files.push({ url, source: await readFile(url, 'utf8') });
        }
    }
    await visit(root);
    return files;
}

test('ningún runtime Admin, Portal o Shared lee contadores legacy desde un evento', async () => {
    const files = (await Promise.all([
        readJavaScriptTree('admin'),
        readJavaScriptTree('portal'),
        readJavaScriptTree('shared')
    ])).flat();
    const legacyRead = /\b(?:event|eventData|evento|data)\??\.(?:totalInvitados|invitados|confirmados|pendientes|llegaron|noAsisten|noAsiste)\b/;
    const offenders = files.filter(({ source }) => legacyRead.test(source)).map(({ url }) => url.pathname);
    assert.deepEqual(offenders, []);
});

test('Dashboard sólo muestra Eventos en curso y no consume estadísticas de invitados', async () => {
    const [source, html] = await Promise.all([read('admin/dashboard.js'), read('admin/dashboard.html')]);
    assert.match(source, /isEventInProgress\(eventData\)/);
    assert.match(source, /Eventos en curso/);
    assert.doesNotMatch(source, /getStoredEventStats|eventStats|\.estadisticas|totalPases|pasesConfirmados|pasesPendientes|pasesUtilizados/);
    assert.doesNotMatch(source, /(?:data|event)\.(?:totalInvitados|invitados|confirmados|pendientes|llegaron)/);
    assert.doesNotMatch(source, /class="event-stats"|num-invitados|num-confirmados|num-pendientes/);
    assert.doesNotMatch(html, /num-invitados|num-confirmados|num-pendientes/);
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
    assert.match(source, /toEventStatsViewModel\(stats\)/);
    assert.doesNotMatch(source, /eventData\.(?:totalInvitados|invitados|confirmados|pendientes|llegaron|noAsisten|noAsiste)/);
    assert.doesNotMatch(source, /window\.location\.reload/);
});

test('CREATE UPDATE DELETE e IMPORT reconcilian el resumen después de escribir', async () => {
    const source = await read('admin/services/guest-service.js');
    assert.ok((source.match(/await reconcileEventStats\(eventId\)/g) || []).length >= 6);
    assert.match(source, /createEventStatsMutation/);
});

test('check-in limita al cliente Portal a invitado e historial, sin write sobre el evento padre', async () => {
    const source = await read('portal/services/checkin-service.js');
    const guestWrite = source.indexOf('transaction.update(guestRef');
    const checkinWrite = source.indexOf('transaction.set(checkinRef');
    assert.ok(guestWrite > 0 && checkinWrite > guestWrite);
    assert.doesNotMatch(source, /transaction\.update\(eventRef|createEventStatsMutation/);
});

test('las etiquetas distinguen registros de invitados y pases', async () => {
    const [eventHtml, dashboard] = await Promise.all([read('admin/event.html'), read('admin/dashboard.js')]);
    assert.match(eventHtml, /Registros de invitados/);
    assert.match(eventHtml, /Total pases/);
    assert.match(eventHtml, /Pases utilizados/);
    assert.doesNotMatch(dashboard, /Total pases|Pases confirmados|Pases pendientes|Llegadas registradas/);
});

test('el Dashboard conserva una composición responsive sin bloques estadísticos de evento', async () => {
    const css = await read('admin/assets/css/dashboard.css');
    for (const width of [1024, 768, 430]) assert.match(css, new RegExp(`max-width:\\s*${width}px`));
    assert.match(css, /\.stats-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    assert.match(css, /\.events-grid\s*\{[^}]*repeat\(auto-fill,\s*minmax\(300px,\s*1fr\)\)/s);
    assert.doesNotMatch(css, /\.event-stats\s*\{|\.event-stat-box\s*\{/);
});
