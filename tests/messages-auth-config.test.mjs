import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('admin centraliza el acceso y mensajes conserva la protección de backend', () => {
  const frontend = read('mensajes/script.js');
  const admin = read('admin/script.js');
  const backend = read('functions/src/admin-auth.js');
  assert.match(admin, /ev3ntorastudio@gmail\.com/);
  assert.match(admin, /aE9nvEOlExYjYxPfAEnoEt3XIdv2/);
  assert.match(frontend, /redirectToAdmin/);
  assert.doesNotMatch(frontend, /signInWithEmailAndPassword/);
  assert.match(backend, /AUTHORIZED_USERS\.some/);
  assert.match(backend, /decodedToken\??\.email/);
  assert.match(backend, /decodedToken\??\.uid/);
  assert.match(backend, /status\(401\)/);
  assert.match(backend, /status\(403\)/);
  assert.match(backend, /requireAuthorizedAdmin/);
});
