import test from 'node:test';
import assert from 'node:assert/strict';
import { ProductionStorageAdapter } from '../functions/operator/storage-adapters.js';

function response(status, body = null) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function adapterWith(sequence, calls = []) {
    let index = 0;
    const auth = { async getClient() { return { async getRequestHeaders() { return { authorization: 'Bearer fake-token' }; } }; } };
    const fetchImpl = async (url, options) => {
        calls.push({ url: String(url), options });
        const next = sequence[Math.min(index++, sequence.length - 1)];
        if (next instanceof Error) throw next;
        return typeof next === 'function' ? next(url, options) : next;
    };
    return new ProductionStorageAdapter({ auth, fetchImpl });
}

test('lista una página, lista paginado y lista vacío', async () => {
    const calls = [];
    const adapter = adapterWith([
        response(200, { items: [{ name: 'media/a.webp', generation: '1' }], nextPageToken: 'next' }),
        response(200, { items: [{ name: 'media/b.webp', generation: '2' }] })
    ], calls);
    assert.deepEqual((await adapter.listObjects({ prefix: 'media/' })).items.map((item) => item.name), ['media/a.webp', 'media/b.webp']);
    assert.equal(new URL(calls[1].url).searchParams.get('pageToken'), 'next');
    assert.deepEqual((await adapterWith([response(200, {})]).listObjects({ prefix: 'none/' })).items, []);
});

test('bloquea token de página duplicado y valida objetos/respuestas', async () => {
    await assert.rejects(() => adapterWith([response(200, { items: [], nextPageToken: 'same' }), response(200, { items: [], nextPageToken: 'same' })]).listObjects({ prefix: 'x/' }), { code: 'STORAGE_API_INVALID_RESPONSE' });
    await assert.rejects(() => adapterWith([response(200, { items: [{ name: 'x', generation: 'bad' }] })]).listObjects({ prefix: 'x/' }), { code: 'STORAGE_API_INVALID_RESPONSE' });
    await assert.rejects(() => adapterWith([response(200, '{bad')]).getObjectMetadata('x'), { code: 'STORAGE_API_INVALID_RESPONSE' });
});

test('metadata y delete usan origin/bucket fijos, encoding y generación exacta', async () => {
    const calls = [];
    const adapter = adapterWith([response(200, { name: 'folder/a b#c?.webp', generation: '42' }), response(204)], calls);
    await adapter.getObjectMetadata('folder/a b#c?.webp');
    await adapter.deleteObjectIfGenerationMatch('folder/a b#c?.webp', '42');
    const deleteUrl = new URL(calls[1].url);
    assert.equal(deleteUrl.origin, 'https://storage.googleapis.com');
    assert.equal(deleteUrl.pathname, '/storage/v1/b/eventorastudio-d6d95.firebasestorage.app/o/folder%2Fa%20b%23c%3F.webp');
    assert.equal(deleteUrl.searchParams.get('ifGenerationMatch'), '42');
    assert.equal(calls[1].options.method, 'DELETE');
    assert.equal(calls[1].options.redirect, 'error');
    assert.equal(calls[1].options.headers.authorization, 'Bearer fake-token');
    await assert.rejects(() => adapter.deleteObjectIfGenerationMatch('x', ''), { code: 'STORAGE_GENERATION_MISSING' });
});

test('mapea 412, 404, autorización, retryable, timeout y redirect sin filtrar token', async () => {
    for (const [status, code] of [[412, 'GENERATION_MISMATCH'], [404, 'NOT_FOUND'], [401, 'STORAGE_AUTHORIZATION_ERROR'], [403, 'STORAGE_AUTHORIZATION_ERROR'], [429, 'STORAGE_UPSTREAM_RETRYABLE'], [500, 'STORAGE_UPSTREAM_RETRYABLE']]) {
        await assert.rejects(() => adapterWith([response(status)]).getObjectMetadata('x'), { code });
    }
    await assert.rejects(() => adapterWith([Object.assign(new Error('timeout Bearer fake-token'), { name: 'TimeoutError' })]).getObjectMetadata('x'), { code: 'STORAGE_UPSTREAM_TIMEOUT' });
    await assert.rejects(() => adapterWith([new TypeError('redirect Bearer fake-token')]).getObjectMetadata('x'), { code: 'STORAGE_UPSTREAM_RETRYABLE' });
});

test('no envía body y no implementa operaciones de escritura no requeridas', async () => {
    const calls = [];
    const adapter = adapterWith([response(204)], calls);
    await adapter.deleteObjectIfGenerationMatch('folder/object', '7');
    assert.equal(calls[0].options.body, undefined);
    assert.equal(typeof adapter.upload, 'undefined');
    assert.equal(typeof adapter.copy, 'undefined');
    assert.equal(typeof adapter.rewrite, 'undefined');
});
