import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { eventBus } from '../admin/core/event-bus.js';
import { EVENT_TYPES } from '../admin/core/event-types.js';
import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { applyPreviewSectionVisibility } from '../admin/invitations/core/preview-sections.js';
import {
    PACKAGE_REGISTRY,
    SECTION_REGISTRY,
    getSectionsForPackage
} from '../admin/invitations/core/section-registry.js';
import { COLLECTION_THEMES, THEME_REGISTRY } from '../admin/invitations/core/theme-registry.js';
import { initIdentityEditor } from '../admin/invitations/editors/identity-editor.js';
import { initSectionCopyEditors } from '../admin/invitations/editors/section-copy-editor.js';
import { initPreviewController } from '../admin/invitations/modules/preview-controller.js';
import { initSectionSelector } from '../admin/invitations/modules/section-selector.js';
import { initBuilderEventBridge } from '../admin/invitations/modules/state-event-bridge.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RENDER_MESSAGE = 'EVENTORA_INVITATION_PREVIEW_RENDER';
const UPDATE_MESSAGE = 'EVENTORA_INVITATION_PREVIEW_UPDATE';
const RENDERED_MESSAGE = 'EVENTORA_INVITATION_PREVIEW_RENDERED';

function createHarness({ packageId = 'prestige', failingListener = null, viewport = { width: 1440, height: 900 } } = {}) {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="invitation-builder-root" data-builder-root>
            <main id="builder-workspace">
                <aside data-builder-region="sidebar"></aside>
                <section data-builder-region="editor">
                    <p id="summary"></p>
                    <div id="sections"></div>
                    <form id="general-information-editor"></form>
                    <div id="section-content-editors"></div>
                </section>
                <aside data-builder-region="preview">
                    <div id="stage"></div>
                    <span id="status"></span>
                    <div id="controls">
                        <button data-preview-device="mobile"></button>
                        <button data-preview-device="tablet"></button>
                        <button data-preview-device="desktop"></button>
                    </div>
                    <iframe id="frame"></iframe>
                </aside>
            </main>
        </div>
    </body></html>`, { url: 'http://127.0.0.1:4173/admin/invitations/builder.html' });

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, writable: true, value: viewport.width });
    Object.defineProperty(dom.window, 'innerHeight', { configurable: true, writable: true, value: viewport.height });
    const pendingAnimationFrames = new Set();
    let animationFrameId = 0;
    dom.window.requestAnimationFrame = (callback) => {
        const id = ++animationFrameId;
        pendingAnimationFrames.add(id);
        queueMicrotask(() => {
            if (!pendingAnimationFrames.delete(id)) return;
            callback(Date.now());
        });
        return id;
    };
    dom.window.cancelAnimationFrame = (id) => pendingAnimationFrames.delete(id);

    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', {
        nombreEvento: 'María & Fernando',
        fecha: '2027-11-15',
        paquete: packageId
    });

    const stateErrors = [];
    const selectorErrors = [];
    const previewErrors = [];
    const messages = [];
    const busEvents = [];
    const cleanups = [];
    cleanups.push(state.subscribeToErrors((incident) => stateErrors.push(incident)));
    if (failingListener) cleanups.push(state.subscribe(failingListener, { source: 'test-failing-listener' }));

    const frame = document.getElementById('frame');
    frame.contentWindow.postMessage = (message, origin) => {
        messages.push({ message, origin });
        if (message.type === RENDER_MESSAGE) {
            window.dispatchEvent(new window.MessageEvent('message', {
                data: {
                    type: RENDERED_MESSAGE,
                    requestId: message.requestId,
                    payload: { themeId: message.payload.theme.id, themeName: message.payload.theme.name }
                },
                origin,
                source: frame.contentWindow
            }));
        }
    };

    cleanups.push(initSectionSelector({
        container: document.getElementById('sections'),
        summary: document.getElementById('summary'),
        state,
        ui: { showToast() {} },
        onError: (error, context) => selectorErrors.push({ error, context })
    }));
    cleanups.push(initIdentityEditor({
        container: document.getElementById('general-information-editor'),
        state
    }));
    cleanups.push(initSectionCopyEditors({
        container: document.getElementById('section-content-editors'),
        state
    }));
    cleanups.push(initPreviewController({
        frame,
        controls: document.getElementById('controls'),
        status: document.getElementById('status'),
        dimension: null,
        stage: document.getElementById('stage'),
        state,
        eventBus,
        eventTypes: EVENT_TYPES,
        onError: (error, context) => previewErrors.push({ error, context }),
        updateDebounceMs: 0
    }));

    [EVENT_TYPES.BUILDER_DRAFT_UPDATED, EVENT_TYPES.BUILDER_THEME_CHANGED, EVENT_TYPES.BUILDER_SECTIONS_CHANGED]
        .forEach((type) => cleanups.push(eventBus.on(type, (payload) => busEvents.push({ type, payload }))));
    cleanups.push(initBuilderEventBridge({ state, eventBus, eventTypes: EVENT_TYPES }));

    const close = () => {
        cleanups.reverse().forEach((cleanup) => cleanup?.());
        pendingAnimationFrames.clear();
        eventBus.clear();
        dom.window.close();
        delete globalThis.window;
        delete globalThis.document;
    };

    return {
        dom,
        state,
        messages,
        busEvents,
        stateErrors,
        selectorErrors,
        previewErrors,
        root: document.getElementById('invitation-builder-root'),
        close
    };
}

const flushSectionRender = async () => {
    await new Promise((resolve) => queueMicrotask(resolve));
    await new Promise((resolve) => setTimeout(resolve, 5));
};

function sectionInput(sectionId) {
    return document.querySelector(`#sections input[data-section-id="${sectionId}"]`);
}

