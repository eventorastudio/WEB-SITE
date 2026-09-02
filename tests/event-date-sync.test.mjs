import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildDraftEventDatePatch,
    buildRootEventDatePatch
} from '../shared/event-date-sync.js';

test('no genera escritura cuando la fecha ya es igual', () => {
    const draft = { content: { schedule: { date: '2030-06-15' } } };
    assert.deepEqual(buildRootEventDatePatch({ fecha: '2030-06-15' }, '2030-06-15'), {});
    assert.deepEqual(buildDraftEventDatePatch(draft, '2030-06-15'), {});
});

test('genera parches mínimos y conserva el resto del draft', () => {
    const draft = { content: { schedule: { date: '2030-06-15' } }, settings: { demoMode: true } };
    assert.deepEqual(buildRootEventDatePatch({ fecha: '2030-06-16', estado: 'activo' }, '2030-06-15'), { fecha: '2030-06-15' });
    assert.deepEqual(buildDraftEventDatePatch(draft, '2030-06-16'), { 'content.schedule.date': '2030-06-16' });
    assert.equal(draft.settings.demoMode, true);
});

test('rechaza fechas inválidas y evita normalización UTC', () => {
    assert.throws(() => buildRootEventDatePatch({}, '2030-02-30'), /event-date\/invalid-civil-date/);
    assert.deepEqual(buildRootEventDatePatch({}, '2030-02-28'), { fecha: '2030-02-28' });
    assert.deepEqual(buildDraftEventDatePatch({}, '2032-02-29'), { 'content.schedule.date': '2032-02-29' });
});
