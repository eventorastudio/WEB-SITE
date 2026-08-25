import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIcsEvent, escapeIcsText, getPublicCalendarUrl, handoffIcsEvent, safeIcsFilename } from '../admin/invitations/core/calendar-ics.js';
import { JSDOM } from 'jsdom';

test('genera DTSTART/DTEND local con duración y cruce de medianoche', () => {
    const result = buildIcsEvent({ eventId: 'EVT-0001', title: 'Andrea & Pablo', date: '2027-11-15', time: '23:00' });
    assert.equal(result.ok, true);
    assert.match(result.content, /DTSTART:20271115T230000/);
    assert.match(result.content, /DTEND:20271116T030000/);
    assert.match(result.content, /DTSTAMP:\d{8}T\d{6}Z/);
    assert.match(result.content, /\r\n/);
});

test('escapa texto ICS, UID y filename sin datos sensibles', () => {
    assert.equal(escapeIcsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
    const result = buildIcsEvent({ eventId: 'EVT/0001?secret', title: 'Á & B', date: '2027-01-02', time: '08:30', location: 'Lugar, Ciudad' });
    assert.match(result.content, /UID:calendar-EVT-0001-secret@eventorastudio\.com/);
    assert.match(result.content, /LOCATION:Lugar\\, Ciudad/);
    assert.equal(safeIcsFilename('Á & B'), 'a-b.ics');
    assert.ok(!result.content.includes('token'));
});

test('fecha u hora faltantes no generan VEVENT inválido', () => {
    assert.equal(buildIcsEvent({ date: '2027-01-02', time: '' }).ok, false);
    assert.equal(buildIcsEvent({ date: '', time: '08:30' }).ok, false);
});

test('handoff usa Web Share con File y hace fallback Blob sin URL externa', async () => {
    const dom = new JSDOM('<body></body>');
    const result = buildIcsEvent({ eventId: 'EVT-1', title: 'Evento', date: '2027-01-02', time: '08:30' });
    let shared = null;
    const nav = { userAgent: 'iPhone', share: async (value) => { shared = value; }, canShare: () => true };
    const sharedResult = await handoffIcsEvent(result, { documentRoot: dom.window.document, navigatorRoot: nav, urlApi: { createObjectURL() { throw new Error('no fallback'); } }, title: 'Evento' });
    assert.equal(sharedResult.strategy, 'share-file');
    assert.equal(shared.files[0].type, 'text/calendar;charset=utf-8');

    let clicked = false;
    const fallback = await handoffIcsEvent(result, { documentRoot: dom.window.document, navigatorRoot: { userAgent: 'iPhone' }, urlApi: { createObjectURL: () => 'blob:local', revokeObjectURL: () => {} } });
    assert.equal(fallback.strategy, 'blob-download');
    dom.window.close();
});

test('la acciÃ³n pÃºblica usa el endpoint HTTPS y no Google ni blob', () => {
    const url = getPublicCalendarUrl({ eventId: 'EVT-0001', publicKey: 'a'.repeat(48) });
    assert.match(url, /^https:\/\/us-central1-eventorastudio-d6d95\.cloudfunctions\.net\/calendar\?/);
    assert.match(url, /event=EVT-0001/);
    assert.match(url, /key=a{48}/);
    assert.doesNotMatch(url, /google|blob:/i);
});