function latestRenderMessage(messages) {
    return messages.filter(({ message }) => [RENDER_MESSAGE, UPDATE_MESSAGE].includes(message.type)).at(-1)?.message;
}

test('los editores aparecen solo para secciones activas y restauran el mismo contenido al reactivar', { concurrency: false }, async () => {
    const harness = createHarness({ packageId: 'prestige' });
    try {
        assert.equal(document.querySelectorAll('[data-section-editor]').length, 0);
        sectionInput('welcome-story').parentElement.click();
        await flushSectionRender();

        const editor = document.querySelector('[data-section-editor="welcome-story"]');
        assert.ok(editor);
        const story = editor.querySelector('[data-draft-path="content.welcome.story"]');
        story.value = 'Una historia conservada entre colecciones.';
        story.dispatchEvent(new harness.dom.window.Event('input', { bubbles: true }));
        assert.equal(harness.state.getSnapshot().draft.content.welcome.story, story.value);

        sectionInput('welcome-story').parentElement.click();
        await flushSectionRender();
        assert.equal(document.querySelector('[data-section-editor="welcome-story"]'), null);
        assert.equal(harness.state.getSnapshot().draft.content.welcome.story, story.value);

        sectionInput('welcome-story').parentElement.click();
        await flushSectionRender();
        assert.equal(
            document.querySelector('[data-section-editor="welcome-story"] [data-draft-path="content.welcome.story"]').value,
            story.value
        );
    } finally {
        harness.close();
    }
});

test('la escritura agrupa UPDATE y no vuelve a enviar RENDER para la misma plantilla', { concurrency: false }, async () => {
    const harness = createHarness({ packageId: 'prestige' });
    try {
        harness.state.setTheme('champagne');
        const initialRenderCount = harness.messages.filter(({ message }) => message.type === RENDER_MESSAGE).length;
        harness.state.updateDraftField('content.identity.primaryName', 'María');
        harness.state.updateDraftField('content.identity.secondaryName', 'Fernando');
        await flushSectionRender();

        assert.equal(harness.messages.filter(({ message }) => message.type === RENDER_MESSAGE).length, initialRenderCount);
        const updates = harness.messages.filter(({ message }) => message.type === UPDATE_MESSAGE);
        assert.equal(updates.length, 1);
        assert.equal(updates[0].message.payload.draft.content.identity.primaryName, 'María');
        assert.equal(updates[0].message.payload.draft.content.identity.secondaryName, 'Fernando');
    } finally {
        harness.close();
    }
});

