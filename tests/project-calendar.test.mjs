import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMonthGrid, calendarRange, deriveProjectEvents, filterEvents } from '../proyectos/calendar.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('calendario genera una cuadrícula mensual de lunes a domingo', () => {
  const cells = buildMonthGrid(2026, 9);
  assert.equal(cells.length, 42);
  assert.equal(cells[0].key, '2026-09-28');
  assert.equal(cells[3].key, '2026-10-01');
});

test('rango mensual incluye las semanas completas visibles', () => {
  assert.deepEqual(calendarRange(2026, 9), { start: '2026-09-28', end: '2026-11-08' });
});

test('fechas automáticas respetan servicios activos y no crean duplicados', () => {
  const events = deriveProjectEvents({ id: 'yas', businessName: 'Yogurt Arte Sanar', maintenanceEnabled: true, hostingEnabled: true, nextMaintenanceReviewAt: '2026-11-08', nextQuarterlyReviewAt: '2027-01-08', hostingRenewalDate: '2027-10-08', maintenanceRenewalDate: '2027-10-08' }, { start: '2026-11-01', end: '2027-11-01' });
  assert.equal(events.length, 4);
  assert.equal(new Set(events.map((event) => event.id)).size, 4);
  assert.equal(deriveProjectEvents({ id: 'off', maintenanceEnabled: false, hostingEnabled: false, nextMaintenanceReviewAt: '2026-11-08', hostingRenewalDate: '2026-11-08' }, { start: '2026-11-01', end: '2026-12-01' }).length, 0);
});

test('filtros distinguen renovaciones, manuales y proyectos', () => {
  const events = [{ source: 'project', type: 'hosting-renewal', projectId: 'a', title: 'Hosting', projectName: 'A' }, { source: 'manual', type: 'client', projectId: 'b', title: 'Fotos', projectName: 'B' }];
  assert.equal(filterEvents(events, { type: 'renewal' }).length, 1);
  assert.equal(filterEvents(events, { type: 'manual', projectId: 'b' }).length, 1);
  assert.equal(filterEvents(events, { query: 'fotos' }).length, 1);
});

test('panel y backend exponen la vista y funciones protegidas del calendario', () => {
  const html = read('proyectos/index.html');
  const script = read('proyectos/script.js');
  const functions = read('functions/src/calendar.js');
  assert.match(html, /Calendario/);
  assert.match(html, /noindex,nofollow/);
  assert.match(script, /getCalendarEvents/);
  for (const name of ['getCalendarEvents', 'createCalendarEvent', 'updateCalendarEvent', 'deleteCalendarEvent']) assert.match(functions, new RegExp(`export const ${name}`));
  assert.match(functions, /calendarEvents/);
  assert.match(functions, /requireProjectAdmin/);
  assert.match(functions, /FieldValue\.serverTimestamp/);
});
