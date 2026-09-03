import { createServer } from 'node:http';
import { createRefundPurgeOperatorAdapter, validateOperationId } from './refund-purge-adapter.js';
import { Firestore } from '@google-cloud/firestore';
import { EXPECTED_PROJECT_ID, createStorageAdapter } from './storage-adapters.js';

export const MAX_BODY_BYTES = 4096;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;

function httpError(code, status = 400) {
    const error = new Error(code);
    error.code = code;
    error.httpStatus = status;
    return error;
}

export function mapOperatorError(error) {
    const code = String(error?.code ?? 'INTERNAL');
    const status = new Map([
        ['INVALID_OPERATION_ID', 400], ['OPERATION_BINDING_MISMATCH', 409],
        ['PURGE_RECORD_NOT_FOUND', 404], ['PURGE_NOT_READY', 409],
        ['AUTHORIZATION_MISMATCH', 409], ['AUTHORIZATION_BINDING_MISMATCH', 409],
        ['AUTHORIZATION_ALREADY_USED', 409], ['AUTHORIZATION_EXPIRED', 409],
        ['AUTHORIZATION_INVALID', 409], ['GENERATION_MISMATCH', 409],
        ['GLOBAL_PURGE_ALREADY_RUNNING', 409], ['PURGE_ALREADY_RUNNING', 409],
        ['DEMO_PURGE_BLOCKED', 409], ['SHARED_DEMO_DELETE_BLOCKED', 409],
        ['UNKNOWN_STORAGE_ASSET', 409], ['BLOCKED_ORPHAN_ASSET', 409],
        ['PRODUCTION_PURGE_DISABLED', 503], ['DESTRUCTIVE_PURGE_NOT_ALLOWED', 503],
        ['BACKEND_PROJECT_MISMATCH', 503], ['BACKEND_BUCKET_MISMATCH', 503],
        ['STORAGE_GENERATION_MISSING', 409], ['STORAGE_ENVIRONMENT_UNKNOWN', 503],
        ['EMULATOR_STORAGE_ADAPTER_REQUIRED', 503], ['STORAGE_AUTHORIZATION_ERROR', 502],
        ['STORAGE_UPSTREAM_RETRYABLE', 502], ['STORAGE_UPSTREAM_TIMEOUT', 504],
        ['STORAGE_API_INVALID_RESPONSE', 502], ['NOT_FOUND', 404]
    ]);
    return { status: error?.httpStatus ?? status.get(code) ?? 500, body: { ok: false, code } };
}

function writeJson(response, status, body) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
    if (!JSON_CONTENT_TYPE.test(String(request.headers['content-type'] ?? ''))) throw httpError('UNSUPPORTED_MEDIA_TYPE', 415);
    if (Number(request.headers['content-length'] ?? 0) > MAX_BODY_BYTES) throw httpError('BODY_TOO_LARGE', 413);
    const chunks = [];
    let total = 0;
    for await (const chunk of request) {
        total += Buffer.byteLength(chunk);
        if (total > MAX_BODY_BYTES) throw httpError('BODY_TOO_LARGE', 413);
        chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError('MALFORMED_JSON', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError('INVALID_BODY', 400);
    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== 'operationId') throw httpError('INVALID_BODY_SCHEMA', 400);
    try { validateOperationId(body.operationId); } catch { throw httpError('INVALID_OPERATION_ID', 400); }
    return body;
}

export function createOperatorServiceHandler({ adapter, logger = console } = {}) {
    if (!adapter) throw new Error('ADAPTER_REQUIRED');
    return async (request, response) => {
        const startedAt = Date.now();
        const path = new URL(request.url ?? '/', 'http://operator.local');
        if (path.pathname === '/healthz' && request.method === 'GET') return writeJson(response, 200, { ok: true });
        if (path.pathname !== '/v1/execute') return writeJson(response, 404, { ok: false, code: 'NOT_FOUND' });
        if (path.search) return writeJson(response, 400, { ok: false, code: 'QUERY_PARAMETERS_NOT_ALLOWED' });
        if (request.method !== 'POST') return writeJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
        try {
            const { operationId } = await readJsonBody(request);
            const result = await adapter.execute(operationId);
            logger.info?.(JSON.stringify({ operationId, result: result.status, durationMs: Date.now() - startedAt }));
            return writeJson(response, 200, result);
        } catch (error) {
            const mapped = mapOperatorError(error);
            logger.warn?.(JSON.stringify({ code: mapped.body.code, durationMs: Date.now() - startedAt }));
            return writeJson(response, mapped.status, mapped.body);
        }
    };
}

export function createOperatorServer({ adapter, logger = console } = {}) {
    return createServer(createOperatorServiceHandler({ adapter, logger }));
}

export function createDefaultAdapter() {
    const db = new Firestore({ projectId: EXPECTED_PROJECT_ID });
    const storageAdapter = createStorageAdapter({ environment: process.env });
    return createRefundPurgeOperatorAdapter({ db, storageAdapter, environment: process.env });
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
    const port = Number(process.env.PORT ?? 8085);
    const server = createOperatorServer({ adapter: createDefaultAdapter() });
    server.listen(port, '0.0.0.0', () => console.log(`operator service listening on ${port}`));
}
