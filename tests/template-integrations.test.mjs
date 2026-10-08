import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('public templates load their module integration scripts', () => {
  for (const template of ['template-01', 'template-02', 'template-03']) {
    const html = read(`disenos/${template}/index.html`);
    assert.match(html, /<script type="module" src="\.\/script\.js"><\/script>/, template);
    assert.match(read(`disenos/${template}/script.js`), /\.\.\/\.\.\/shared\/utils\//, template);
  }
});

test('template actions expose the reusable utility integration points', () => {
  const expectations = {
    'template-01': ['data-whatsapp-action', 'data-order-item', 'data-menu-download', 'data-maps-action'],
    'template-02': ['data-flower-whatsapp', 'data-flower-configure', 'data-flower-download', 'data-flower-maps'],
    'template-03': ['data-car-whatsapp', 'data-car-calendar', 'data-car-maps', 'data-car-ics']
  };
  for (const [template, markers] of Object.entries(expectations)) {
    const source = read(`disenos/${template}/script.js`);
    markers.forEach((marker) => assert.match(source, new RegExp(marker), `${template}: ${marker}`));
  }
});

test('the shared demo modal leaves utility actions available to their handlers', () => {
  assert.match(read('disenos/demo-common.js'), /data-utility-action/);
});
