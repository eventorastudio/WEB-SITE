import test from 'node:test';
import assert from 'node:assert/strict';
import { main, parseArguments } from '../scripts/diagnose-invitation-media.mjs';

test('diagnostic requires explicit dry-run and safe event', () => {
    assert.equal(parseArguments(['--event', 'EVT-0001', '--dry-run']).valid, true);
    assert.equal(parseArguments(['--event', 'EVT-0001']).valid, false);
});

test('diagnostic CLI prints grouped safe summary using injected report', async () => {
    const lines = [];
    const report = {
        event: 'EVT-0001', projectId: 'eventorastudio-d6d95', bucket: 'eventorastudio-d6d95.firebasestorage.app',
        indexByRole: { cover: [], gallery: ['MED-LOCAL-001'], dressCode: [], place: [], video: [], videoPoster: [], music: [] },
        documents: [{ id: 'MED-LOCAL-001', role: 'gallery', storagePath: '' }],
        files: [{ path: 'media/gallery/MED-LOCAL-001-abcdef123456.webp', mediaId: 'MED-LOCAL-001', rolePath: 'gallery' }],
        classifications: { A: ['MED-LOCAL-001'], B: [], C: [], D: [], E: [], F: [] }
    };
    const result = await main(['--event', 'EVT-0001', '--dry-run'], { initialize: false, inspectFn: async () => report, output: { log: (line) => lines.push(String(line)), error: () => assert.fail('unexpected error') } });
    assert.equal(result, report);
    assert.match(lines.join('\n'), /gallery: 1/);
    assert.match(lines.join('\n'), /NO CHANGES PERFORMED/);
});
