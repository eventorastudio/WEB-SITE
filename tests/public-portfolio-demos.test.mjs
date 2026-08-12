import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { PACKAGE_MATRIX, PRESTIGE_DEMO_FEATURES, PRESTIGE_SERVICE_BENEFITS } from '../principal/demos/prestige-contract.js';

const DEMOS = ['xv-renatta', 'luxury', 'botanical', 'midnight', 'romance', 'minimal'];
const NEW_COLLECTIONS = DEMOS.slice(1);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const extractFeatureTitles = (html, startId, endId) => {
  const start = html.indexOf(`id="${startId}"`);
  const end = endId ? html.indexOf(`id="${endId}"`, start) : html.length;
  assert.ok(start >= 0 && end > start, `No se encontró la sección comercial ${startId}`);
  return [...html.slice(start, end).matchAll(/<h4>([^<]+)<\/h4>/g)].map((match) => match[1].trim());
};

const collectPrestigeFeatures = (html) => {
  const features = new Set();
  for (const match of html.matchAll(/data-prestige-feature="([^"]+)"/g)) features.add(match[1]);
  for (const match of html.matchAll(/data-prestige-features="([^"]+)"/g)) {
    match[1].split(/\s+/).filter(Boolean).forEach((feature) => features.add(feature));
  }
  return features;
};

test('la matriz de paquetes replica exclusivamente la fuente comercial actual', async () => {
  const html = await read('paquetes/index.html');
  assert.deepEqual(extractFeatureTitles(html, 'esencial', 'premium'), PACKAGE_MATRIX.esencial);
  assert.deepEqual(extractFeatureTitles(html, 'premium', 'prestige'), PACKAGE_MATRIX.premium);
  assert.deepEqual(extractFeatureTitles(html, 'prestige'), PACKAGE_MATRIX.prestige);
  assert.deepEqual(PRESTIGE_SERVICE_BENEFITS, [
    'Atención personalizada',
    'Más cambios incluidos',
    'Atención prioritaria'
  ]);
});

test('PRESTIGE_DEMO_FEATURES está activo en las seis demos y las etiquetas son inequívocas', async () => {
  for (const demo of DEMOS) {
    const [html, script] = await Promise.all([
      read(`principal/demos/${demo}/index.html`),
      read(`principal/demos/${demo}/script.js`)
    ]);
    const activeFeatures = collectPrestigeFeatures(html);
    for (const feature of PRESTIGE_DEMO_FEATURES) {
      assert.ok(activeFeatures.has(feature), `${demo} no representa la función Prestige: ${feature}`);
    }
    assert.match(html, /Prestige · Demo/i);
    assert.match(html, /Demostración Prestige/i);
    assert.match(html, /funciones pueden variar según el paquete contratado/i);
    assert.match(html, /data-demo-video/);
    assert.match(html, /data-pass-selector/);
    assert.match(html, /data-demo-action="gifts"/);
    assert.match(script, /demoMode:\s*true/);
  }
});

test('las seis tarjetas del portafolio identifican sus experiencias Prestige', async () => {
  const html = await read('principal/index.html');
  assert.equal((html.match(/class="portfolio-prestige-badge">Demo Prestige/g) || []).length, DEMOS.length);
});

test('las seis colecciones conservan sitios independientes y comparten únicamente el runtime', async () => {
  await access(new URL('../principal/demos/demo-runtime.js', import.meta.url));
  await access(new URL('../principal/demos/demo-mode.css', import.meta.url));
  for (const demo of DEMOS) {
    for (const file of ['index.html', 'style.css', 'script.js']) {
      await access(new URL(`../principal/demos/${demo}/${file}`, import.meta.url));
    }
    const html = await read(`principal/demos/${demo}/index.html`);
    assert.match(html, /href="\.\.\/demo-mode\.css"/);
    assert.match(html, /src="\.\.\/demo-runtime\.js"/);
  }
});