test('el change de una sección termina antes de reemplazar su checkbox y mantiene visible el Builder', { concurrency: false }, async () => {
    const harness = createHarness({ packageId: 'premium' });
    try {
        harness.state.setTheme('champagne');
        const inputDuringChange = sectionInput('gallery');
        const labelDuringChange = inputDuringChange.parentElement;

        labelDuringChange.click();

        assert.equal(inputDuringChange.isConnected, true, 'el target no debe destruirse dentro de su propio evento change');
        assert.equal(labelDuringChange.isConnected, true);
        assert.equal(document.getElementById('builder-workspace').isConnected, true);
        assert.deepEqual(harness.state.getSnapshot().draft.enabledSections, ['gallery']);

        await flushSectionRender();
        assert.equal(inputDuringChange.isConnected, false);
        assert.equal(sectionInput('gallery').checked, true);
        assert.equal(document.querySelectorAll('#sections .section-option').length, SECTION_REGISTRY.length);
        assert.ok(latestRenderMessage(harness.messages).payload.enabledSections.includes('gallery'));
    } finally {
        harness.close();
    }
});

test('criterio desktop: Champagne → Gallery → Countdown → quitar Gallery → Luxury conserva shell y preview', { concurrency: false }, async () => {
    const harness = createHarness({ packageId: 'premium', viewport: { width: 1366, height: 768 } });
    try {
        const rootBefore = harness.root;
        harness.state.setTheme('champagne');

        sectionInput('gallery').parentElement.click();
        await flushSectionRender();
        assert.strictEqual(document.getElementById('invitation-builder-root'), rootBefore);
        assert.ok(harness.state.getSnapshot().draft.enabledSections.includes('gallery'));

        sectionInput('countdown').parentElement.click();
        await flushSectionRender();
        assert.strictEqual(document.getElementById('invitation-builder-root'), rootBefore);
        assert.ok(harness.state.getSnapshot().draft.enabledSections.includes('countdown'));

        sectionInput('gallery').parentElement.click();
        await flushSectionRender();
        assert.strictEqual(document.getElementById('invitation-builder-root'), rootBefore);
        assert.equal(harness.state.getSnapshot().draft.enabledSections.includes('gallery'), false);

        harness.state.setTheme('luxury');
        const preview = latestRenderMessage(harness.messages);
        assert.equal(preview.payload.theme.id, 'luxury');
        assert.deepEqual(preview.payload.enabledSections, ['countdown']);
        assert.strictEqual(document.getElementById('invitation-builder-root'), rootBefore);
        assert.equal(document.querySelector('[data-builder-region="sidebar"]').isConnected, true);
        assert.equal(document.querySelector('[data-builder-region="editor"]').isConnected, true);
        assert.equal(document.querySelector('[data-builder-region="preview"]').isConnected, true);
        assert.deepEqual(harness.previewErrors, []);
    } finally {
        harness.close();
    }
});

test('información básica y controles mobile/tablet/desktop siguen operando tras el fix', { concurrency: false }, () => {
    const harness = createHarness({ packageId: 'premium' });
    try {
        harness.state.setTheme('custom');
        const title = document.querySelector('[data-draft-path="content.identity.primaryName"]');
        title.value = 'Nuevo título';
        title.dispatchEvent(new harness.dom.window.Event('input', { bubbles: true }));
        assert.equal(harness.state.getSnapshot().draft.content.identity.primaryName, 'Nuevo título');

        for (const device of ['mobile', 'tablet', 'desktop']) {
            document.querySelector(`[data-preview-device="${device}"]`).click();
            assert.equal(harness.state.getSnapshot().ui.previewDevice, device);
            assert.equal(document.getElementById('stage').dataset.device, device);
        }
        assert.equal(latestRenderMessage(harness.messages).payload.theme.id, 'custom');
        assert.equal(document.getElementById('builder-workspace').isConnected, true);
    } finally {
        harness.close();
    }
});

