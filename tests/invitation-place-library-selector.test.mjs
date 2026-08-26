import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const locationEditor = await readFile(new URL('../admin/invitations/editors/location-editor.js', import.meta.url), 'utf8');
const accommodationEditor = await readFile(new URL('../admin/invitations/editors/accommodation-editor.js', import.meta.url), 'utf8');

test('Sitios y hospedaje consume todo draft.media.place sin filtrar por estado', () => {
    assert.match(locationEditor, /selectField\('imageMediaId', 'Imagen del lugar'/);
    assert.match(locationEditor, /media\?\.place \?\? \[\]\)\.map\(\(asset\) =>/);
    assert.doesNotMatch(locationEditor, /media\?\.place \?\? \[\]\)\.filter\(/);
    assert.match(accommodationEditor, /selectField\('imageMediaId', 'Imagen del hospedaje'/);
    assert.match(accommodationEditor, /media\?\.place \?\? \[\]\)\.map\(\(asset\) =>/);
    assert.doesNotMatch(accommodationEditor, /media\?\.place \?\? \[\]\)\.filter\(/);
});

test('cinco assets, nombres repetidos y estados distintos conservan cinco IDs únicos', () => {
    const assets = [
        { id: 'MED-LOCAL-001', originalName: 'Aloha Bay Resort.png', status: 'uploaded', storagePath: '/one' },
        { id: 'MED-LOCAL-002', originalName: 'Aloha Bay Resort.png', status: 'ready', storagePath: '' },
        { id: 'MED-LOCAL-003', originalName: 'Catedral Aloha.png', status: 'uploaded', storagePath: '/three' },
        { id: 'MED-LOCAL-004', originalName: 'Playa Aloha.png', status: 'processing', storagePath: '' },
        { id: 'MED-LOCAL-005', originalName: 'Playa Aloha.png', status: 'uploaded', storagePath: '/five' }
    ];
    const options = assets.map((asset) => ({ value: asset.id, label: asset.originalName }));
    assert.equal(options.length, 5);
    assert.deepEqual(options.map(({ value }) => value), assets.map(({ id }) => id));
    assert.equal(new Set(options.map(({ value }) => value)).size, 5);
});
