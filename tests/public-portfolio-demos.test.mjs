import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import {
  PACKAGE_MATRIX,
  PRESTIGE_COMMERCIAL_DEMO_MAP,
  PRESTIGE_DEMO_ARCHITECTURE,
  PRESTIGE_DEMO_FEATURES,
  PRESTIGE_SERVICE_BENEFITS
} from '../principal/demos/prestige-contract.js';

const ORIGINAL_COLLECTIONS = ['xv-renatta', 'luxury', 'botanical', 'midnight', 'romance', 'minimal'];
const SECOND_STAGE_COLLECTIONS = ['celestial', 'vintage', 'garden', 'champagne', 'neon-party'];
const DEMOS = [...ORIGINAL_COLLECTIONS, ...SECOND_STAGE_COLLECTIONS];
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const REFERENCE_DEMO = 'paquetes/demos/prestige';

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

const localDocumentReferences = (html) => [...html.matchAll(/(?:href|src)="([^"#]+)"/g)]
  .map((match) => match[1].replaceAll('&amp;', '&'))
  .filter((value) => !/^(?:https?:|mailto:|tel:)/.test(value));

const validateBalancedHtml = (html, label) => {
  const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack = [];
  for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    const token = match[0];
    const tag = match[1].toLowerCase();
    if (voidElements.has(tag) || token.endsWith('/>')) continue;
    if (!token.startsWith('</')) {
      stack.push(tag);
      continue;
    }
    assert.equal(stack.pop(), tag, `${label} tiene una etiqueta </${tag}> fuera de orden`);
  }
  assert.deepEqual(stack, [], `${label} contiene etiquetas HTML sin cerrar`);
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
  const commercialFeatures = new Set(Object.values(PACKAGE_MATRIX).flat());
  for (const [commercialName, demoFeature] of Object.entries(PRESTIGE_COMMERCIAL_DEMO_MAP)) {
    assert.ok(commercialFeatures.has(commercialName), `La función comercial no existe en paquetes.html: ${commercialName}`);
    assert.ok(PRESTIGE_DEMO_FEATURES.includes(demoFeature), `La función comercial no está representada en demos: ${demoFeature}`);
  }
});

test('la demo Prestige arquitectónica conserva su ruta pública y archivos propios', async () => {
  const packages = await read('paquetes/index.html');
  assert.match(packages, /href="\/paquetes\/demos\/prestige\/"/);
  assert.equal(PRESTIGE_DEMO_ARCHITECTURE.sourceRoute, '/paquetes/demos/prestige/');
  for (const file of PRESTIGE_DEMO_ARCHITECTURE.sourceFiles) {
    await access(new URL(`../${REFERENCE_DEMO}/${file}`, import.meta.url));
  }
});

