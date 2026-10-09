import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('admin integra los módulos privados y mantiene robots privados', () => {
  const html = read('admin/index.html'); const script = read('admin/script.js');
  const source = `${html}\n${script}`;
  assert.match(html, /noindex,nofollow/);
  for (const route of ['/admin/prospeccion/', '/proyectos/', '/mensajes/']) assert.match(source, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(script, /signInWithEmailAndPassword/);
  assert.match(script, /aE9nvEOlExYjYxPfAEnoEt3XIdv2/);
  assert.match(script, /location\.hash/);
});

test('prospección usa funciones protegidas y no Firestore directo', () => {
  const script = read('admin/prospeccion/script.js'); const functions = read('functions/src/prospects.js');
  for (const name of ['getProspects', 'seedProspects', 'createProspect', 'updateProspect', 'deleteProspect']) assert.match(functions, new RegExp(`export const ${name}`));
  for (const status of ['new', 'review', 'ready_to_contact', 'contacted', 'follow_up', 'responded', 'interested', 'proposal', 'negotiation', 'client', 'not_interested', 'no_response', 'discarded']) assert.match(functions, new RegExp(status));
  for (const field of ['contactStatus', 'channel', 'priceReference', 'proposal', 'angle', 'firstContactAt', 'nextFollowUpAt', 'priority', 'score']) assert.match(functions, new RegExp(field));
  assert.match(script, /getIdToken/); assert.match(script, /Authorization/);
  assert.doesNotMatch(script, /firebase-firestore|initializeFirestore|getFirestore|innerHTML/);
  assert.match(read('functions/index.js'), /getProspects/);
});
