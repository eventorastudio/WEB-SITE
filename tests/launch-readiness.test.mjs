import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const DEMOS = ['xv-renatta', 'luxury', 'botanical', 'midnight', 'romance', 'minimal', 'celestial', 'vintage', 'garden', 'champagne', 'neon-party'];

const validateBalancedHtml = (html, label) => {
  const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack = [];
  for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    const token = match[0];
    const tag = match[1].toLowerCase();
    if (voidElements.has(tag) || token.endsWith('/>')) continue;
    if (!token.startsWith('</')) stack.push(tag);
    else assert.equal(stack.pop(), tag, `${label} tiene una etiqueta </${tag}> fuera de orden`);
  }
  assert.deepEqual(stack, [], `${label} contiene etiquetas HTML sin cerrar`);
};

test('el loader principal funciona como bienvenida premium sin alterar la carga real', async () => {
  const [html, css, script] = await Promise.all([
    read('principal/index.html'),
    read('principal/style.css'),
    read('principal/script.js')
  ]);
  const loaderStart = html.indexOf('<div id="loader"');
  const loaderEnd = html.indexOf('<!-- ================= HEADER', loaderStart);
  const loader = html.slice(loaderStart, loaderEnd);

  assert.match(loader, /role="status"/);
  assert.match(loader, /Bienvenido a/);
  assert.match(loader, /Eventora Studio/);
  assert.match(loader, /Diseñamos experiencias digitales para momentos inolvidables/);
  assert.match(loader, /src="assets\/portfolio\/LOGO2\.png"/);
  assert.match(loader, /width="1717" height="1717"/);
  assert.doesNotMatch(loader, /LOGO\.jpg/);

  assert.match(css, /\.loader-logo-shell\{[\s\S]*?width:clamp\(126px,14vw,174px\)/);
  assert.match(css, /\.loader-logo\{[\s\S]*?object-fit:contain/);
  assert.match(css, /#loader\.hide \.loader-content/);
  assert.match(css, /@keyframes loaderReveal/);
  assert.match(css, /@keyframes loaderProgress/);
  assert.match(css, /@media \(max-width:480px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);

  assert.match(script, /window\.addEventListener\("load", finishLoading/);
  assert.match(script, /loader\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(script, /}, 180\);/);
});

test('el portafolio conserva 11 demos y usa una sola fuente de metadatos para los filtros', async () => {
  const [html, script, css] = await Promise.all([
    read('principal/index.html'),
    read('principal/script.js'),
    read('principal/style.css')
  ]);
  const cards = [...html.matchAll(/class="portfolio-card" data-event-types="([^"]+)"/g)];
  assert.equal(cards.length, 11);
  assert.equal((html.match(/class="portfolio-filter/g) || []).length, 5); // contenedor + 4 botones
  for (const filter of ['todas', 'bodas', 'xv', 'celebraciones']) assert.match(html, new RegExp(`data-filter="${filter}"`));
  for (const card of cards) assert.match(card[1], /^(?:bodas|xv|celebraciones)(?: (?:bodas|xv|celebraciones))*$/);
  assert.match(script, /card\.dataset\.eventTypes/);
  assert.match(script, /aria-pressed/);
  assert.match(script, /ArrowLeft/);
  assert.match(script, /emptyState\.hidden/);
  assert.match(css, /\.portfolio-card\[hidden\]/);
  assert.equal((html.match(/<option value="demos\//g) || []).length, 11);
  assert.match(html, /id="demo-qr-dialog"/);
  assert.match(script, /vendor\/qrcode-generator\.js/);
  assert.match(script, /qr\.createDataURL/);
  await access(new URL('../principal/vendor/qrcode-generator.js', import.meta.url));
});

test('la comunicación comercial distingue demos Prestige y alcance por paquete', async () => {
  const [home, packages, homeCss] = await Promise.all([read('principal/index.html'), read('paquetes/index.html'), read('principal/style.css')]);
  const homePackagesStart = home.indexOf('<section class="packages"');
  const homePackagesEnd = home.indexOf('<section class="testimonials"', homePackagesStart);
  const homePackages = home.slice(homePackagesStart, homePackagesEnd);
  const portfolioStart = home.indexOf('<section id="portafolio"');
  const portfolioEnd = home.indexOf('<section class="benefits"', portfolioStart);
  const portfolio = home.slice(portfolioStart, portfolioEnd);

  assert.match(home, /TODO LO QUE PUEDES INTEGRAR/);
  assert.match(home, /Las funcionalidades disponibles dependen del paquete seleccionado/);
  assert.match(portfolio, /Demostraciones Prestige/);
  assert.match(portfolio, /Nuestras demostraciones presentan la experiencia más completa de Eventora Studio/);
  assert.equal((portfolio.match(/class="portfolio-prestige-badge">Prestige · Demo/g) || []).length, 11);
  assert.match(home, /¿Todas las demostraciones incluyen las funciones de todos los paquetes\?/);

  for (const name of ['Esencial', 'Premium', 'Prestige']) assert.match(homePackages, new RegExp(`<h3>${name}</h3>`));
  assert.equal((homePackages.match(/class="package-label">PAQUETE/g) || []).length, 3);
  assert.equal((homePackages.match(/Ver paquete →/g) || []).length, 3);
  assert.deepEqual(
    [...homePackages.matchAll(/href="(\/paquetes\/#(?:esencial|premium|prestige))"/g)].map((match) => match[1]),
    ['/paquetes/#esencial', '/paquetes/#premium', '/paquetes/#prestige']
  );
  assert.doesNotMatch(homePackages, /\$\s*(?:349|649|849)|MXN|price-box|package-highlights|package-contact|<ul\b|incluye/i);
  assert.match(homeCss, /\.package-btn:focus-visible/);
  assert.match(homeCss, /\.packages-grid\s*\{[\s\S]*?grid-template-columns:repeat\(3,1fr\)/);
  assert.match(homeCss, /@media \(min-width:769px\) and \(max-width:1100px\)/);
  assert.match(homeCss, /@media \(max-width:768px\)[\s\S]*?\.packages-grid[\s\S]*?grid-template-columns:1fr/);
  assert.match(homeCss, /@media \(max-width:576px\)/);
  const packageCssStart = homeCss.indexOf('PACKAGES\n==========================*/');
  const packageCssEnd = homeCss.indexOf('TESTIMONIOS\n==========================*/', packageCssStart);
  assert.doesNotMatch(homeCss.slice(packageCssStart, packageCssEnd), /\.package-card\s*\{[^}]*height:/);

  for (const price of ['$349.00 MXN', '$649.00 MXN', '$849.00 MXN']) assert.ok(packages.includes(price));
  for (const id of ['esencial', 'premium', 'prestige']) assert.match(packages, new RegExp(`id="${id}"`));
  assert.equal((packages.match(/<h4>/g) || []).length, 22);
  assert.doesNotMatch(packages, /packages-disclosure|demostraciones del portafolio muestran la experiencia Prestige/i);
});

test('los escenarios comerciales no se presentan como testimonios reales', async () => {
  const home = await read('principal/index.html');
  assert.match(home, /Experiencias que podemos crear/);
  assert.doesNotMatch(home, /Lo que dicen nuestros clientes|María González|Andrea López|Fernanda Ruiz/);
  assert.doesNotMatch(home, /data-lucide="star"/);
});

test('WhatsApp lleva un mensaje estructurado y conserva contexto de paquete', async () => {
  const [home, packages] = await Promise.all([read('principal/index.html'), read('paquetes/index.html')]);
  for (const html of [home, packages]) {
    assert.match(html, /Tipo%20de%20evento%3A/);
    assert.match(html, /Fecha%20aproximada%3A/);
    assert.match(html, /Paquete%20de%20inter%C3%A9s%3A/);
    assert.match(html, /Colecci%C3%B3n%20de%20inter%C3%A9s%3A/);
  }
  for (const name of ['Esencial', 'Premium', 'Prestige']) {
    assert.match(packages, new RegExp(`Paquete%20de%20inter%C3%A9s%3A%20${name}`));
  }
});

test('SEO público, sitemap, robots, 404 y áreas privadas quedan listos', async () => {
  const [home, packages, robots, sitemap, notFound] = await Promise.all([
    read('principal/index.html'), read('paquetes/index.html'), read('robots.txt'), read('sitemap.xml'), read('404.html')
  ]);
  for (const [html, canonical] of [[home, '/principal/'], [packages, '/paquetes/']]) {
    assert.match(html, /<meta name="description"/);
    assert.match(html, /property="og:title"/);
    assert.match(html, /name="twitter:card"/);
    assert.match(html, /apple-touch-icon/);
    assert.ok(html.includes(`rel="canonical" href="https://eventorastudio.com${canonical}"`));
  }
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Disallow: \/portal\//);
  assert.match(robots, /Sitemap: https:\/\/eventorastudio\.com\/sitemap\.xml/);
  assert.equal((sitemap.match(/<url>/g) || []).length, 16);
  assert.match(notFound, /ERROR 404/);
  assert.match(notFound, /noindex,follow/);

  for (const path of ['admin/index.html', 'admin/dashboard.html', 'portal/index.html', 'portal/dashboard.html']) {
    assert.match(await read(path), /noindex,nofollow/);
  }
  for (const demo of DEMOS) {
    const html = await read(`principal/demos/${demo}/index.html`);
    assert.ok(html.includes(`rel="canonical" href="https://eventorastudio.com/principal/demos/${demo}/"`));
  }
});

test('las páginas legales existen, se enlazan y mantienen una nota interna de revisión', async () => {
  const [home, packages, privacy, terms, policies, note] = await Promise.all([
    read('principal/index.html'), read('paquetes/index.html'), read('legal/privacidad/index.html'),
    read('legal/terminos/index.html'), read('legal/politicas/index.html'), read('legal/README.md')
  ]);
  for (const route of ['/legal/privacidad/', '/legal/terminos/', '/legal/politicas/']) {
    assert.ok(home.includes(route));
    assert.ok(packages.includes(route));
  }
  assert.match(privacy, /Aviso de privacidad/);
  assert.match(terms, /Términos de uso/);
  assert.match(policies, /Políticas de servicio/);
  assert.match(note, /revisados por un profesional competente/);
  assert.doesNotMatch(`${privacy}${terms}${policies}`, /S\.A\.|domicilio fiscal|garantizamos disponibilidad/iu);
});

test('las páginas de lanzamiento tienen HTML balanceado y referencias críticas presentes', async () => {
  for (const path of ['principal/index.html', 'paquetes/index.html', 'legal/privacidad/index.html', 'legal/terminos/index.html', 'legal/politicas/index.html', '404.html']) {
    const html = await read(path);
    validateBalancedHtml(html, path);
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    for (const fragment of [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])) {
      assert.ok(ids.has(fragment), `${path} enlaza a #${fragment}, pero ese ID no existe`);
    }
    for (const tag of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      assert.match(tag[0], /rel="[^"]*noopener[^"]*"/, `${path} abre una pestaña sin noopener`);
    }
  }
  for (const path of ['principal/favicon.ico', 'paquetes/favicon.ico', 'principal/assets/hero.jpg', 'legal/legal.css']) {
    await access(new URL(`../${path}`, import.meta.url));
  }
});
