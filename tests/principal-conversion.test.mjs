import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'principal/index.html'), 'utf8');

test('principal comunica el servicio y mantiene la jerarquía de conversión', () => {
  assert.match(html, /<h1>[^<]*Sitios web para negocios/);
  assert.match(html, /href="\/solicitar\/">Solicitar mi sitio/);
  assert.match(html, /href="\/disenos\/">Ver diseños/);
  assert.match(html, /id="como-funciona"/);
  assert.match(html, /id="paquetes"/);
  assert.match(html, /id="contacto"/);
});

test('principal conserva precios, pago y alcance comercial', () => {
  assert.match(html, /\$599\s*<small>MXN<\/small>/);
  assert.match(html, /\$999\s*<small>MXN<\/small>/);
  assert.match(html, /Cotización personalizada/);
  assert.match(html, /30%/);
  assert.match(html, /70%/);
  assert.match(html, /Cambios ilimitados dentro del alcance acordado/);
  assert.doesNotMatch(html, /Cambios ilimitados durante el desarrollo dentro del alcance acordado/);
  assert.match(html, /Para los que quieren mantener su página publicada/);
});

test('principal presenta paquetes comparables y hosting fuera del desarrollo', () => {
  for (const plan of ['esencial', 'profesional', 'a-medida']) {
    assert.match(html, new RegExp(`data-plan-id="${plan}"`));
    assert.match(html, new RegExp(`href="/solicitar/\\?plan=${plan}"`));
  }
  assert.match(html, /package-ideal/);
  assert.match(html, /package-badge">Recomendado/);
  assert.match(html, /package-guidance/);
  assert.match(html, /href="\/solicitar\/">Ayúdame a elegir/);
  assert.match(html, /id="hosting"/);
});

test('principal no expone legacy ni datos internos y conserva SEO de Fase 8E', () => {
  assert.doesNotMatch(html, /invitaci[oó]n|RSVP|eventos digitales|messages@gmail\.com|\/paquetes\/|\/Invitaciones\//i);
  assert.match(html, /rel="canonical" href="https:\/\/eventorastudio\.com\/principal\/"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /application\/ld\+json/);
});

test('principal presenta el caso real de Yogurt Arte Sanar sin métricas inventadas', () => {
  assert.match(html, /id="proyecto-real"/);
  assert.match(html, /Yogurt Arte Sanar/);
  assert.match(html, /href="https:\/\/eventorastudio\.com\/yogurt-arte-sanar\//);
  assert.match(html, /href="\/solicitar\/">Quiero algo así/);
  assert.match(html, /assets\/portfolio\/yogurt-arte-sanar\.webp/);
  assert.match(html, /alt="Vista real del sitio web de Yogurt Arte Sanar/);
  assert.match(html, /Responsive/);
  assert.match(html, /Pedidos por WhatsApp/);
  assert.doesNotMatch(html, /\+\d+\s*(ventas|conversiones|pedidos)/i);
});
