import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperatorServiceHandler, MAX_BODY_BYTES } from '../functions/operator/refund-purge-service.js';
import { createRefundPurgeOperatorAdapter } from '../functions/operator/refund-purge-adapter.js';
import { executeRefundProjectPurge } from '../functions/src/purge/refund-purge-executor.js';

async function request(handler, { method = 'POST', path = '/v1/execute', headers = {}, body = '' } = {}) {
    const server = createServer(handler).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body });
    const json = await response.json();
    server.close();
    return { response, json };
}

const jsonHeaders = { 'content-type': 'application/json' };

test('accepta solo operationId y llama al adapter una vez', async () => {
    const calls = [];
    const result = await request(createOperatorServiceHandler({ adapter: { execute: async (id) => { calls.push(id); return { ok: true, operationId: id, status: 'PURGED' }; } }, logger: {} }), { headers: jsonHeaders, body: JSON.stringify({ operationId: 'PURGE-EVENT_1' }) });
    assert.equal(result.response.status, 200); assert.deepEqual(calls, ['PURGE-EVENT_1']);
    assert.deepEqual(result.json, { ok: true, operationId: 'PURGE-EVENT_1', status: 'PURGED' });
});

for (const [name, body] of [
    ['extra key', { operationId: 'PURGE-EVENT_1', eventId: 'x' }],
    ['eventId only', { eventId: 'x' }], ['force', { operationId: 'PURGE-EVENT_1', force: true }],
    ['trusted context', { operationId: 'PURGE-EVENT_1', trustedExecutionContext: { executionMode: 'OPERATOR_IAM' } }],
    ['security flags', { operationId: 'PURGE-EVENT_1', killSwitch: true, skipChecks: true }]
]) test(`rechaza ${name}`, async () => {
    const result = await request(createOperatorServiceHandler({ adapter: { execute: async () => { throw new Error('must not call'); } }, logger: {} }), { headers: jsonHeaders, body: JSON.stringify(body) });
    assert.equal(result.response.status, 400); assert.equal(result.json.code, 'INVALID_BODY_SCHEMA');
});

test('rechaza query, método, content-type, JSON inválido, body grande e operationId inválido', async () => {
    const handler = createOperatorServiceHandler({ adapter: { execute: async () => ({ ok: true, operationId: 'PURGE-EVENT_1', status: 'PURGED' }) }, logger: {} });
    assert.equal((await request(handler, { path: '/v1/execute?force=1', headers: jsonHeaders, body: '{}' })).response.status, 400);
    assert.equal((await request(handler, { method: 'DELETE', headers: jsonHeaders })).response.status, 405);
    assert.equal((await request(handler, { headers: { 'content-type': 'text/plain' }, body: '{}' })).response.status, 415);
    assert.equal((await request(handler, { headers: jsonHeaders, body: '{' })).response.status, 400);
    assert.equal((await request(handler, { headers: jsonHeaders, body: JSON.stringify({ operationId: 'PURGE-../bad' }) })).response.status, 400);
    assert.equal((await request(handler, { headers: jsonHeaders, body: 'x'.repeat(MAX_BODY_BYTES + 1) })).response.status, 413);
});

test('sanitiza errores internos y no devuelve stack', async () => {
    const result = await request(createOperatorServiceHandler({ adapter: { execute: async () => { const error = new Error('secret'); error.code = 'GENERATION_MISMATCH'; throw error; } }, logger: {} }), { headers: jsonHeaders, body: JSON.stringify({ operationId: 'PURGE-EVENT_1' }) });
    assert.equal(result.response.status, 409); assert.deepEqual(result.json, { ok: false, code: 'GENERATION_MISMATCH' });
});

function createIoProbe() {
    const counts = { firestoreReads: 0, firestoreWrites: 0, storageList: 0, storageGet: 0, storageDelete: 0 };
    const db = {
        collection() { counts.firestoreReads += 1; throw new Error('Firestore read must not occur'); },
        doc() { counts.firestoreReads += 1; throw new Error('Firestore read must not occur'); }
    };
    const storageAdapter = {
        __eventoraStorageProductionAdapter: true,
        async listObjects() { counts.storageList += 1; throw new Error('Storage list must not occur'); },
        async getObjectMetadata() { counts.storageGet += 1; throw new Error('Storage get must not occur'); },
        async deleteObjectIfGenerationMatch() { counts.storageDelete += 1; throw new Error('Storage delete must not occur'); }
    };
    return { counts, db, storageAdapter };
}

const productionEnvironment = { GOOGLE_CLOUD_PROJECT: 'eventorastudio-d6d95' };

test('adapter bloquea antes de cualquier I/O con kill switch cerrado', async () => {
    const probe = createIoProbe();
    let executorCalls = 0;
    const adapter = createRefundPurgeOperatorAdapter({
        db: probe.db, storageAdapter: probe.storageAdapter,
        executor: async () => { executorCalls += 1; }, environment: productionEnvironment
    });
    await assert.rejects(
        adapter.execute('PURGE-SMOKE-C2A3B1C-F3B'),
        (error) => error.code === 'PRODUCTION_PURGE_DISABLED'
    );
    assert.deepEqual(probe.counts, { firestoreReads: 0, firestoreWrites: 0, storageList: 0, storageGet: 0, storageDelete: 0 });
    assert.equal(executorCalls, 0);
});

test('HTTP devuelve 503 sin consultar el registro cuando el kill switch está cerrado', async () => {
    const probe = createIoProbe();
    const adapter = createRefundPurgeOperatorAdapter({ db: probe.db, storageAdapter: probe.storageAdapter, environment: productionEnvironment });
    const result = await request(createOperatorServiceHandler({ adapter, logger: {} }), {
        headers: jsonHeaders,
        body: JSON.stringify({ operationId: 'PURGE-SMOKE-C2A3B1C-F3B' })
    });
    assert.equal(result.response.status, 503);
    assert.deepEqual(result.json, { ok: false, code: 'PRODUCTION_PURGE_DISABLED' });
    assert.deepEqual(probe.counts, { firestoreReads: 0, firestoreWrites: 0, storageList: 0, storageGet: 0, storageDelete: 0 });
});

test('executor bloquea la recuperación ROOT_DELETED antes de cualquier I/O', async () => {
    const probe = createIoProbe();
    await assert.rejects(
        executeRefundProjectPurge({
            db: probe.db, bucket: probe.storageAdapter, eventId: 'SMOKE-ROOT-DELETED',
            trustedExecutionContext: { executionMode: 'OPERATOR_IAM', adapter: 'refund-purge-service', authenticatedBy: 'cloud-run-iam' },
            testHooks: { allowDestructiveStage: () => false }
        }),
        (error) => error.code === 'PRODUCTION_PURGE_DISABLED'
    );
    assert.deepEqual(probe.counts, { firestoreReads: 0, firestoreWrites: 0, storageList: 0, storageGet: 0, storageDelete: 0 });
});
