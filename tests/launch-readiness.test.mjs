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
  assert.match(html, /<body class="loading">/);
  assert.match(html, /window\.EVENTORA_LOADER_STARTED_AT = performance\.now\(\)/);

  assert.match(css, /\.loader-logo-shell\{[\s\S]*?width:clamp\(126px,14vw,174px\)/);
  assert.match(css, /\.loader-logo\{[\s\S]*?object-fit:contain/);
  assert.match(css, /#loader\.hide \.loader-content/);
  assert.match(css, /@keyframes loaderReveal/);
  assert.match(css, /@keyframes loaderProgress/);
  assert.match(css, /@keyframes pageReveal/);
  assert.match(css, /body\.loading > header[\s\S]*?pointer-events:none/);
  assert.match(css, /animation:loaderMarkReveal \.9s \.08s/);
  assert.match(css, /animation:loaderReveal \.72s 1\.02s/);
  assert.match(css, /animation:loaderReveal \.82s 1\.88s/);
  assert.match(css, /animation:loaderReveal \.82s 2\.72s/);
  assert.match(css, /animation:loaderProgress 4\.45s \.42s/);
  assert.match(css, /@media \(max-width:480px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);

  assert.match(script, /window\.addEventListener\("load", finishLoading/);
  assert.match(script, /const LOADER_MIN_DURATION = 5000/);
  assert.match(script, /Number\(window\.EVENTORA_LOADER_STARTED_AT\) \|\| performance\.now\(\)/);
  assert.match(script, /Math\.max\(0, LOADER_MIN_DURATION - elapsedTime\)/);
  assert.match(script, /loader\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(script, /document\.body\.classList\.add\("loader-complete"\)/);
  assert.match(script, /}, remainingTime\);/);
  assert.doesNotMatch(script, /sessionStorage|localStorage/);
});

test('el portafolio conserva 11 demos y usa una sola fuente de metadatos para los filtros', async () => {
  const [html, script, css] = await Promise.all([
    read('principal/index.html'),
    read('principal/script.js'),
    read('principal/style.css')
  ]);
  const portfolioStart = html.indexOf('<section id="portafolio"');
  const portfolioEnd = html.indexOf('<section class="benefits"', portfolioStart);
  const portfolio = html.slice(portfolioStart, portfolioEnd);
  const cards = [...html.matchAll(/class="portfolio-card" data-event-types="([^"]+)"/g)];
  const cardTargets = [...portfolio.matchAll(/<a href="(demos\/[^"]+)" class="portfolio-card"/g)];
  assert.equal(cards.length, 11);
  assert.equal(cardTargets.length, 11);
  assert.equal((portfolio.match(/<span>Ver demostraci[^<]*<\/span>/g) || []).length, 11);
  assert.equal((html.match(/class="portfolio-filter/g) || []).length, 5); // contenedor + 4 botones
  for (const filter of ['todas', 'bodas', 'xv', 'celebraciones']) assert.match(html, new RegExp(`data-filter="${filter}"`));
  for (const card of cards) assert.match(card[1], /^(?:bodas|xv|celebraciones)(?: (?:bodas|xv|celebraciones))*$/);
  assert.match(script, /card\.dataset\.eventTypes/);
  assert.match(script, /aria-pressed/);
  assert.match(script, /ArrowLeft/);
  assert.match(script, /emptyState\.hidden/);
  assert.match(css, /\.portfolio-card\[hidden\]/);

  assert.ok(portfolio.indexOf('portfolio-disclosure') < portfolio.indexOf('portfolio-filters'));
  assert.ok(portfolio.indexOf('portfolio-filters') < portfolio.indexOf('portfolio-results'));
  assert.ok(portfolio.indexOf('portfolio-results') < portfolio.indexOf('portfolio-grid'));
  assert.doesNotMatch(portfolio, /Abrir una demo en tu celular|Ver en tu celular|demo-qr-|portfolio-device/);
  assert.doesNotMatch(script, /initializeDemoQr|demo-qr-|qrcode-generator|globalThis\.qrcode|createDataURL/);
  assert.doesNotMatch(css, /demo-qr-|portfolio-device/);
  await assert.rejects(
    access(new URL('../principal/vendor/qrcode-generator.js', import.meta.url)),
    (error) => error?.code === 'ENOENT'
  );
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

test('los footers públicos muestran Instagram, WhatsApp y correo mediante Lucide estable', async () => {
  const publicPages = [
    'principal/index.html',
    'paquetes/index.html',
    'legal/privacidad/index.html',
    'legal/terminos/index.html',
    'legal/politicas/index.html',
    '404.html'
  ];
  const [shell, socialCss, ...pages] = await Promise.all([
    read('principal/public-shell.js'),
    read('principal/public-socials.css'),
    ...publicPages.map(read)
  ]);

  for (const [index, html] of pages.entries()) {
    const footerStart = html.indexOf('<footer');
    const footerEnd = html.indexOf('</footer>', footerStart);
    const footer = html.slice(footerStart, footerEnd);
    assert.ok(footerStart >= 0, `${publicPages[index]} no contiene footer`);
    assert.match(footer, /class="[^"]*public-socials[^"]*" role="group" aria-label="Redes sociales y contacto"/);
    assert.match(footer, /href="https:\/\/www\.instagram\.com\/eventorastudio\/"/);
    assert.match(footer, /aria-label="Instagram de Eventora Studio"/);
    assert.match(footer, /data-lucide="instagram"/);
    assert.match(footer, /aria-label="WhatsApp de Eventora Studio"/);
    assert.match(footer, /data-lucide="message-circle"/);
    assert.match(footer, /href="mailto:Ev3ntoraStudio@gmail\.com"/);
    assert.match(footer, /data-lucide="mail"/);
    assert.match(html, /lucide@0\.522\.0\/dist\/umd\/lucide\.min\.js/);
    assert.match(html, /principal\/public-shell\.js|src="public-shell\.js"/);
    assert.doesNotMatch(html, /lucide@latest/);
  }

  assert.match(shell, /typeof globalThis\.lucide\?\.createIcons/);
  assert.match(shell, /globalThis\.lucide\.createIcons\(\)/);
  assert.match(socialCss, /\.public-socials a:focus-visible/);
  assert.match(socialCss, /\.public-socials svg\{[\s\S]*?stroke:currentColor;[\s\S]*?opacity:1/);
});

test('paquetes reutiliza el header público con navegación activa y anchors despejados', async () => {
  const [packages, home, publicShell, homeCss, packageCss] = await Promise.all([
    read('paquetes/index.html'),
    read('principal/index.html'),
    read('principal/public-shell.js'),
    read('principal/style.css'),
    read('paquetes/paquetes.css')
  ]);
  const headerStart = packages.indexOf('<header>');
  const headerEnd = packages.indexOf('</header>', headerStart);
  const header = packages.slice(headerStart, headerEnd);

  assert.ok(headerStart >= 0);
  assert.match(header, /href="\/principal\/" class="logo"/);
  assert.match(header, /class="menu-toggle"/);
  assert.match(header, /aria-controls="primary-navigation"/);
  assert.match(header, /<nav id="primary-navigation" aria-label="Navegación principal">/);
  assert.match(header, /href="\/principal\/#inicio">Inicio<\/a>/);
  assert.match(header, /href="\/principal\/#portafolio">Portafolio<\/a>/);
  assert.match(header, /href="\/paquetes\/" aria-current="page">Paquetes<\/a>/);
  assert.match(header, /href="\/principal\/#contacto">Contacto<\/a>/);
  assert.match(packages.slice(headerEnd), /class="menu-backdrop" aria-hidden="true"/);
  assert.match(home, /class="menu-toggle"/);
  assert.match(publicShell, /window\.matchMedia\("\(max-width: 768px\)"\)/);
  assert.match(publicShell, /event\.key === "Escape"/);
  assert.match(homeCss, /nav a\[aria-current="page"\]/);
  assert.match(packageCss, /\.package-section\{[\s\S]*?scroll-margin-top:100px/);
  assert.match(packageCss, /\.packages-overview\{[\s\S]*?scroll-margin-top:100px/);
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
