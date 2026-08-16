import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { applyPreviewSectionVisibility } from '../admin/invitations/core/preview-sections.js';
import { SECTION_REGISTRY, isSectionAllowed } from '../admin/invitations/core/section-registry.js';
import {
    applyPhase3ContentBindings,
    applyTemplateContentBindings,
    createTemplateSectionContract
} from '../admin/invitations/core/template-binding-registry.js';
import { COLLECTION_THEMES } from '../admin/invitations/core/theme-registry.js';
import { PREVIEW_MESSAGE_TYPES } from '../admin/invitations/core/builder-events.js';
import { initGiftEditor } from '../admin/invitations/editors/gift-editor.js';
import { initPreviewController } from '../admin/invitations/modules/preview-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createGiftState(themeId = 'champagne', gifts = []) {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', {
        nombreEvento: 'Evento Gift Hotfix',
        fecha: '2028-11-11',
        paquete: 'Prestige'
    });
    state.setTheme(themeId);
    state.toggleSection('gift-registry', true);
    gifts.forEach((gift) => state.addGift(gift));
    return state;
}

function configuredGifts() {
    return [
        {
            type: 'store',
            name: 'Mesa Eventora',
            description: 'Nuestra mesa de regalos',
            url: 'https://example.com/'
        },
        {
            type: 'transfer',
            name: 'Transferencia',
            description: 'Opción ficticia',
            details: { bank: 'Banco ficticio', beneficiary: 'Beneficiario ficticio' }
        }
    ];
}

function effectiveSections(draft) {
    return draft.enabledSections.filter((sectionId) => isSectionAllowed(sectionId, draft.packageId));
}

function applyVisibility(documentRoot, themeId, enabledSections) {
    const contract = createTemplateSectionContract(themeId, SECTION_REGISTRY);
    return applyPreviewSectionVisibility(documentRoot, contract.sections, enabledSections, {
        groups: contract.groups
    });
}

function isEffectivelyHidden(element) {
    for (let current = element; current; current = current.parentElement) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') return true;
        if (current.dataset?.builderSectionVisibility === 'hidden') return true;
        if (current.dataset?.builderPhase3Demo === 'hidden') return true;
    }
    return false;
}

