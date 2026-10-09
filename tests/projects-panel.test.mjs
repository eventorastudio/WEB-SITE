import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('proyectos está privado y no se anuncia públicamente', () => {
  const html = read('proyectos/index.html');
  const robots = read('robots.txt');
  assert.match(html, /noindex,nofollow/);
  assert.match(robots, /Disallow: \/proyectos\//);
  assert.doesNotMatch(read('sitemap.xml'), /proyectos/);
});

test('proyectos usa App Check, Auth y no Firestore directo', () => {
  const frontend = read('proyectos/firebase.js');
  const script = read('proyectos/script.js');
  assert.match(frontend, /initializeAppCheck/);
  assert.match(frontend, /ReCaptchaV3Provider/);
  assert.match(frontend, /isTokenAutoRefreshEnabled: true/);
  assert.match(script, /redirectToAdmin/);
  assert.doesNotMatch(script, /signInWithEmailAndPassword/);
  assert.match(script, /apiFetch/);
  assert.match(script, /getAppCheckToken/);
  assert.doesNotMatch(script, /firebase-firestore|initializeFirestore|getFirestore/);
  assert.doesNotMatch(script, /innerHTML/);
});

test('Functions de proyectos exigen el UID y correo exclusivos del propietario', () => {
  const auth = read('functions/src/project-auth.js');
  const functions = read('functions/src/projects.js');
  assert.match(auth, /ev3ntorastudio@gmail\.com/);
  assert.match(auth, /aE9nvEOlExYjYxPfAEnoEt3XIdv2/);
  assert.match(auth, /status\(401\)/);
  assert.match(auth, /status\(403\)/);
  for (const name of ['getProjects', 'getProject', 'createProject', 'updateProject', 'deleteProject', 'getProjectUpdates', 'addProjectUpdate', 'registerMaintenanceActivity']) assert.match(functions, new RegExp(`export const ${name}`));
  assert.match(functions, /collectionName = 'projects'/);
  assert.match(functions, /collection\('updates'\)/);
  assert.match(functions, /MAINTENANCE_LIMIT_REACHED/);
  assert.match(functions, /runTransaction/);
  assert.match(read('functions/index.js'), /getProjects/);
});

test('mantenimiento documenta revisiones, límites y exclusiones', () => {
  const terms = read('legal/terminos/index.html');
  const policies = read('legal/politicas/index.html');
  const docs = read('docs/hosting-maintenance-policy.md');
  for (const content of [terms, policies, docs]) {
    assert.match(content, /revisi[oó]n preventiva/i);
    assert.match(content, /revisi[oó]n (general|trimestral)/i);
    assert.match(content, /2 solicitudes/i);
    assert.match(content, /no son acumulables/i);
  }
});

test('reporter valida ADC, proyecto, fase, dry-run y coincidencia de negocio', () => {
  const reporter = read('scripts/report-project-status.mjs');
  assert.match(reporter, /eventorastudio-d6d95/);
  assert.match(reporter, /applicationDefault/);
  assert.match(reporter, /dryRun/);
  assert.match(reporter, /STAGES/);
  assert.match(reporter, /businessName local no coincide/);
  assert.match(reporter, /git.*rev-parse/s);
  assert.doesNotMatch(reporter, /service-account|private_key|password/i);
});