test('un fallo de postMessage queda contenido en Preview y no sustituye el shell', { concurrency: false }, () => {
    const harness = createHarness({ packageId: 'premium' });
    const rootBefore = harness.root;
    const originalError = console.error;
    try {
        console.error = () => {};
        document.getElementById('frame').contentWindow.postMessage = () => {
            throw new DOMException('test/preview-post-failure', 'DataCloneError');
        };
        harness.state.setTheme('champagne');

        assert.equal(harness.previewErrors.length, 1);
        assert.equal(harness.previewErrors[0].context.source, 'preview-controller');
        assert.equal(document.getElementById('status').textContent, 'No pudimos actualizar la vista previa.');
        assert.equal(document.getElementById('status').dataset.state, 'error');
        assert.strictEqual(document.getElementById('invitation-builder-root'), rootBefore);
        assert.equal(document.querySelector('[data-builder-region="editor"]').isConnected, true);
    } finally {
        console.error = originalError;
        harness.close();
    }
});

test('selector → state → eventos → render y preview funciona para cada sección permitida de cada paquete', { concurrency: false }, async () => {
    for (const packageDefinition of PACKAGE_REGISTRY) {
        const harness = createHarness({ packageId: packageDefinition.id });
        try {
            harness.state.setTheme('champagne');
            const availability = getSectionsForPackage(packageDefinition.id);

            for (const section of availability) {
                let input = sectionInput(section.id);
                assert.ok(input, `${packageDefinition.id}/${section.id} debe tener checkbox`);
                assert.equal(input.disabled, !section.allowed);

                if (!section.allowed) {
                    input.parentElement.click();
                    await flushSectionRender();
                    assert.equal(harness.state.getSnapshot().draft.enabledSections.includes(section.id), false);
                    continue;
                }

                const eventCount = harness.busEvents.filter(({ type }) => type === EVENT_TYPES.BUILDER_SECTIONS_CHANGED).length;
                input.parentElement.click();
                await flushSectionRender();

                let snapshot = harness.state.getSnapshot();
                assert.ok(Array.isArray(snapshot.draft.enabledSections));
                assert.ok(snapshot.draft.enabledSections.every((id) => typeof id === 'string'));
                assert.equal(new Set(snapshot.draft.enabledSections).size, snapshot.draft.enabledSections.length);
                assert.ok(snapshot.draft.enabledSections.includes(section.id));
                assert.equal(document.getElementById('builder-workspace').isConnected, true);
                assert.equal(document.querySelectorAll('#sections .section-option').length, SECTION_REGISTRY.length);
                assert.equal(sectionInput(section.id).checked, true);
                assert.deepEqual(latestRenderMessage(harness.messages).payload.enabledSections, snapshot.draft.enabledSections);
                assert.equal(
                    harness.busEvents.filter(({ type }) => type === EVENT_TYPES.BUILDER_SECTIONS_CHANGED).length,
                    eventCount + 1,
                    `${packageDefinition.id}/${section.id} debe emitir exactamente un evento al activar`
                );

                input = sectionInput(section.id);
                input.parentElement.click();
                await flushSectionRender();
                snapshot = harness.state.getSnapshot();
                assert.equal(snapshot.draft.enabledSections.includes(section.id), false);
                assert.equal(sectionInput(section.id).checked, false);
                assert.deepEqual(latestRenderMessage(harness.messages).payload.enabledSections, snapshot.draft.enabledSections);
            }

            assert.deepEqual(harness.stateErrors, []);
            assert.deepEqual(harness.selectorErrors, []);
        } finally {
            harness.close();
        }
    }
});

