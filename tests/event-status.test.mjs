import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getEventStatusPresentation,
    isEventInProgress,
    normalizeEventLifecycleStatus
} from '../shared/event-status.js';

test('Eventos en curso cuenta exclusivamente estadoEvento Activo', () => {
    assert.equal(isEventInProgress({ estadoEvento: 'Activo' }), true);
    assert.equal(isEventInProgress({ estadoEvento: 'Finalizado' }), false);
});

test('estadoevento legacy y estado geográfico no alteran el ciclo de vida', () => {
    const event = { estadoEvento: 'Borrador', estadoevento: 'activo', estado: 'Coahuila' };
    assert.equal(isEventInProgress(event), false);
    assert.deepEqual(getEventStatusPresentation(event), {
        status: 'borrador',
        label: 'Borrador',
        className: 'borrador'
    });
});

test('un ciclo de vida ausente o desconocido queda controlado como Borrador', () => {
    assert.equal(normalizeEventLifecycleStatus({ estadoevento: 'activo' }), 'borrador');
    assert.equal(normalizeEventLifecycleStatus({ estadoEvento: 'desconocido' }), 'borrador');
});
