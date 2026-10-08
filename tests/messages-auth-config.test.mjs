import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('mensajes usa exclusivamente la cuenta administrativa autorizada', () => {
  const frontend = read('mensajes/script.js');
  const backend = read('functions/src/admin-auth.js');
  for (const source of [frontend, backend]) {
    assert.match(source, /fzERhhRbsAfHcm55drt5lmAxn6J3/);
  }
  assert.match(frontend, /messages@gmail\.com/);
  assert.match(frontend, /user\.uid\s*!==\s*authorizedAdminUid/);
  assert.match(backend, /decodedToken\.uid\s*!==\s*AUTHORIZED_ADMIN_UID/);
  assert.match(backend, /requireAuthorizedAdmin/);
});
