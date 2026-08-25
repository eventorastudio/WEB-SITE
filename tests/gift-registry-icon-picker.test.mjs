import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGift } from '../admin/invitations/core/logistics-schema.js';
import { GIFT_ICON_KEYS, inferGiftIconKey, normalizeGiftIconKey } from '../admin/invitations/core/gift-icon-registry.js';
import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { initGiftEditor } from '../admin/invitations/editors/gift-editor.js';
import { applyAlohaPhase3Bindings } from '../admin/invitations/core/aloha-template-bindings.js';

test('registry de regalos infiere legacy, conserva iconKey y rechaza claves desconocidas', () => {
    assert.equal(inferGiftIconKey({ name: 'Liverpool' }), 'liverpool');
    assert.equal(inferGiftIconKey({ type: 'cash' }), 'cash');
    assert.equal(normalizeGiftIconKey('not-real'), 'gift');
    assert.ok(GIFT_ICON_KEYS.includes('macstore'));
    assert.ok(GIFT_ICON_KEYS.includes('none'));
    assert.equal(createGift('GFT-LOCAL-001', { name: 'Amazon', url: 'https://example.com' }).iconKey, undefined);
    assert.equal(createGift('GFT-LOCAL-002', { name: 'Amazon', iconKey: 'amazon' }).iconKey, 'amazon');
});

test('selector compacto actualiza iconKey por regalo sin afectar otros campos', () => {
    const dom = new JSDOM('<main><div id="editor"></div></main>');
    globalThis.document = dom.window.document;
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Icons', fecha: '2028-01-01', paquete: 'Prestige' });
    state.addGift({ name: 'Liverpool', url: 'https://example.com' });
    const stop = initGiftEditor({ container: dom.window.document.querySelector('#editor'), state });
    const option = dom.window.document.querySelector('[data-entity-icon-value="amazon"]');
    assert.ok(option);
    option.click();
    assert.equal(state.getSnapshot().draft.gifts[0].iconKey, 'amazon');
    stop();
    delete globalThis.document;
    dom.window.close();
});

test('Aloha renderiza icono elegido y no deja hueco cuando es none', () => {
    const dom = new JSDOM('<main><section data-prestige-feature="gift-registry"><div></div></section></main>');
    applyAlohaPhase3Bindings(dom.window.document, { content: { gifts: {} }, gifts: [
        { id: 'GFT-LOCAL-001', name: 'Amazon', iconKey: 'amazon', url: 'https://example.com/a' },
        { id: 'GFT-LOCAL-002', name: 'Sin icono', iconKey: 'none', url: 'https://example.com/b' }
    ] });
    assert.equal(dom.window.document.querySelectorAll('.gift-registry-svg').length, 1);
    assert.equal(dom.window.document.querySelectorAll('.gift-registry-card-separator').length, 1);
    assert.equal(dom.window.document.querySelectorAll('.gift-registry-card').length, 2);
    dom.window.close();
});
