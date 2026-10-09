import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('website request form preserves the public payload and allowed values', () => {
  const html = read('solicitar/index.html');
  const script = read('solicitar/script.js');
  for (const field of ['contactName', 'whatsapp', 'email', 'businessName', 'businessType', 'city', 'plan', 'template', 'needs', 'notes', 'website']) {
    assert.match(script, new RegExp(field), field);
  }
  for (const need of ['services-products', 'gallery', 'hours-location', 'contact-social', 'about', 'other']) {
    assert.match(html, new RegExp(`value="${need}"`), need);
    assert.match(script, new RegExp(`"${need}"`), need);
  }
  assert.match(script, /validTemplates/);
  assert.match(script, /validPlans/);
  assert.match(script, /validNeeds/);
  assert.match(script, /submitWebsiteRequest/);
  assert.doesNotMatch(script, /wa\.me|window\.open|mailto:/);
});

test('website request form communicates non-checkout states', () => {
  const html = read('solicitar/index.html');
  const script = read('solicitar/script.js');
  assert.match(html, /La solicitud no genera ning[uú]n cobro/);
  assert.match(html, /30% para comenzar y 70%/);
  assert.match(script, /Enviando/);
  assert.match(script, /Solicitud recibida/);
  assert.match(script, /No se realiz[oó] ning[uú]n cobro/);
  assert.match(script, /No pudimos enviar tu solicitud/);
});

test('website request form keeps template and plan query param whitelists', () => {
  const script = read('solicitar/script.js');
  assert.match(script, /templateParam/);
  assert.match(script, /planParam/);
  assert.match(script, /validTemplates\.includes\(templateParam\)/);
  assert.match(script, /validPlans\.includes\(planParam\)/);
});

test('website request form captures the required hosting preference', () => {
  const script = read('solicitar/script.js');
  const backend = read('functions/src/submit-website-request.js');
  const adminBackend = read('functions/src/admin-website-requests.js');
  const messages = read('mensajes/script.js');
  for (const value of ['files-only', 'hosting', 'hosting-maintenance', 'undecided']) {
    assert.match(script, new RegExp(value));
    assert.match(backend, new RegExp(value));
  }
  assert.match(script, /hostingPreference/);
  assert.match(backend, /allowedHostingPreferences/);
  assert.match(backend, /hostingPreference: data\.hostingPreference/);
  assert.match(adminBackend, /hostingPreference: data\.hostingPreference/);
  assert.match(backend, /Selecciona una opci[oó]n de alojamiento v[aá]lida/);
  assert.match(messages, /Preferencia de alojamiento/);
  assert.match(messages, /No especificado/);
});

test('website request flow preserves all hosting preference labels through the admin response', () => {
  const script = read('solicitar/script.js');
  const adminBackend = read('functions/src/admin-website-requests.js');
  const messages = read('mensajes/script.js');
  for (const [value, label] of [
    ['files-only', 'Solo entrega de archivos'],
    ['hosting', 'Hosting'],
    ['hosting-maintenance', 'Hosting + mantenimiento'],
    ['undecided', 'Aún no lo sé']
  ]) {
    assert.match(script, new RegExp(value));
    assert.match(adminBackend, /hostingPreference: data\.hostingPreference/);
    assert.match(messages, new RegExp(label.replace(/[+]/g, '\\+')));
  }
});

test('website request submit restores state on success, error and timeout', () => {
  const script = read('solicitar/script.js');
  assert.match(script, /let isSubmitting = false/);
  assert.match(script, /if \(isSubmitting\) return/);
  assert.match(script, /const setSubmitting = \(submitting\)/);
  assert.match(script, /form\.reset\(\)/);
  assert.match(script, /notesCount\.textContent = "0"/);
  assert.match(script, /finally \{\s*setSubmitting\(false\)/s);
  assert.match(script, /error\?\.status === 429/);
  assert.match(script, /error\?\.name === "AbortError"/);
  assert.doesNotMatch(script, /form\.querySelectorAll\("input, textarea"\)\.forEach\(\(field\) => \{ field\.disabled = true/);
});
