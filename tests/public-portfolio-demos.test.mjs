import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const DEMOS = ['luxury', 'botanical', 'midnight', 'romance', 'minimal'];
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('cada nueva colección es un sitio independiente con sus tres archivos', async () => {
    for (const demo of DEMOS) {
        for (const file of ['index.html', 'style.css', 'script.js']) {
            await access(new URL(`../principal/demos/${demo}/${file}`, import.meta.url));
        }
    }
});

test('cada demo implementa personalización, música, countdown, ubicación y RSVP', async () => {
    for (const demo of DEMOS) {
        const [html, css, script] = await Promise.all([
            read(`principal/demos/${demo}/index.html`),
            read(`principal/demos/${demo}/style.css`),
            read(`principal/demos/${demo}/script.js`)
        ]);
        assert.match(html, /id="open-invitation"/);
        assert.match(html, /id="music-control"/);
        assert.match(html, /data-countdown/);
        assert.match(html, /data-location/);
        assert.match(html, /data-rsvp/);
        assert.match(script, /new URLSearchParams\(window\.location\.search\)/);
        assert.match(script, /params\.get\('nombre'\)/);
        assert.match(script, /params\.get\('pases'\)/);
        assert.match(script, /audio\.src = EVENT\.music/);
        assert.match(script, /audio\.pause\(\)/);
        assert.match(script, /Math\.max\(targetTime - Date\.now\(\), 0\)/);
        assert.match(script, /encodeURIComponent\(message\)/);
        assert.match(css, /prefers-reduced-motion:\s*reduce/);
        assert.match(css, /@media\(max-width:7[0-3]0px\)/);
        assert.doesNotMatch(script, /console\./);
    }
});

test('los breakpoints móviles cubren 375, 390 y 430 sin ocultar controles', async () => {
    for (const demo of DEMOS) {
        const css = await read(`principal/demos/${demo}/style.css`);
        const breakpoint = Number(css.match(/@media\(max-width:(\d+)px\)/)?.[1]);
        assert.ok(breakpoint >= 430);
        assert.doesNotMatch(css, /\[data-(?:location|rsvp)\][^{]*\{[^}]*pointer-events:\s*none/s);
    }
});

test('singular, plural y fallback están definidos sin interpolar HTML inseguro', async () => {
    for (const demo of DEMOS) {
        const script = await read(`principal/demos/${demo}/script.js`);
        assert.match(script, /parsed > 0 && parsed <= 20 \? parsed : 1/);
        assert.match(script, /passes === 1/);
        assert.match(script, /textContent/);
        assert.doesNotMatch(script, /innerHTML\s*=.*guestName/);
    }
});

test('los enlaces y assets locales de cada demo existen', async () => {
    for (const demo of DEMOS) {
        const [html, script] = await Promise.all([
            read(`principal/demos/${demo}/index.html`),
            read(`principal/demos/${demo}/script.js`)
        ]);
        for (const source of [...html.matchAll(/(?:href|src)="([^"#?]+)"/g)].map((match) => match[1])) {
            if (/^(?:https?:|\/)/.test(source)) continue;
            await access(new URL(`../principal/demos/${demo}/${source}`, import.meta.url));
        }
        const music = script.match(/music:\s*'([^']+)'/)?.[1];
        assert.ok(music);
        await access(new URL(`../principal/demos/${demo}/${music}`, import.meta.url));
    }
});

test('el portafolio publica exactamente Aloha y las cinco colecciones de esta etapa', async () => {
    const html = await read('principal/index.html');
    const routes = [...html.matchAll(/href="demos\/([^/]+)\/\?nombre=Andrea&amp;pases=2"/g)].map((match) => match[1]);
    assert.deepEqual(routes, ['xv-renatta', ...DEMOS]);
    for (const name of ['Luxury Collection', 'Botanical', 'Midnight', 'Romance', 'Minimal']) {
        const cardStart = html.indexOf(`<h3>${name}</h3>`);
        assert.ok(cardStart > 0);
        assert.match(html.slice(cardStart, cardStart + 500), /Ver demostración →/);
        assert.doesNotMatch(html.slice(cardStart, cardStart + 500), /Próximamente/);
    }
    for (const excluded of ['celestial', 'vintage', 'garden', 'champagne', 'neon']) {
        assert.doesNotMatch(html.toLowerCase(), new RegExp(`demos/${excluded}`));
    }
});

test('Aloha no fue modificada en esta etapa', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);
    const { stdout } = await run('git', ['diff', '--name-only', '--', 'principal/demos/xv-renatta']);
    assert.equal(stdout.trim(), '');
});
