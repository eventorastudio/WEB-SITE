import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarHttpHandler } from '../functions/src/calendar-http.js';

const PUBLIC_KEY = 'a'.repeat(48);

function responseDouble() {
    const headers = {};
    return {
        headers,
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        set(name, value) { headers[name] = value; return this; },
        send(body) { this.body = body; return this; }
    };
}

function handlerFor(projection) {
    const db = { doc: () => ({ get: async () => ({ exists: Boolean(projection), data: () => projection }) }) };
    return createCalendarHttpHandler({ db, now: () => new Date('2027-01-02T12:34:56Z') });
}

test('Function calendar devuelve ICS pÃºblico con headers y sin secretos', async () => {
    const response = responseDouble();
    await handlerFor({
        content: {
            identity: { primaryName: 'Andrea', secondaryName: 'Pablo' },
            schedule: { date: '2027-11-15', time: '18:00' },
            welcome: { message: 'Nos vemos pronto' }
        },
        locations: [{ venueName: 'SalÃ³n, Centro', address: 'Av. Uno', city: 'CDMX', state: 'CDMX' }]
    })({ method: 'GET', query: { event: 'EVT-0001', key: PUBLIC_KEY } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Content-Type'], 'text/calendar; charset=utf-8');
    assert.match(response.headers['Content-Disposition'], /\.ics"/);
    assert.match(response.body, /BEGIN:VCALENDAR/);
    assert.match(response.body, /SUMMARY:Andrea & Pablo/);
    assert.match(response.body, /DTSTART:20271115T180000/);
    assert.match(response.body, /DTEND:20271115T220000/);
    assert.match(response.body, /LOCATION:SalÃ³n\\, Centro/);
    assert.doesNotMatch(response.body, /rsvpToken|qrToken|guestId/);
});

test('Function rechaza key/evento invÃ¡lido y fecha ausente sin filtrar detalles', async () => {
    const invalid = responseDouble();
    await handlerFor({})({ method: 'GET', query: { event: '../EVT', key: 'bad' } }, invalid);
    assert.equal(invalid.statusCode, 404);
    assert.equal(invalid.body, 'Not found.');

    const missingDate = responseDouble();
    await handlerFor({ content: { schedule: { time: '18:00' } } })({ method: 'GET', query: { event: 'EVT-0001', key: PUBLIC_KEY } }, missingDate);
    assert.equal(missingDate.statusCode, 422);
    assert.equal(missingDate.body, 'Calendar data unavailable.');
});

test('Function conserva el ICS y cambia solo inline/attachment con download=1', async () => {
    const projection = { content: { identity: { primaryName: 'Evento' }, schedule: { date: '2027-01-02', time: '18:00' } } };
    const inline = responseDouble();
    const download = responseDouble();
    const handler = handlerFor(projection);
    await handler({ method: 'GET', query: { event: 'EVT-0001', key: PUBLIC_KEY } }, inline);
    await handler({ method: 'GET', query: { event: 'EVT-0001', key: PUBLIC_KEY, download: '1' } }, download);
    assert.equal(inline.statusCode, 200);
    assert.equal(download.statusCode, 200);
    assert.equal(inline.body, download.body);
    assert.equal(inline.headers['Content-Type'], download.headers['Content-Type']);
    assert.match(inline.headers['Content-Disposition'], /^inline;/);
    assert.match(download.headers['Content-Disposition'], /^attachment;/);
});
