import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiFetch, fetchWithTimeout } from '../shared/api.js';
import { requireAppCheck, verifyAppCheckToken } from '../functions/src/app-check.js';
import { evaluateRateLimit, requestIdentifier } from '../functions/src/rate-limit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('fetchWithTimeout cancela respuestas lentas y limpia el timer', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); }, { once: true });
  });
  await assert.rejects(() => fetchWithTimeout('https://example.test', {}, 10), { name: 'AbortError' });
  globalThis.fetch = previousFetch;
});

test('apiFetch añade Auth y App Check y procesa errores HTTP', async () => {
  const previousFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  await apiFetch('https://example.test', { user: { getIdToken: async () => 'id-token' }, appCheck: {}, getAppCheckToken: async () => ({ token: 'app-token' }) });
  assert.equal(request.options.headers.Authorization, 'Bearer id-token');
  assert.equal(request.options.headers['X-Firebase-AppCheck'], 'app-token');
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: 'denied' }), { status: 403 });
  await assert.rejects(() => apiFetch('https://example.test'), (error) => error.status === 403 && error.message === 'denied');
  globalThis.fetch = previousFetch;
});

test('App Check acepta token válido y rechaza ausente o inválido', async () => {
  const valid = await verifyAppCheckToken('valid-token', { verifyToken: async (token) => ({ token }) });
  assert.equal(valid.token, 'valid-token');

  const responses = [];
  const makeResponse = () => ({ status: (code) => { responses.push(code); return { json: () => undefined }; } });
  const missing = await requireAppCheck({ get: () => '' }, makeResponse());
  assert.equal(missing, false);
  assert.equal(responses.at(-1), 401);

  const invalid = await requireAppCheck({ get: () => 'invalid-token' }, makeResponse());
  assert.equal(invalid, false);
  assert.equal(responses.at(-1), 401);
});

test('rate limit permite cinco intentos, bloquea el sexto y reinicia la ventana', () => {
  const startedAt = 1_000_000;
  let state;
  for (let index = 0; index < 5; index += 1) {
    const decision = evaluateRateLimit(state, startedAt);
    assert.equal(decision.allowed, true);
    state = decision;
  }
  assert.equal(evaluateRateLimit(state, startedAt).allowed, false);
  assert.equal(evaluateRateLimit(state, startedAt + 15 * 60 * 1000).allowed, true);
  assert.notEqual(requestIdentifier({ get: (header) => header === 'x-forwarded-for' ? '10.0.0.1' : '', ip: '10.0.0.1' }), requestIdentifier({ get: (header) => header === 'x-forwarded-for' ? '10.0.0.2' : '', ip: '10.0.0.2' }));
});

test('hardening mantiene App Check, rate limit y timeout documentados en código', () => {
  const submit = read('functions/src/submit-website-request.js');
  const adminAuth = read('functions/src/admin-auth.js');
  const projectAuth = read('functions/src/project-auth.js');
  const rateLimit = read('functions/src/rate-limit.js');
  assert.match(submit, /requireAppCheck/);
  assert.match(submit, /enforceWebsiteRequestRateLimit/);
  assert.match(adminAuth, /requireAppCheck/);
  assert.match(projectAuth, /requireAppCheck/);
  assert.match(rateLimit, /maxRequests = 5/);
  assert.match(rateLimit, /15 \* 60 \* 1000/);
});