test('apertura, música, countdown y personalización funcionan mediante un contrato común', async () => {
  const runtime = await read('principal/demos/demo-runtime.js');
  assert.match(runtime, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(runtime, /params\.get\('nombre'\)/);
  assert.match(runtime, /params\.get\('pases'\)/);
  assert.match(runtime, /parsed > 0 && parsed <= 20 \? parsed : 1/);
  assert.match(runtime, /audio\.src = config\.music/);
  assert.match(runtime, /await audio\.play\(\)/);
  assert.match(runtime, /audio\.pause\(\)/);
  assert.match(runtime, /invitation\.inert = true/);
  assert.match(runtime, /invitation\.inert = false/);
  assert.match(runtime, /invitation\.focus/);
  assert.match(runtime, /Math\.max\(targetTime - Date\.now\(\), 0\)/);
  assert.match(runtime, /IntersectionObserver/);
  assert.match(runtime, /textContent = value/);
  assert.doesNotMatch(runtime, /innerHTML\s*=/);
  assert.doesNotMatch(runtime, /console\./);

  for (const demo of DEMOS) {
    const [html, script] = await Promise.all([
      read(`principal/demos/${demo}/index.html`),
      read(`principal/demos/${demo}/script.js`)
    ]);
    assert.match(html, /id="open-invitation"/);
    assert.match(html, /id="music-control"/);
    assert.match(html, /data-countdown/);
    assert.match(html, /data-opening-guest/);
    assert.match(html, /data-guest-message/);
    assert.match(html, /data-pass-message/);
    assert.match(script, /demoMode:\s*true/);
    assert.match(script, /passes === 1/);
    assert.match(script, /EventoraDemo\.mount\(EVENT\)/);
  }
});

test('Demo Mode intercepta toda acción externa con un solo listener delegado', async () => {
  const runtime = await read('principal/demos/demo-runtime.js');
  assert.equal((runtime.match(/document\.addEventListener\('click'/g) || []).length, 1);
  assert.match(runtime, /event\.target\.closest\('\[data-demo-action\]'\)/);
  assert.match(runtime, /config\.demoMode !== true/);
  assert.match(runtime, /event\.preventDefault\(\)/);
  assert.match(runtime, /element\.setAttribute\('href', '#demo-notice'\)/);
  assert.match(runtime, /element\.removeAttribute\('target'\)/);
  assert.doesNotMatch(runtime, /window\.open|location\.href|window\.location\s*=/);

  for (const demo of DEMOS) {
    const [html, script] = await Promise.all([
      read(`principal/demos/${demo}/index.html`),
      read(`principal/demos/${demo}/script.js`)
    ]);
    assert.match(html, /data-demo-action="maps"/);
    assert.match(html, /data-demo-action="rsvp"/);
    assert.doesNotMatch(html, /href="https?:/);
    assert.doesNotMatch(html, /target="_blank"/);
    assert.doesNotMatch(html, /<form[^>]+action=/);
    assert.doesNotMatch(html, /disabled|pointer-events:\s*none/i);
    assert.match(script, /links:\s*\{/);
    assert.match(script, /https:\/\//);
    assert.match(script, /encodeURIComponent/);
    const actions = [...html.matchAll(/data-demo-action="([^"]+)"/g)].map((match) => match[1]);
    for (const action of new Set(actions)) {
      assert.match(script, new RegExp(`\\b${action}:`));
    }
    assert.doesNotMatch(script, /window\.open|location\.href|window\.location\s*=/);
  }
});

test('demoMode false restaura URLs configuradas sin otra implementación', async () => {
  const runtime = await read('principal/demos/demo-runtime.js');
  assert.match(runtime, /if \(config\.demoMode === true\)/);
  assert.match(runtime, /else if \(url\)/);
  assert.match(runtime, /element\.setAttribute\('href', url\)/);
  assert.match(runtime, /element\.setAttribute\('target', '_blank'\)/);
  assert.match(runtime, /typeof value === 'function' \? value\(context\) : value/);
});

test('Demo Notice es accesible, se cierra y devuelve el foco', async () => {
  const [runtime, css] = await Promise.all([
    read('principal/demos/demo-runtime.js'),
    read('principal/demos/demo-mode.css')
  ]);
  assert.match(runtime, /setAttribute\('role', 'dialog'\)/);
  assert.match(runtime, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(runtime, /event\.key === 'Escape'/);
  assert.match(runtime, /event\.target === notice\.overlay/);
  assert.match(runtime, /notice\.closeButton\.focus/);
  assert.match(runtime, /trigger\.focus/);
  assert.match(runtime, /Vista de demostración/);
  assert.match(runtime, /Entendido/);
  for (const action of ['maps', 'rsvp', 'gifts', 'hotel', 'instagram', 'calendar']) {
    assert.match(runtime, new RegExp(`${action}:`));
  }
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /place-items: end center/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('cada identidad tiene composición, storytelling y galería propios', async () => {
  const expected = {
    'xv-renatta': [/resort-card/, /pool-note/, /postcards/, /ALOHA<\/span> RENATTA/],
    luxury: [/hero-visual/, /chapter/, /dress-figures/, /concierge/],
    botanical: [/hero-art/, /stem-main/, /garden-frame/, /memory-strip/],
    midnight: [/hero-light/, /timeline/, /silhouettes/, /night-gallery/],
    romance: [/love-note/, /story/, /photo-story/, /Querida vida/],
    minimal: [/open-grid/, /statement/, /hero-crop/, /editorial-image/]
  };
  for (const [demo, patterns] of Object.entries(expected)) {
    const html = await read(`principal/demos/${demo}/index.html`);
    for (const pattern of patterns) assert.match(html, pattern);
  }
});

test('responsive contempla celulares reales, nombre largo y reduced-motion', async () => {
  for (const demo of DEMOS) {
    const css = await read(`principal/demos/${demo}/style.css`);
    const breakpoint = Number(css.match(/@media\s*\(max-width:\s*(\d+)px\)/)?.[1]);
    assert.ok(breakpoint >= 430 && breakpoint <= 730);
    assert.match(css, /@media\s*\(max-width:\s*390px\)/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.doesNotMatch(css, /requestAnimationFrame|particle/i);
  }
});

test('los assets locales declarados por cada demo existen y no hay fuentes remotas', async () => {
  for (const demo of DEMOS) {
    const [html, script] = await Promise.all([
      read(`principal/demos/${demo}/index.html`),
      read(`principal/demos/${demo}/script.js`)
    ]);
    assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|unsplash|pinterest/i);
    for (const source of [...html.matchAll(/(?:href|src)="([^"#?]+)"/g)].map((match) => match[1])) {
      if (/^(?:https?:|\/)/.test(source)) continue;
      await access(new URL(`../principal/demos/${demo}/${source}`, import.meta.url));
    }
    const music = script.match(/music:\s*'([^']+)'/)?.[1];
    assert.ok(music);
    await access(new URL(`../principal/demos/${demo}/${music}`, import.meta.url));
  }
});

test('el portafolio conserva exactamente Aloha y las cinco colecciones de esta etapa', async () => {
  const html = await read('principal/index.html');
  const routes = [...html.matchAll(/href="demos\/([^/]+)\/\?nombre=Andrea&amp;pases=2"/g)].map((match) => match[1]);
  assert.deepEqual(routes, DEMOS);
  for (const name of ['Luxury Collection', 'Botanical', 'Midnight', 'Romance', 'Minimal']) {
    const cardStart = html.indexOf(`<h3>${name}</h3>`);
    assert.ok(cardStart > 0);
    assert.match(html.slice(cardStart, cardStart + 500), /Ver demostración →/);
  }
  for (const excluded of ['celestial', 'vintage', 'garden', 'champagne', 'neon']) {
    assert.doesNotMatch(html.toLowerCase(), new RegExp(`demos/${excluded}`));
  }
  assert.deepEqual(NEW_COLLECTIONS, ['luxury', 'botanical', 'midnight', 'romance', 'minimal']);
});
