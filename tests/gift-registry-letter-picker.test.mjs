import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGift } from '../admin/invitations/core/logistics-schema.js';
import { GIFT_LETTER_KEYS, inferGiftLetterKey, normalizeGiftLetterKey } from '../admin/invitations/core/gift-letter-registry.js';
import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { initGiftEditor } from '../admin/invitations/editors/gift-editor.js';
import { applyAlohaPhase3Bindings } from '../admin/invitations/core/aloha-template-bindings.js';

test('fallback legacy de regalos usa la primera letra válida', () => {
    assert.equal(inferGiftLetterKey({ name: 'Liverpool' }), 'L');
    assert.equal(inferGiftLetterKey({ name: 'Apple' }), 'A');
    assert.equal(inferGiftLetterKey({ name: 'MACSTORE' }), 'M');
    assert.equal(inferGiftLetterKey({ name: 'Efectivo' }), 'E');
    assert.equal(inferGiftLetterKey({}), 'G');
    assert.ok(GIFT_LETTER_KEYS.includes('Ñ'));
});

test('letterKey explícito prevalece, se normaliza y se conserva al crear/serializar', () => {
    assert.equal(normalizeGiftLetterKey('r'), 'R');
    assert.equal(normalizeGiftLetterKey('RR'), '');
    assert.equal(normalizeGiftLetterKey('7'), '');
    assert.throws(() => createGift('GFT-LOCAL-003', { name: 'Invalid', letterKey: 'RR' }), /invalid-gift-letter-key/);
    const gift = createGift('GFT-LOCAL-001', { name: 'Liverpool', letterKey: 'r' });
    assert.equal(gift.letterKey, 'R');
    assert.equal(inferGiftLetterKey(gift), 'R');
});

test('selector de letras actualiza sólo el item seleccionado', () => {
    const dom = new JSDOM('<main><div id="editor"></div></main>');
    globalThis.document = dom.window.document;
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Letters', fecha: '2028-01-01', paquete: 'Prestige' });
    state.addGift({ name: 'Liverpool', url: 'https://example.com/l' });
    state.addGift({ name: 'Apple', url: 'https://example.com/a' });
    const stop = initGiftEditor({ container: dom.window.document.querySelector('#editor'), state });
    const cards = dom.window.document.querySelectorAll('[data-entity-id]');
    cards[1].querySelector('[data-entity-icon-value="R"]')?.click();
    assert.equal(state.getSnapshot().draft.gifts[0].letterKey, undefined);
    assert.equal(state.getSnapshot().draft.gifts[1].letterKey, 'R');
    stop();
    delete globalThis.document;
    dom.window.close();
});

test('Aloha renderiza letra explícita y fallback legacy por card', () => {
    const dom = new JSDOM('<main><section data-prestige-feature="gift-registry"><div></div></section></main>');
    applyAlohaPhase3Bindings(dom.window.document, { content: { gifts: {} }, gifts: [
        { id: 'GFT-LOCAL-001', name: 'Liverpool', letterKey: 'R', url: 'https://example.com/l' },
        { id: 'GFT-LOCAL-002', name: 'Amazon', url: 'https://example.com/a' }
    ] });
    assert.deepEqual([...dom.window.document.querySelectorAll('.gift-registry-monogram')].map((node) => node.textContent), ['R', 'A']);
    assert.equal(dom.window.document.querySelectorAll('.gift-registry-card').length, 2);
    dom.window.close();
});