async function renderCollection(theme, draft) {
    const html = await readFile(path.join(ROOT, theme.templatePath.replace(/^\//, '')), 'utf8');
    const dom = new JSDOM(html);
    dom.window.document.querySelectorAll('script, audio, #event-music, #music-control, #opening').forEach((node) => node.remove());
    const invitation = dom.window.document.getElementById('invitation');
    invitation?.removeAttribute('inert');
    invitation?.setAttribute('aria-hidden', 'false');
    applyTemplateContentBindings(dom.window.document, theme.id, draft);
    applyVisibility(dom.window.document, theme.id, effectiveSections(draft));
    return dom;
}

test('las 11 colecciones renderizan gifts reales visibles sin depender de copy tocado', async () => {
    const state = createGiftState('champagne', configuredGifts());
    const draft = state.getSnapshot().draft;

    for (const theme of COLLECTION_THEMES) {
        const dom = await renderCollection(theme, draft);
        try {
            const section = dom.window.document.querySelector('[data-builder-phase3-section="gift-registry"]');
            assert.ok(section, `${theme.id}: falta renderer compartido`);
            assert.equal(isEffectivelyHidden(section), false, `${theme.id}: gifts existe pero no es visible`);
            assert.equal(section.querySelectorAll('[data-entity-id]').length, 2, `${theme.id}: no mostró ambos gifts`);
            assert.match(section.textContent, /Mesa Eventora/);
            assert.match(section.textContent, /Banco ficticio/);
        } finally {
            dom.window.close();
        }
    }
});

test('un gift, múltiples gifts, tienda, transferencia y URL inválida conservan la sección', async () => {
    const state = createGiftState('champagne', [configuredGifts()[0]]);
    let draft = state.getSnapshot().draft;
    let dom = await renderCollection(COLLECTION_THEMES.find(({ id }) => id === 'champagne'), draft);
    try {
        let section = dom.window.document.querySelector('[data-builder-phase3-section="gift-registry"]');
        assert.equal(section.querySelectorAll('[data-entity-id]').length, 1);
        const storeAction = section.querySelector('[data-builder-action="gifts"]');
        assert.equal(storeAction?.tagName, 'A');
        assert.equal(storeAction?.getAttribute('href'), 'https://example.com/');
    } finally {
        dom.window.close();
    }

    state.addGift(configuredGifts()[1]);
    state.addGift({ type: 'other', name: 'Información adicional', url: 'javascript:alert(1)' });
    draft = state.getSnapshot().draft;
    dom = await renderCollection(COLLECTION_THEMES.find(({ id }) => id === 'champagne'), draft);
    try {
        const section = dom.window.document.querySelector('[data-builder-phase3-section="gift-registry"]');
        assert.equal(section.querySelectorAll('[data-entity-id]').length, 3);
        assert.match(section.textContent, /Transferencia/);
        assert.match(section.textContent, /Beneficiario ficticio/);
        const invalidAction = section.querySelector('[data-builder-invalid-url="true"]');
        assert.equal(invalidAction?.tagName, 'BUTTON');
        assert.equal(invalidAction?.disabled, true);
        assert.equal(isEffectivelyHidden(section), false);
    } finally {
        dom.window.close();
    }
});

test('toggle OFF/ON y downgrade/upgrade ocultan sin borrar draft.gifts', async () => {
    const theme = COLLECTION_THEMES.find(({ id }) => id === 'champagne');
    const state = createGiftState(theme.id, configuredGifts());
    const original = state.getSnapshot().draft.gifts;
    const dom = await renderCollection(theme, state.getSnapshot().draft);
    try {
        const section = dom.window.document.querySelector('[data-builder-phase3-section="gift-registry"]');
        assert.equal(isEffectivelyHidden(section), false);
        state.toggleSection('gift-registry', false);
        applyVisibility(dom.window.document, theme.id, effectiveSections(state.getSnapshot().draft));
        assert.equal(isEffectivelyHidden(section), true);
        state.toggleSection('gift-registry', true);
        applyVisibility(dom.window.document, theme.id, effectiveSections(state.getSnapshot().draft));
        assert.equal(isEffectivelyHidden(section), false);
        assert.deepEqual(state.getSnapshot().draft.gifts, original);

        state.setPackage('esencial');
        applyVisibility(dom.window.document, theme.id, effectiveSections(state.getSnapshot().draft));
        assert.equal(isEffectivelyHidden(section), true);
        assert.deepEqual(state.getSnapshot().draft.gifts, original);
        state.setPackage('prestige');
        applyVisibility(dom.window.document, theme.id, effectiveSections(state.getSnapshot().draft));
        assert.equal(isEffectivelyHidden(section), false);
        assert.deepEqual(state.getSnapshot().draft.gifts, original);
    } finally {
        dom.window.close();
    }
});

test('Personalizada usa el mismo renderer y no mezcla fallback demo', () => {
    const state = createGiftState('custom', configuredGifts());
    const draft = state.getSnapshot().draft;
    const dom = new JSDOM('<main><section data-prestige-feature="gift-registry"></section></main>');
    try {
        applyPhase3ContentBindings(dom.window.document, 'custom', draft);
        applyVisibility(dom.window.document, 'custom', effectiveSections(draft));
        const section = dom.window.document.querySelector('[data-builder-phase3-section="gift-registry"]');
        assert.ok(section);
        assert.equal(isEffectivelyHidden(section), false);
        assert.equal(section.querySelectorAll('[data-entity-id]').length, 2);
        assert.doesNotMatch(section.textContent, /opción elegida por los anfitriones/i);
    } finally {
        dom.window.close();
    }
});

test('el renderer compartido normaliza un marcador gift-registry que sea un enlace demo', () => {
    const state = createGiftState('custom', configuredGifts());
    const draft = state.getSnapshot().draft;
    const dom = new JSDOM(`
        <main>
            <section class="theme-services">
                <a data-demo-action="gifts" data-prestige-feature="gift-registry">Mesa demo</a>
            </section>
        </main>
    `);
    try {
        applyPhase3ContentBindings(dom.window.document, 'custom', draft);
        applyVisibility(dom.window.document, 'custom', effectiveSections(draft));
        const section = dom.window.document.querySelector('[data-builder-phase3-section="gift-registry"]');
        assert.ok(section);
        assert.equal(section.parentElement.tagName, 'SECTION');
        assert.equal(isEffectivelyHidden(section), false);
        assert.equal(section.querySelectorAll('[data-entity-id]').length, 2);
    } finally {
        dom.window.close();
    }
});

test('Builder Template Mode crea un fallback mínimo si el tema no aporta markup de gifts', () => {
    const state = createGiftState('custom', configuredGifts());
    const draft = state.getSnapshot().draft;
    const dom = new JSDOM('<main><section data-prestige-feature="rsvp"></section></main>');
    try {
        applyPhase3ContentBindings(dom.window.document, 'custom', draft);
        applyVisibility(dom.window.document, 'custom', effectiveSections(draft));
        const root = dom.window.document.querySelector('.builder-generated-gift-registry');
        assert.ok(root);
        assert.equal(root.nextElementSibling?.dataset.prestigeFeature, 'rsvp');
        assert.equal(root.querySelectorAll('[data-entity-id]').length, 2);
        assert.equal(isEffectivelyHidden(root), false);
    } finally {
        dom.window.close();
    }
});

test('el contrato canónico mantiene gift-registry y draft.gifts con el schema real', () => {
    const state = createGiftState('champagne', [configuredGifts()[0]]);
    const draft = state.getSnapshot().draft;
    assert.ok(SECTION_REGISTRY.some(({ id }) => id === 'gift-registry'));
    assert.ok(draft.enabledSections.includes('gift-registry'));
    assert.deepEqual(draft.gifts[0], {
        id: 'GFT-LOCAL-001',
        type: 'store',
        name: 'Mesa Eventora',
        url: 'https://example.com/',
        reference: '',
        description: 'Nuestra mesa de regalos',
        details: { bank: '', beneficiary: '', account: '', clabe: '', concept: '', instructions: '' }
    });
});

test('draft.gifts y enabledSections llegan completos al payload UPDATE del iframe', { concurrency: false }, async () => {
    const dom = new JSDOM(`
        <div id="stage"><iframe id="frame" src="about:blank"></iframe></div>
        <div id="controls"><button data-preview-device="mobile"></button></div>
        <span id="status"></span><span id="dimension"></span>
    `, { url: 'https://eventora.test/admin/invitations/builder.html', pretendToBeVisual: true });
    const previous = { window: globalThis.window, document: globalThis.document };
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    try {
        const frame = document.getElementById('frame');
        const messages = [];
        frame.contentWindow.postMessage = (message, origin) => {
            messages.push(message);
            if (message.type !== PREVIEW_MESSAGE_TYPES.RENDER) return;
            window.dispatchEvent(new dom.window.MessageEvent('message', {
                origin,
                source: frame.contentWindow,
                data: {
                    type: PREVIEW_MESSAGE_TYPES.RENDERED,
                    requestId: message.requestId,
                    payload: { themeId: message.payload.theme.id, themeName: message.payload.theme.name }
                }
            }));
        };
        const state = createGiftState('champagne');
        const cleanup = initPreviewController({
            frame,
            controls: document.getElementById('controls'),
            status: document.getElementById('status'),
            dimension: document.getElementById('dimension'),
            stage: document.getElementById('stage'),
            state,
            eventBus: { emit() {} },
            eventTypes: {},
            updateDebounceMs: 0
        });
        frame.dispatchEvent(new dom.window.Event('load'));
        state.addGift(configuredGifts()[0]);
        await new Promise((resolve) => window.setTimeout(resolve, 10));
        const update = messages.filter(({ type }) => type === PREVIEW_MESSAGE_TYPES.UPDATE).at(-1);
        assert.ok(update);
        assert.ok(update.payload.enabledSections.includes('gift-registry'));
        assert.deepEqual(update.payload.draft.gifts, state.getSnapshot().draft.gifts);
        assert.deepEqual(update.payload.draft.content.gifts, state.getSnapshot().draft.content.gifts);
        cleanup();
    } finally {
        globalThis.window = previous.window;
        globalThis.document = previous.document;
        dom.window.close();
    }
});

test('agregar, editar y borrar gift conserva builder-editor y root scrollTop', { concurrency: false }, () => {
    const dom = new JSDOM(`
        <div id="invitation-builder-root">
            <div id="builder-editor"><div id="target"></div></div>
        </div>
    `, { pretendToBeVisual: true });
    const previous = { window: globalThis.window, document: globalThis.document };
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    try {
        const state = createGiftState('champagne');
        const scroller = document.getElementById('builder-editor');
        const root = document.getElementById('invitation-builder-root');
        scroller.scrollTop = 540;
        const cleanup = initGiftEditor({ container: document.getElementById('target'), state });
        document.querySelector('[data-entity-action="add"]').click();
        assert.equal(scroller.scrollTop, 540);
        assert.equal(root.scrollTop, 0);
        const name = document.querySelector('[data-entity-field="name"]');
        name.value = 'Mesa Eventora';
        name.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.equal(scroller.scrollTop, 540);
        document.querySelector('[data-entity-action="delete"]').click();
        document.querySelector('[data-entity-action="confirm-delete"]').click();
        assert.equal(scroller.scrollTop, 540);
        assert.equal(root.scrollTop, 0);
        assert.equal(state.getSnapshot().draft.gifts.length, 0);
        cleanup();
    } finally {
        globalThis.window = previous.window;
        globalThis.document = previous.document;
        dom.window.close();
    }
});

test('el frame conserva intercepción de gifts y el CSS móvil evita overflow horizontal', async () => {
    const [frame, css] = await Promise.all([
        readFile(path.join(ROOT, 'admin/invitations/preview/frame.js'), 'utf8'),
        readFile(path.join(ROOT, 'admin/invitations/preview/frame.css'), 'utf8')
    ]);
    assert.match(frame, /gifts:\s*'Este botón abrirá la opción de regalo/);
    assert.match(frame, /function interceptNavigation/);
    assert.doesNotMatch(frame, /window\.(?:open|location\.assign|location\.replace)/);
    assert.match(css, /html, body \{[^}]*overflow-x: clip;/s);
    assert.match(css, /@media \(max-width: 480px\)/);
    assert.match(css, /\.builder-phase3-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test('el cache-buster Fase 5.1 alcanza iframe, frame y registry sin perder el renderer hotfix', async () => {
    const [builderHtml, frameHtml, frame, registry] = await Promise.all([
        readFile(path.join(ROOT, 'admin/invitations/builder.html'), 'utf8'),
        readFile(path.join(ROOT, 'admin/invitations/preview/frame.html'), 'utf8'),
        readFile(path.join(ROOT, 'admin/invitations/preview/frame.js'), 'utf8'),
        readFile(path.join(ROOT, 'admin/invitations/core/template-binding-registry.js'), 'utf8')
    ]);
    const version = 'phase51-rsvp-20260816';
    assert.match(builderHtml, new RegExp(`preview/frame\\.html\\?v=${version}`));
    assert.match(frameHtml, new RegExp(`frame\\.js\\?v=${version}`));
    assert.match(frame, new RegExp(`template-binding-registry\\.js\\?v=${version}`));
    assert.match(registry, /phase3-template-bindings\.js\?v=phase3-gifts-hotfix-20260813/);
});
