import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLink } from '../admin/invitations/core/logistics-schema.js';
import { inferLinkIconKey, normalizeLinkIconKey } from '../admin/invitations/core/link-icon-registry.js';
import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { initLinksEditor } from '../admin/invitations/editors/links-editor.js';
import { applyAlohaPhase3Bindings } from '../admin/invitations/core/aloha-template-bindings.js';

test('links legacy usan fallback y iconKey explícito prevalece', () => {
    assert.equal(inferLinkIconKey({ type: 'calendar' }), 'calendar');
    assert.equal(inferLinkIconKey({ type: 'whatsapp' }), 'whatsapp');
    assert.equal(inferLinkIconKey({ type: 'custom', iconKey: 'instagram' }), 'instagram');
    assert.equal(normalizeLinkIconKey('bad-icon'), '');
    assert.throws(() => createLink('LNK-LOCAL-001', { type: 'custom', iconKey: 'bad-icon' }), /invalid-link-icon-key/);
    assert.equal(createLink('LNK-LOCAL-002', { type: 'custom', iconKey: 'none' }).iconKey, 'none');
});

test('picker de acciones actualiza únicamente el enlace elegido', () => {
    const dom = new JSDOM('<main><div id="editor"></div></main>');
    globalThis.document = dom.window.document;
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Actions', fecha: '2028-01-01', paquete: 'Prestige' });
    state.addLink({ type: 'calendar', label: 'Fecha' });
    state.addLink({ type: 'whatsapp', label: 'WhatsApp', phone: '5215555555555' });
    const stop = initLinksEditor({ container: dom.window.document.querySelector('#editor'), state });
    const cards = dom.window.document.querySelectorAll('[data-entity-id]');
    cards[1].querySelector('[data-entity-icon-value="instagram"]')?.click();
    assert.equal(state.getSnapshot().draft.links[0].iconKey, undefined);
    assert.equal(state.getSnapshot().draft.links[1].iconKey, 'instagram');
    stop(); delete globalThis.document; dom.window.close();
});

test('Aloha renderiza acciones dinámicas con iconos y none sin hueco', () => {
    const dom = new JSDOM('<main><section data-prestige-feature="gift-registry"><div></div></section><section class="social-strip"><div class="aloha-actions-copy"><p>Color</p><strong>#ALOHA</strong></div></section></main>');
    applyAlohaPhase3Bindings(dom.window.document, { content: { gifts: {} }, gifts: [], links: [
        { id: 'LNK-LOCAL-001', type: 'calendar', label: 'Fecha' },
        { id: 'LNK-LOCAL-002', type: 'instagram', label: 'Fotos', url: 'https://instagram.com/example', iconKey: 'none' },
        { id: 'LNK-LOCAL-003', type: 'custom', label: 'Sitio', url: 'https://example.com', iconKey: 'website' }
    ], locations: [] });
    const social = dom.window.document.querySelector('.social-strip');
    assert.equal(social.querySelectorAll('.aloha-action-card').length, 3);
    assert.equal(social.querySelector('[data-builder-action="calendar"]')?.tagName, 'BUTTON');
    assert.equal(social.querySelector('[data-builder-action="calendar"]')?.hasAttribute('href'), false);
    assert.equal(social.querySelectorAll('.aloha-action-svg').length, 2);
    assert.equal(social.querySelectorAll('.aloha-action-label')[1].textContent, 'Fotos');
    assert.ok(social.querySelector('.aloha-action-card.is-no-icon'));
    assert.deepEqual([...social.children].map((child) => child.className), [
        'aloha-actions-heading',
        'aloha-actions-grid',
        'aloha-actions-copy'
    ]);
    assert.equal(social.querySelectorAll('.aloha-actions-copy').length, 1);
    assert.equal(social.querySelector('[data-builder-action="calendar"]')?.getAttribute('data-builder-action'), 'calendar');
    assert.equal(social.querySelector('a[href="https://instagram.com/example"]')?.getAttribute('href'), 'https://instagram.com/example');
    dom.window.close();
});
