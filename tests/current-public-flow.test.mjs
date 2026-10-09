import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const PUBLIC_ROUTES = [
  'principal/index.html',
  'disenos/index.html',
  'disenos/template-01/index.html',
  'disenos/template-02/index.html',
  'disenos/template-03/index.html',
  'solicitar/index.html',
  'mensajes/index.html',
  'legal/privacidad/index.html',
  'legal/terminos/index.html',
  'legal/politicas/index.html'
];

test('las rutas públicas actuales existen y mantienen una estructura HTML básica', async () => {
  for (const path of PUBLIC_ROUTES) {
    const html = await read(path);
    assert.match(html, /<!doctype html>/i, path);
    assert.match(html, /<html\b/i, path);
    assert.match(html, /<\/html>/i, path);
  }
});

test('el redirect legacy de paquetes no carga recursos retirados', async () => {
  const html = await read('paquetes/index.html');
  assert.match(html, /noindex,follow/);
  assert.match(html, /url=\/principal\/#paquetes/);
  assert.match(html, /window\.location\.replace\('\/principal\/#paquetes'\)/);
  assert.doesNotMatch(html, /paquetes\.(?:css|js)|demos\//);
});

test('solicitar y mensajes conservan el flujo de website requests', async () => {
  const [requestScript, messagesScript, functionsIndex] = await Promise.all([
    read('solicitar/script.js'),
    read('mensajes/script.js'),
    read('functions/index.js')
  ]);

  assert.match(requestScript, /submitWebsiteRequest/);
  for (const functionName of ['getWebsiteRequests', 'updateWebsiteRequestStatus', 'deleteWebsiteRequest']) {
    assert.match(messagesScript, new RegExp(functionName));
    assert.match(functionsIndex, new RegExp(functionName));
  }
  assert.match(functionsIndex, /submitWebsiteRequest/);
});

test('los recursos compartidos críticos actuales permanecen disponibles', async () => {
  for (const path of [
    'shared/public-footer.css',
    'styles/seasonal-theme.css',
    'assets/brand/logo-trimmed.png',
    'assets/brand/favicon/favicon.ico'
  ]) {
    await access(new URL(`../${path}`, import.meta.url));
  }
});

test('Yogurt Arte Sanar no publica ubicación provisional', async () => {
  const html = await read('yogurt-arte-sanar/index.html');
  assert.doesNotMatch(html, /Nueva Galicia|Saltillo|Coahuila|google\.com\/maps|#ubicacion|map-frame|streetAddress|addressLocality|addressRegion|\"geo\"/i);
  assert.doesNotMatch(html, /<a[^>]+>Ubicación<\/a>/i);
  assert.match(html, /wa\.me\/528447801458/);
  assert.match(html, /Instagram/);
  assert.match(html, /Facebook/);
  assert.match(html, /Lunes a viernes/);
});
