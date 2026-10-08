import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('mensajes usa exclusivamente las combinaciones administrativas autorizadas', () => {
  const frontend = read('mensajes/script.js');
  const backend = read('functions/src/admin-auth.js');
  const users = [
    ['messages@gmail.com', 'fzERhhRbsAfHcm55drt5lmAxn6J3'],
    ['ev3ntorastudio@gmail.com', 'aE9nvEOlExYjYxPfAEnoEt3XIdv2']
  ];
  for (const source of [frontend, backend]) {
    for (const [email, uid] of users) {
      assert.match(source, new RegExp(email.replace('.', '\\.'), 'i'));
      assert.match(source, new RegExp(uid));
    }
  }
  assert.match(frontend, /authorizedUsers\.some/);
  assert.match(backend, /AUTHORIZED_USERS\.some/);
  assert.match(backend, /decodedToken\??\.email/);
  assert.match(backend, /decodedToken\??\.uid/);
  assert.match(backend, /status\(401\)/);
  assert.match(backend, /status\(403\)/);
  assert.match(backend, /requireAuthorizedAdmin/);
});
