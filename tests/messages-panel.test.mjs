import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('mensajes conserva funciones protegidas y evita Firestore directo', () => {
  const html = read('mensajes/index.html');
  const script = read('mensajes/script.js');
  for (const functionName of ['getWebsiteRequests', 'updateWebsiteRequestStatus', 'deleteWebsiteRequest']) assert.match(script, new RegExp(functionName));
  assert.match(script, /getIdToken/);
  assert.match(script, /Authorization/);
  assert.doesNotMatch(script, /firebase-firestore|initializeFirestore|getFirestore/);
  assert.doesNotMatch(script, /\.innerHTML/);
  assert.match(html, /noindex,nofollow/);
});

test('mensajes expone filtros, orden, estados y datos legibles', () => {
  const html = read('mensajes/index.html');
  const script = read('mensajes/script.js');
  for (const id of ['request-search', 'status-filter', 'plan-filter', 'sort-order', 'results-summary']) assert.match(html, new RegExp(`id="${id}"`));
  for (const value of ['new', 'contacted', 'in_progress', 'completed']) assert.match(script, new RegExp(value));
  for (const value of ['Eagles Burger', 'My Love Flowers', 'Premium Car', 'Servicios / productos', 'Horarios / ubicación']) assert.match(script, new RegExp(value));
  assert.match(html, /Más recientes/);
  assert.match(html, /Más antiguas/);
  assert.match(script, /normalizeText/);
});

test('mensajes mantiene acciones operativas sin eliminar al primer clic', () => {
  const html = read('mensajes/index.html');
  const script = read('mensajes/script.js');
  assert.match(script, /buildWhatsAppUrl/);
  assert.match(script, /Abrir WhatsApp/);
  assert.match(script, /Copiar correo/);
  assert.match(script, /Copiar WhatsApp/);
  assert.match(html, /confirm-delete/);
  assert.match(html, /Esta acción no se puede deshacer/);
  assert.doesNotMatch(script, /window\.confirm/);
});
