import test from 'node:test';
import assert from 'node:assert/strict';
import { compareEventDates, isValidEventDate, normalizeEventDate } from '../shared/event-date.js';
import { classifyEventDates } from '../scripts/audit-event-dates.mjs';

test('acepta fechas civiles válidas y no aplica timezone', () => {
    assert.equal(isValidEventDate('2026-09-10'), true);
    assert.equal(normalizeEventDate(' 2026-09-10 '), '2026-09-10');
    assert.equal(normalizeEventDate('2026-09-10T00:00:00.000Z'), '');
    assert.equal(compareEventDates('2026-09-10', '2026-09-10'), 0);
});

test('rechaza fechas inválidas y años fuera del rango razonable', () => {
    for (const value of ['2026-02-29', '2024-02-29x', '2026-04-31', '01/02/26', '02-01-2026', '1899-12-31', '2201-01-01']) {
        assert.equal(isValidEventDate(value), false, value);
    }
    assert.throws(() => normalizeEventDate('2026-02-30', { strict: true }), /invalid-civil-date/);
});

test('clasifica estados legacy sin escribir datos', () => {
    assert.equal(classifyEventDates('2026-09-10', '2026-09-10'), 'OK');
    assert.equal(classifyEventDates('2026-09-10', ''), 'ROOT_ONLY');
    assert.equal(classifyEventDates('', '2026-09-10'), 'DRAFT_ONLY');
    assert.equal(classifyEventDates('2026-09-10', '2026-09-11'), 'CONFLICT');
    assert.equal(classifyEventDates('', ''), 'MISSING');
    assert.equal(classifyEventDates('2026-02-30', '2026-09-10'), 'INVALID_ROOT');
    assert.equal(classifyEventDates('2026-09-10', '2026-02-30'), 'INVALID_DRAFT');
});