test('la referencia Prestige modernizada implementa el contrato sin hotlinks', async () => {
  const [html, script, css] = await Promise.all([
    read(`${REFERENCE_DEMO}/index.html`),
    read(`${REFERENCE_DEMO}/demo.js`),
    read(`${REFERENCE_DEMO}/demo.css`)
  ]);
  const activeFeatures = collectPrestigeFeatures(html);
  for (const feature of PRESTIGE_DEMO_FEATURES) {
    assert.ok(activeFeatures.has(feature), `La referencia Prestige no representa: ${feature}`);
  }
  for (const field of ['demoMode', 'guest', 'defaultName', 'defaultPasses', 'event', 'date', 'time', 'locations', 'links']) {
    assert.match(script, new RegExp(`\\b${field}\\b`));
  }
  assert.match(script, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(script, /params\.get\('nombre'\)/);
  assert.match(script, /params\.get\('pases'\)/);
  assert.match(script, /demoMode:\s*true/);
  assert.match(script, /if \(EVENT_CONFIG\.demoMode\)/);
  assert.match(script, /else if \(url\)/);
  assert.match(script, /setAttribute\('role', 'dialog'\)/);
  assert.match(script, /event\.key === 'Escape'/);
  assert.match(script, /prefers-reduced-motion: reduce|reducedMotion/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:768px\)/);
  assert.match(css, /@media\(max-width:1024px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
  assert.doesNotMatch(html, /unsplash|w3schools|qrserver|fonts\.googleapis|unpkg/i);
  assert.doesNotMatch(script, /window\.open|window\.location\s*=|console\./);
  for (const action of new Set([...html.matchAll(/data-demo-action="([^"]+)"/g)].map((match) => match[1]))) {
    assert.match(script, new RegExp(`\\b${action}:`));
  }
  await access(new URL('../principal/demos/xv-renatta/musica.mp3', import.meta.url));
});

test('PRESTIGE_DEMO_FEATURES está activo al 100% en las once demos y las etiquetas son inequívocas', async () => {
  for (const demo of DEMOS) {
    const [html, script] = await Promise.all([
      read(`principal/demos/${demo}/index.html`),
      read(`principal/demos/${demo}/script.js`)
    ]);
    const activeFeatures = collectPrestigeFeatures(html);
    const fulfilled = PRESTIGE_DEMO_FEATURES.filter((feature) => activeFeatures.has(feature));
    assert.equal(fulfilled.length / PRESTIGE_DEMO_FEATURES.length, 1, `${demo} no alcanza paridad Prestige completa`);
    for (const feature of PRESTIGE_DEMO_FEATURES) {
      assert.ok(activeFeatures.has(feature), `${demo} no representa la función Prestige: ${feature}`);
    }
    assert.match(html, /Prestige · Demo/i);
    assert.match(html, /Demostración Prestige/i);
    assert.match(html, /funciones pueden variar según el paquete contratado/i);
    assert.match(html, /data-demo-video/);
    assert.match(html, /data-pass-selector/);
    assert.match(html, /data-access-preview/);
    assert.match(html, /data-access-mode="digital"/);
    assert.match(html, /data-access-mode="printed"/);
    assert.match(html, /data-demo-action="gifts"/);
    assert.match(script, /demoMode:\s*true/);
  }
});

test('las once tarjetas del portafolio identifican sus experiencias Prestige', async () => {
  const html = await read('principal/index.html');
  assert.equal((html.match(/class="portfolio-prestige-badge">Prestige · Demo/g) || []).length, DEMOS.length);
});

test('las once colecciones conservan sitios independientes y comparten únicamente el runtime', async () => {
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

test('todas las cards resuelven con capitalización exacta a un index y dependencias locales existentes', async () => {
  const portfolio = await read('principal/index.html');
  const realDirectories = new Set(await readdir(new URL('../principal/demos/', import.meta.url)));
  const hrefs = [...portfolio.matchAll(/href="demos\/([^/]+)\/\?nombre=Andrea&amp;pases=2"/g)];
  assert.equal(hrefs.length, DEMOS.length);
  assert.deepEqual(hrefs.map((match) => match[1]), DEMOS);

  for (const [, slug] of hrefs) {
    assert.ok(realDirectories.has(slug), `La capitalización o el directorio de ${slug} no coincide con el href`);
    const pageUrl = new URL(`../principal/demos/${slug}/index.html`, import.meta.url);
    const html = await read(`principal/demos/${slug}/index.html`);
    await access(pageUrl);
    for (const reference of localDocumentReferences(html)) {
      const target = new URL(reference, pageUrl);
      target.search = '';
      target.hash = '';
      await access(target);
    }
  }
});

test('Vintage y Champagne inicializan su EVENT y mantienen su CTA de apertura libre de overlays', async () => {
  const portfolio = await read('principal/index.html');
  for (const demo of ['vintage', 'champagne']) {
    const [html, css, script] = await Promise.all([
      read(`principal/demos/${demo}/index.html`),
      read(`principal/demos/${demo}/style.css`),
      read(`principal/demos/${demo}/script.js`)
    ]);
    assert.match(portfolio, new RegExp(`href="demos/${demo}/\\?nombre=Andrea&amp;pases=2"`));
    assert.match(html, /id="open-invitation"/);
    assert.match(html, /src="\.\.\/demo-runtime\.js"/);
    assert.match(html, /src="script\.js"/);
    assert.match(html, /href="\.\.\/demo-mode\.css"/);
    assert.match(html, /href="style\.css"/);
    assert.match(css, demo === 'vintage'
      ? /\.postcard:before\{pointer-events:none/
      : /\.stationery:before\{pointer-events:none/);

    let eventConfig;
    vm.runInNewContext(script, {
      EventoraDemo: { mount: (config) => { eventConfig = config; } },
      encodeURIComponent,
      Object
    }, { filename: `${demo}/script.js` });
    assert.ok(eventConfig, `${demo} no llamó EventoraDemo.mount`);
    assert.equal(eventConfig.demoMode, true);
    assert.match(eventConfig.title, /boda/i);
    assert.doesNotThrow(() => new Date(eventConfig.date).toISOString());
    assert.ok(eventConfig.music);
    for (const action of ['maps', 'calendar', 'gifts', 'hotel', 'rsvp']) {
      assert.ok(eventConfig.links[action], `${demo} no configuró ${action}`);
    }
    assert.match(eventConfig.links.rsvp({ guestName: 'Familia Hernández Rodríguez', passes: 6 }), /^https:\/\/wa\.me\//);
  }
});

test('los once documentos mantienen IDs únicos, anclas válidas y HTML balanceado', async () => {
  for (const demo of DEMOS) {
    const html = await read(`principal/demos/${demo}/index.html`);
    validateBalancedHtml(html, demo);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${demo} contiene IDs duplicados`);
    for (const fragment of [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])) {
      assert.ok(ids.includes(fragment), `${demo} enlaza a #${fragment}, pero ese ID no existe`);
    }
  }
});

test('el pulido común protege capas, safe areas, nombres largos y controles táctiles', async () => {
  const css = await read('principal/demos/demo-mode.css');
  assert.match(css, /z-index:\s*2147483000/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /#open-invitation[\s\S]*?z-index:\s*20/);
  assert.match(css, /#open-invitation[\s\S]*?min-height:\s*44px/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /max-height:\s*calc\(100dvh/);
  assert.match(css, /body \.music-control/);
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
  assert.match(runtime, /count <= context\.authorizedPasses/);
  assert.match(runtime, /context\.selectedPasses = count/);
  assert.match(runtime, /setAttribute\('aria-pressed'/);
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
    const htmlWithoutCanonical = html.replace(/<link rel="canonical" href="https?:\/\/[^">]+">/g, '');
    assert.doesNotMatch(htmlWithoutCanonical, /href="https?:/);
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
    'xv-renatta': [/resort-card/, /hero-sun/, /postcards/, /itinerary/, /dress-copy/, /envelope-section/, /island-pass/, /tropical-button/],
    luxury: [/envelope-wrap/, /hero-visual/, /gallery-grid/, /black-tie-agenda/, /dress-figures/, /concierge/, /seat-pass/, /button-gold/],
    botanical: [/class="paper"/, /hero-art/, /memory-strip/, /itinerary/, /garden-frame/, /class="gifts/, /pressed-pass/, /leaf-button/],
    midnight: [/class="darkness"/, /hero-light/, /night-gallery/, /timeline/, /silhouettes/, /night-services/, /night-pass/, /class="rsvp/],
    romance: [/class="letter"/, /class="portrait(?:\s|")/, /photo-story/, /romance-itinerary/, /dress-gifts/, /small-notes/, /letter-pass/, /class="rsvp/],
    minimal: [/open-grid/, /hero-grid/, /class="gallery/, /minimal-itinerary/, /class="dress/, /class="registry/, /access-index/, /class="rsvp/],
    celestial: [/constellation-mark/, /class="moon"/, /floating-archive/, /star-itinerary/, /night-code/, /celestial-gifts/, /celestial-pass/, /celestial-button/],
    vintage: [/class="postcard"/, /masthead/, /analog-album/, /printed-program/, /fashion-plate/, /registry-letter/, /classic-ticket/, /vintage-button/],
    garden: [/gate-left/, /garden-depth/, /garden-album/, /garden-path/, /floral-frame/, /garden-gifts/, /garden-card/, /garden-button/],
    champagne: [/class="stationery"/, /hero-photo/, /editorial-gallery/, /jewel-itinerary/, /silk-look/, /new-chapter/, /champagne-card/, /champagne-button/],
    'neon-party': [/digital-poster/, /flash-photo/, /flash-collage/, /class="lineup/, /look-poster/, /party-desk/, /all-access/, /party-button/]
  };
  for (const [demo, patterns] of Object.entries(expected)) {
    const html = await read(`principal/demos/${demo}/index.html`);
    for (const pattern of patterns) assert.match(html, pattern);
  }
});

test('las once colecciones usan lenguajes de movimiento y accesos visualmente distintos', async () => {
  const signatures = {
    'xv-renatta': [/rotate\(-\.25deg\)/, /island-pass/],
    luxury: [/scale\(\.985\)/, /seat-pass/],
    botanical: [/rotate\(\.35deg\)/, /pressed-pass/],
    midnight: [/clip-path:inset\(0 0 10% 0\)/, /night-pass/],
    romance: [/rotate\(-\.35deg\)/, /letter-pass/],
    minimal: [/translateX\(-24px\)/, /access-index/],
    celestial: [/filter:blur\(4px\)/, /celestial-pass/],
    vintage: [/rotate\(-\.25deg\)/, /classic-ticket/],
    garden: [/scale\(\.99\)/, /garden-card/],
    champagne: [/filter:brightness\(\.96\)/, /champagne-card/],
    'neon-party': [/skewX\(-1deg\)/, /all-access/]
  };
  for (const [demo, patterns] of Object.entries(signatures)) {
    const css = await read(`principal/demos/${demo}/style.css`);
    for (const pattern of patterns) assert.match(css, pattern);
  }
  assert.equal(new Set(Object.keys(signatures)).size, DEMOS.length);
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

test('la curaduría fotográfica usa cuatro WebP locales por demo con dimensiones y carga responsable', async () => {
  const referenced = new Set();
  for (const demo of DEMOS) {
    const html = await read(`principal/demos/${demo}/index.html`);
    const photos = [...html.matchAll(/<img\b[^>]*class="demo-photo"[^>]*>/g)].map((match) => match[0]);
    assert.equal(photos.length, 4, `${demo} debe integrar cuatro fotografías curadas`);
    assert.match(html, /\.\.\/assets\/demo-photos\.css/);
    assert.doesNotMatch(html, /<img\b[^>]*src="https?:\/\//i);

    for (const photo of photos) {
      const source = photo.match(/src="([^"]+)"/)?.[1];
      const alt = photo.match(/alt="([^"]*)"/)?.[1];
      assert.ok(source?.endsWith('.webp'), `${demo} debe servir fotografía WebP local`);
      assert.ok(alt !== undefined, `${source} necesita atributo alt`);
      assert.match(photo, /\bwidth="\d+"/);
      assert.match(photo, /\bheight="\d+"/);
      assert.match(photo, /\bdecoding="async"/);
      if (!/fetchpriority="high"/.test(photo)) assert.match(photo, /loading="lazy"/);
      await access(new URL(`../principal/demos/${demo}/${source}`, import.meta.url));
      assert.equal(referenced.has(source), false, `No se reutilizan fotos entre colecciones: ${source}`);
      referenced.add(source);
    }
  }
  assert.equal(referenced.size, 44);

  const sources = await read('principal/demos/assets/images/IMAGE_SOURCES.md');
  assert.match(sources, /Pexels License/);
  assert.match(sources, /2026-08-12/);
  for (const source of referenced) assert.match(sources, new RegExp(source.split('/').at(-1).replace('.', '\\.')));
});

test('el portafolio publica exactamente las once colecciones Prestige activas', async () => {
  const html = await read('principal/index.html');
  const routes = [...html.matchAll(/href="demos\/([^/]+)\/\?nombre=Andrea&amp;pases=2"/g)].map((match) => match[1]);
  assert.deepEqual(routes, DEMOS);
  for (const name of ['Colección Aloha 🌴', 'Luxury Collection', 'Botanical', 'Midnight', 'Romance', 'Minimal', 'Celestial', 'Vintage', 'Garden', 'Champagne', 'Neon Party']) {
    const cardStart = html.indexOf(`<h3>${name}</h3>`);
    assert.ok(cardStart > 0);
    assert.match(html.slice(cardStart, cardStart + 500), /Ver demostración →/);
  }
  assert.doesNotMatch(html, /Próximamente/i);
  assert.deepEqual(ORIGINAL_COLLECTIONS, ['xv-renatta', 'luxury', 'botanical', 'midnight', 'romance', 'minimal']);
  assert.deepEqual(SECOND_STAGE_COLLECTIONS, ['celestial', 'vintage', 'garden', 'champagne', 'neon-party']);
});

test('la segunda etapa mantiene contrastes narrativos obligatorios', async () => {
  const [midnight, celestial, neon, botanical, garden, luxury, champagne] = await Promise.all([
    read('principal/demos/midnight/index.html'),
    read('principal/demos/celestial/index.html'),
    read('principal/demos/neon-party/index.html'),
    read('principal/demos/botanical/index.html'),
    read('principal/demos/garden/index.html'),
    read('principal/demos/luxury/index.html'),
    read('principal/demos/champagne/index.html')
  ]);
  assert.match(midnight, /AFTER DARK|MIDNIGHT/);
  assert.match(celestial, /constelación|CARTA CELESTE/i);
  assert.match(neon, /ENTER THE PARTY|LINEUP/);
  assert.match(botanical, /herbario|BOTANICAL/i);
  assert.match(garden, /puertas del jardín|pérgola|fuente/i);
  assert.match(luxury, /black-tie|BLACK TIE/i);
  assert.match(champagne, /lujo luminoso|CHAMPAGNE|cristal/i);
});
