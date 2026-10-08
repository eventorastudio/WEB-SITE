import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGoogleCalendarUrl, buildIcsEvent, formatCalendarDate } from '../shared/utils/calendar.js';
import { buildGoogleMapsUrl } from '../shared/utils/maps.js';
import { buildQrCodeUrl } from '../shared/utils/qr.js';
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from '../shared/utils/whatsapp.js';
import { createDownloadBlob } from '../shared/utils/downloads.js';

const START = '2026-10-31T18:30:00-06:00';
const END = '2026-10-31T21:00:00-06:00';

test('calendar utility genera fechas Google Calendar e ICS compatibles', () => {
    assert.equal(formatCalendarDate(START), '20261101T003000Z');
    const googleUrl = buildGoogleCalendarUrl({
        title: 'Apertura & reunión',
        start: START,
        end: END,
        location: 'Saltillo, Coahuila',
        description: 'Detalles, agenda y contacto'
    });
    const google = new URL(googleUrl);
    assert.equal(google.searchParams.get('text'), 'Apertura & reunión');
    assert.match(google.searchParams.get('dates'), /^20261101T003000Z\/20261101T030000Z$/);

    const ics = buildIcsEvent({
        title: 'Apertura, reunión',
        start: START,
        end: END,
        location: 'Saltillo; Coahuila',
        description: 'Línea 1\nLínea 2',
        uid: 'test-event@example.com',
        timestamp: START
    });
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /SUMMARY:Apertura\\, reunión/);
    assert.match(ics, /LOCATION:Saltillo\\; Coahuila/);
    assert.match(ics, /DESCRIPTION:Línea 1\\nLínea 2/);
    assert.match(ics, /END:VCALENDAR\r\n$/);
});

test('WhatsApp normaliza teléfonos y codifica mensajes', () => {
    assert.equal(normalizeWhatsAppNumber('+52 (844) 123-4567'), '528441234567');
    const url = new URL(buildWhatsAppUrl('+52 (844) 123-4567', 'Hola Eventora & gracias'));
    assert.equal(url.hostname, 'wa.me');
    assert.equal(url.pathname, '/528441234567');
    assert.equal(url.searchParams.get('text'), 'Hola Eventora & gracias');
});

test('Maps acepta búsqueda, dirección y coordenadas', () => {
    assert.match(buildGoogleMapsUrl({ query: 'Eventora Studio Saltillo' }), /Eventora%20Studio%20Saltillo/);
    assert.match(buildGoogleMapsUrl({ address: 'Blvd. Venustiano Carranza 100' }), /Venustiano%20Carranza/);
    assert.match(buildGoogleMapsUrl({ latitude: 25.438, longitude: -100.973 }), /25\.438%2C-100\.973/);
});

test('QR genera una URL genérica y configurable sin tokens ni Firebase', () => {
    const url = new URL(buildQrCodeUrl('https://eventorastudio.com/menu?mesa=1', {
        size: 240,
        endpoint: 'https://qr.example.test/create'
    }));
    assert.equal(url.searchParams.get('size'), '240x240');
    assert.equal(url.searchParams.get('data'), 'https://eventorastudio.com/menu?mesa=1');
    assert.doesNotMatch(url.toString(), /firebase|guest|rsvp/i);
});

test('downloads crea un Blob reutilizable para documentos', async () => {
    const blob = createDownloadBlob('BEGIN:VCALENDAR\r\n', 'text/calendar;charset=utf-8');
    assert.equal(blob.type, 'text/calendar;charset=utf-8');
    assert.equal(await blob.text(), 'BEGIN:VCALENDAR\r\n');
});
