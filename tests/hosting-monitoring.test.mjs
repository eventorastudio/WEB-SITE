import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('functions/src/hosting.js');

test('el backend protege URL, timeout, redirects y almacenamiento mínimo', () => {
  assert.match(source, /CHECK_TIMEOUT_MS = 10_000/);
  assert.match(source, /redirect: 'manual'/);
  assert.match(source, /MAX_REDIRECTS = 5/);
  assert.match(source, /PRIVATE_IP/);
  assert.match(source, /errorMessageSanitized/);
  assert.doesNotMatch(source, /response\.text\(\)/);
});

test('la política de estado requiere dos fallos consecutivos para caída', () => {
  assert.match(source, /consecutiveFailures >= 2/);
  assert.match(source, /confirmedDown/);
  assert.match(source, /durationMs/);
});

test('el scheduler y la retención están definidos', () => {
  assert.match(source, /schedule: 'every 5 minutes'/);
  assert.match(source, /CHECK_RETENTION_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(read('docs/hosting-monitoring.md'), /30 días/);
});
