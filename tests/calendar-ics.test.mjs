import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIcsEvent, escapeIcsText, safeIcsFilename } from '../admin/invitations/core/calendar-ics.js';

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
