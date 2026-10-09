import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProjectHostingMonitorEligible } from '../functions/src/hosting.js';

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

test('el modelo real de Yogurt es elegible aunque siga en estado active', () => {
  const yogurt = {
    businessName: 'Yogurt Arte Sanar', projectStatus: 'active', developmentStage: 'published', hostingEnabled: true,
    hostingStatus: 'active', hostingPlan: 'hosting-maintenance-annual', maintenanceEnabled: true,
    maintenanceStatus: 'active', productionUrl: 'https://eventorastudio.com/yogurt-arte-sanar/'
  };
  assert.equal(isProjectHostingMonitorEligible(yogurt), true);
  assert.equal(isProjectHostingMonitorEligible({ ...yogurt, projectStatus: 'completed' }), true);
  assert.equal(isProjectHostingMonitorEligible({ ...yogurt, hostingEnabled: false }), false);
  assert.equal(isProjectHostingMonitorEligible({ ...yogurt, productionUrl: '' }), false);
  assert.equal(isProjectHostingMonitorEligible({ ...yogurt, productionUrl: 'https://eventorastudio-d6d95--yogurt-arte-sanar-review.web.app/' }), true);
  assert.equal(isProjectHostingMonitorEligible({ ...yogurt, projectStatus: 'cancelled' }), false);
});

test('el scheduler y la retención están definidos', () => {
  assert.match(source, /schedule: 'every 5 minutes'/);
  assert.match(source, /CHECK_RETENTION_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(read('docs/hosting-monitoring.md'), /30 días/);
});
