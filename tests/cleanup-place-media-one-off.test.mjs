import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../scripts/cleanup-place-media-one-off.mjs';

test('CLI dry-run invokes diagnostic flow and prints safe summary', async () => {
    const lines = [];
    const errors = [];
    const output = { log: (line) => lines.push(String(line)), error: (line) => errors.push(String(line)) };
    let inspectedEvent = '';
    const report = {
        indexedIds: ['MED-LOCAL-001'],
        placeDocs: [{ id: 'MED-LOCAL-001' }],
        files: [{ path: 'eventos/EVT-0001/invitacion/media/place/MED-LOCAL-001-abcdef123456.webp' }],
        validDocs: [{ id: 'MED-LOCAL-001' }],
        brokenRefs: [], orphanDocs: [], orphanFiles: [], configExists: true
    };
    const result = await main(['--event', 'EVT-0001', '--dry-run'], {
        initialize: false,
        output,
        inspectFn: async (event) => { inspectedEvent = event; return report; }
    });
    const text = lines.join('\n');
    assert.equal(inspectedEvent, 'EVT-0001');
    assert.equal(result, report);
    assert.match(text, /PLACE MEDIA CLEANUP DRY RUN/);
    assert.match(text, /placeIds count: 1/);
    assert.match(text, /place role count: 1/);
    assert.match(text, /place object count: 1/);
    assert.match(text, /NO CHANGES PERFORMED/);
    assert.deepEqual(errors, []);
});

test('CLI reports invalid arguments instead of exiting silently', async () => {
    const errors = [];
    await main(['--event', 'EVT-0001'], { setExitCode: false, output: { log() {}, error: (line) => errors.push(String(line)) } });
    assert.match(errors[0], /ERROR:.*Dry-run is mandatory/);
});
