import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createOperatorServiceHandler } from '../functions/operator/refund-purge-service.js';
import { assertBackendBindings } from '../functions/operator/refund-purge-adapter.js';
import { configuredProjectId, createStorageAdapter, EXPECTED_BUCKET_NAME, EXPECTED_PROJECT_ID } from '../functions/operator/storage-adapters.js';

const canonicalAdapter = { name: EXPECTED_BUCKET_NAME };

test('project guard exige GOOGLE_CLOUD_PROJECT en producción y rechaza wrong/missing', () => {
    assert.throws(() => assertBackendBindings({ bucket: canonicalAdapter, environment: { NODE_ENV: 'production' } }), { code: 'BACKEND_PROJECT_MISMATCH' });
    assert.throws(() => assertBackendBindings({ bucket: canonicalAdapter, environment: { NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: 'wrong-project' } }), { code: 'BACKEND_PROJECT_MISMATCH' });
    assert.equal(configuredProjectId({ GOOGLE_CLOUD_PROJECT: EXPECTED_PROJECT_ID }), EXPECTED_PROJECT_ID);
    assert.doesNotThrow(() => assertBackendBindings({ bucket: canonicalAdapter, environment: { NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: EXPECTED_PROJECT_ID } }));
});

test('project guard rechaza conflicto y solo permite GCLOUD_PROJECT en emulator explícito', () => {
    assert.throws(() => configuredProjectId({ GOOGLE_CLOUD_PROJECT: EXPECTED_PROJECT_ID, GCLOUD_PROJECT: 'wrong-project' }), { code: 'BACKEND_PROJECT_MISMATCH' });
    assert.equal(configuredProjectId({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', GCLOUD_PROJECT: 'demo-eventorastudio-phase2e2a' }), 'demo-eventorastudio-phase2e2a');
    assert.equal(configuredProjectId({ GCLOUD_PROJECT: EXPECTED_PROJECT_ID }), '');
});

test('healthz solo valida disponibilidad del handler y no llama executor ni Google APIs', async () => {
    let executions = 0;
    const handler = createOperatorServiceHandler({ adapter: { execute: async () => { executions += 1; } }, logger: {} });
    const request = new PassThrough();
    request.method = 'GET';
    request.url = '/healthz';
    request.headers = {};
    const chunks = [];
    const response = { writeHead(status) { this.statusCode = status; }, end(body) { chunks.push(body); } };
    await handler(request, response);
    assert.equal(response.statusCode, 200);
    assert.equal(executions, 0);
});

test('production storage adapter solo se crea con proyecto canónico explícito', () => {
    const adapter = createStorageAdapter({ environment: { NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: EXPECTED_PROJECT_ID } });
    assert.equal(adapter.name, EXPECTED_BUCKET_NAME);
    assert.equal(adapter.__eventoraStorageProductionAdapter, true);
});