test('1366×768, 1440×900 y 1920×1080 conservan el mismo root al alternar todas las secciones', { concurrency: false }, async () => {
    const viewports = [
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
        { width: 1920, height: 1080 }
    ];

    for (const viewport of viewports) {
        for (const packageDefinition of PACKAGE_REGISTRY) {
            const harness = createHarness({ packageId: packageDefinition.id, viewport });
            try {
                harness.state.setTheme('champagne');
                const rootBefore = harness.root;
                const regionsBefore = {
                    sidebar: document.querySelector('[data-builder-region="sidebar"]'),
                    editor: document.querySelector('[data-builder-region="editor"]'),
                    preview: document.querySelector('[data-builder-region="preview"]')
                };

                for (const section of getSectionsForPackage(packageDefinition.id).filter(({ allowed }) => allowed)) {
                    sectionInput(section.id).parentElement.click();
                    await flushSectionRender();
                    assert.ok(harness.state.getSnapshot().draft.enabledSections.includes(section.id));
                    assert.strictEqual(document.getElementById('invitation-builder-root'), rootBefore);
                    assert.strictEqual(document.querySelector('[data-builder-region="sidebar"]'), regionsBefore.sidebar);
                    assert.strictEqual(document.querySelector('[data-builder-region="editor"]'), regionsBefore.editor);
                    assert.strictEqual(document.querySelector('[data-builder-region="preview"]'), regionsBefore.preview);

                    sectionInput(section.id).parentElement.click();
                    await flushSectionRender();
                    assert.equal(harness.state.getSnapshot().draft.enabledSections.includes(section.id), false);
                    assert.strictEqual(document.getElementById('invitation-builder-root'), rootBefore);
                }

                assert.equal(window.innerWidth, viewport.width);
                assert.equal(window.innerHeight, viewport.height);
                assert.equal(document.querySelectorAll('#sections .section-option').length, SECTION_REGISTRY.length);
                assert.deepEqual(harness.stateErrors, []);
                assert.deepEqual(harness.selectorErrors, []);
            } finally {
                harness.close();
            }
        }
    }
});

test('Champagne, Aloha y todos los temas conservan enabledSections al activar y desactivar todo Prestige', { concurrency: false }, async () => {
    const harness = createHarness({ packageId: 'prestige' });
    try {
        for (const theme of THEME_REGISTRY) {
            harness.state.setTheme(theme.id);
            for (const section of SECTION_REGISTRY) {
                sectionInput(section.id).parentElement.click();
                await flushSectionRender();
                assert.ok(harness.state.getSnapshot().draft.enabledSections.includes(section.id));
                assert.equal(latestRenderMessage(harness.messages).payload.theme.id, theme.id);
                sectionInput(section.id).parentElement.click();
                await flushSectionRender();
                assert.equal(harness.state.getSnapshot().draft.enabledSections.includes(section.id), false);
            }
            assert.deepEqual(harness.state.getSnapshot().draft.enabledSections, []);
        }
        assert.deepEqual(harness.stateErrors, []);
        assert.deepEqual(harness.selectorErrors, []);
    } finally {
        harness.close();
    }
});

