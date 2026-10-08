import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const publicPages = [
  ['principal/index.html', '/principal/'],
  ['disenos/index.html', '/disenos/'],
  ['solicitar/index.html', '/solicitar/'],
  ['legal/privacidad/index.html', '/legal/privacidad/'],
  ['legal/terminos/index.html', '/legal/terminos/'],
  ['legal/politicas/index.html', '/legal/politicas/'],
  ['disenos/template-01/index.html', '/disenos/template-01/'],
  ['disenos/template-02/index.html', '/disenos/template-02/'],
  ['disenos/template-03/index.html', '/disenos/template-03/']
];

test('las páginas públicas tienen metadata SEO y URLs canónicas HTTPS', () => {
  for (const [file, route] of publicPages) {
    const html = read(file);
    assert.match(html, /<title>[^<]+<\/title>/, file);
    assert.match(html, /<meta name="description" content="[^"]+">/, file);
    assert.match(html, new RegExp(`rel="canonical" href="https://eventorastudio\\.com${route.replaceAll('/', '\\/')}"`), file);
    assert.match(html, /property="og:title"/, file);
    assert.match(html, /property="og:description"/, file);
    assert.match(html, /property="og:url" content="https:\/\/eventorastudio\.com\//, file);
    assert.match(html, /name="twitter:card" content="summary_large_image"/, file);
    assert.match(html, /name="twitter:title"/, file);
    assert.match(html, /name="twitter:description"/, file);
    assert.match(html, /name="twitter:image"/, file);
  }
});

test('la indexación evita duplicados y mantiene privados los mensajes', () => {
  const rootHtml = read('index.html');
  const messagesHtml = read('mensajes/index.html');
  const sitemap = read('sitemap.xml');
  assert.match(rootHtml, /name="robots" content="noindex,follow"/);
  assert.match(messagesHtml, /name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(sitemap, /mensajes|paquetes|Invitaciones/i);
  for (const route of ['/principal/', '/disenos/', '/disenos/template-01/', '/disenos/template-02/', '/disenos/template-03/', '/solicitar/', '/legal/privacidad/', '/legal/terminos/', '/legal/politicas/']) assert.match(sitemap, new RegExp(route.replaceAll('/', '\\/')));
});

test('schema y assets SEO no presentan negocios ficticios como entidades reales', () => {
  const principal = read('principal/index.html');
  assert.match(principal, /application\/ld\+json/);
  assert.match(principal, /"@type":"Organization"/);
  assert.match(principal, /"@type":"Service"/);
  assert.doesNotMatch(principal, /messages@gmail\.com/);
  for (const file of ['disenos/template-01/index.html', 'disenos/template-02/index.html', 'disenos/template-03/index.html']) {
    const html = read(file);
    assert.doesNotMatch(html, /LocalBusiness|Restaurant|AutomotiveBusiness|FlowerShop/);
    assert.match(html, /Referencia web|Referencia de estilo/);
  }
});

test('robots y manifest mantienen señales públicas coherentes', () => {
  const robots = read('robots.txt');
  const manifest = JSON.parse(read('assets/brand/favicon/site.webmanifest'));
  assert.match(robots, /Disallow: \/mensajes\//);
  assert.match(robots, /Sitemap: https:\/\/eventorastudio\.com\/sitemap\.xml/);
  assert.equal(manifest.name, 'Eventora Studio');
  assert.equal(manifest.short_name, 'Eventora');
});
