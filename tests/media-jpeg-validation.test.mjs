import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sniffMediaMimeType, validateMediaSignature } from '../admin/invitations/core/media-schema.js';
import { validateMediaFileConsistency } from '../admin/invitations/core/media-processor.js';

const bytes = {
    jpeg: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
    png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    webp: Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')])
};
function file(name, type, data) {
    return { name, type, size: data.length, slice: () => ({ arrayBuffer: async () => data.buffer }) };
}

test('jpg y jpeg son equivalentes y conservan validación de firma', async () => {
    for (const name of ['foto.jpg', 'foto.jpeg']) {
        const result = await validateMediaFileConsistency(file(name, 'image/jpeg', bytes.jpeg), 'place');
        assert.equal(result.mime, 'image/jpeg');
        assert.equal(result.signature, 'image/jpeg');
    }
});

test('PNG y WebP válidos pasan; extensiones o firmas falseadas fallan', async () => {
    await assert.doesNotReject(validateMediaFileConsistency(file('foto.png', 'image/png', bytes.png), 'gallery'));
    await assert.doesNotReject(validateMediaFileConsistency(file('foto.webp', 'image/webp', bytes.webp), 'cover'));
    await assert.rejects(validateMediaFileConsistency(file('foto.jpg', 'image/jpeg', bytes.png), 'place'), /media\/mime-signature-mismatch|media\/signature-not-allowed/);
    await assert.rejects(validateMediaFileConsistency(file('foto.jpg', 'image/png', bytes.jpeg), 'place'), /media\/mime-signature-mismatch/);
    await assert.rejects(validateMediaFileConsistency(file('foto.jpg', 'image/jpeg', bytes.webp), 'place'), /media\/mime-signature-mismatch/);
});

test('sniffer y validador no confían únicamente en File.type', () => {
    assert.equal(sniffMediaMimeType(bytes.jpeg), 'image/jpeg');
    assert.deepEqual(validateMediaSignature({ declaredMime: 'image/jpeg', detectedMime: 'image/png', kind: 'image' }).ok, false);
});

test('los inputs de roles de imagen incluyen .jpg y .jpeg', async () => {
    const source = await readFile(new URL('../admin/invitations/editors/media-editor.js', import.meta.url), 'utf8');
    assert.equal((source.match(/\.jpg,\.jpeg,\.png,\.webp,image\/jpeg/g) ?? []).length, 4);
});

test('diagnóstico de media sólo se activa con la bandera explícita', async () => {
    const builder = await readFile(new URL('../admin/invitations/builder.js', import.meta.url), 'utf8');
    const processor = await readFile(new URL('../admin/invitations/core/media-processor.js', import.meta.url), 'utf8');
    assert.match(builder, /mediaDebug.*=== '1'/);
    assert.match(processor, /__INVITATION_DEBUG__/);
    assert.match(processor, /rawMime/);
    assert.match(processor, /normalizedMime/);
    assert.match(processor, /normalizedSignature/);
});