test('los bindings de secciones son válidos y degradan sin colapsar en las once plantillas', { concurrency: false }, async () => {
    for (const theme of COLLECTION_THEMES) {
        const html = await readFile(path.join(ROOT, theme.templatePath.replace(/^\//, '')), 'utf8');
        const template = new JSDOM(html);
        try {
            for (const section of SECTION_REGISTRY) {
                const errors = [];
                const result = applyPreviewSectionVisibility(
                    template.window.document,
                    SECTION_REGISTRY,
                    [section.id],
                    { onBindingError: (failure) => errors.push(failure) }
                );
                assert.deepEqual(errors, [], `${theme.id}/${section.id} contiene un selector inválido`);
                assert.equal(result.invalidBindings.length, 0);
                assert.equal(result.missingBindings.length, 0, `${theme.id} no resolvió todos los bindings declarados`);
                assert.equal(template.window.document.body.isConnected, true);
            }
        } finally {
            template.window.close();
        }
    }

    assert.equal(COLLECTION_THEMES.find((theme) => theme.id === 'aloha').templatePath, '/principal/demos/xv-renatta/index.html');
    const emptyPreview = new JSDOM('<!doctype html><body><main>Sin bindings todavía</main></body>');
    const result = applyPreviewSectionVisibility(emptyPreview.window.document, SECTION_REGISTRY, ['gallery']);
    assert.ok(result.missingBindings.length > 0);
    assert.equal(emptyPreview.window.document.body.isConnected, true);
    emptyPreview.window.close();
});

test('Champagne → Luxury → Aloha conserva secciones y el downgrade marca Conservada', { concurrency: false }, async () => {
    const harness = createHarness({ packageId: 'prestige' });
    try {
        harness.state.setTheme('champagne');
        for (const sectionId of ['gallery', 'itinerary', 'access-preview']) {
            sectionInput(sectionId).parentElement.click();
            await flushSectionRender();
        }
        const selected = harness.state.getSnapshot().draft.enabledSections;

        harness.state.setTheme('luxury');
        assert.deepEqual(harness.state.getSnapshot().draft.enabledSections, selected);
        harness.state.setTheme('aloha');
        assert.deepEqual(harness.state.getSnapshot().draft.enabledSections, selected);
        assert.equal(latestRenderMessage(harness.messages).payload.theme.id, 'aloha');

        harness.state.setPackage('premium');
        const retained = sectionInput('itinerary').closest('.section-option');
        assert.equal(retained.classList.contains('is-retained'), true);
        assert.equal(sectionInput('itinerary').checked, true);
        assert.equal(sectionInput('itinerary').disabled, true);

        harness.state.setPackage('prestige');
        assert.equal(sectionInput('itinerary').disabled, false);
        assert.equal(sectionInput('itinerary').checked, true);
        assert.deepEqual(harness.state.getSnapshot().draft.enabledSections, selected);
    } finally {
        harness.close();
    }
});

test('un listener defectuoso se reporta, pero no corta selector, Event Bus ni preview', { concurrency: false }, async () => {
    const harness = createHarness({
        packageId: 'premium',
        failingListener: ({ reason }) => {
            if (reason === 'sections-changed') throw new Error('test/section-listener-failure');
        }
    });
    try {
        harness.state.setTheme('champagne');
        sectionInput('gallery').parentElement.click();
        await flushSectionRender();

        assert.equal(harness.stateErrors.length, 1);
        assert.equal(harness.stateErrors[0].error.message, 'test/section-listener-failure');
        assert.equal(harness.stateErrors[0].source, 'test-failing-listener');
        assert.equal(sectionInput('gallery').checked, true);
        assert.ok(harness.busEvents.some(({ type }) => type === EVENT_TYPES.BUILDER_SECTIONS_CHANGED));
        assert.ok(latestRenderMessage(harness.messages).payload.enabledSections.includes('gallery'));
        assert.equal(document.getElementById('builder-workspace').isConnected, true);
    } finally {
        harness.close();
    }
});

test('el render transaccional conserva la lista anterior y permite reintentar si una card falla', { concurrency: false }, async () => {
    const harness = createHarness({ packageId: 'premium' });
    const originalCreateElement = document.createElement.bind(document);
    try {
        harness.state.setTheme('champagne');
        const originalCards = [...document.querySelectorAll('#sections .section-option')];
        let failOnce = true;
        document.createElement = (tagName, options) => {
            if (failOnce && tagName === 'strong') {
                failOnce = false;
                throw new Error('test/section-card-render-failure');
            }
            return originalCreateElement(tagName, options);
        };

        sectionInput('gallery').parentElement.click();
        await flushSectionRender();
        document.createElement = originalCreateElement;

        assert.equal(harness.selectorErrors.length, 1);
        assert.equal(harness.selectorErrors[0].error.message, 'test/section-card-render-failure');
        assert.equal(document.querySelectorAll('#sections .section-option').length, SECTION_REGISTRY.length);
        assert.ok(originalCards.every((card) => card.isConnected));
        assert.ok(harness.state.getSnapshot().draft.enabledSections.includes('gallery'));

        harness.selectorErrors[0].context.retry();
        assert.equal(sectionInput('gallery').checked, true);
        assert.ok(originalCards.every((card) => !card.isConnected));
    } finally {
        document.createElement = originalCreateElement;
        harness.close();
    }
});
