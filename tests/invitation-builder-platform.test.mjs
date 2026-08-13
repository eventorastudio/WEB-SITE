import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import {
    BUILDER_DESKTOP_INPUT_QUERY,
    BUILDER_DESKTOP_MIN_WIDTH,
    BUILDER_PLATFORM_STATUS,
    evaluateBuilderPlatform,
    initBuilderPlatformAccess,
    isBuilderDesktopSupported
} from '../admin/invitations/core/builder-platform.js';
import {
    createBuilderDebugLogger,
    isBuilderDebugEnabled
} from '../admin/invitations/core/builder-debug.js';

function createPlatformWindow({ width, height, desktopInput }) {
    const windowListeners = new Map();
    const mediaListeners = new Set();
    const mediaQuery = {
        matches: desktopInput,
        media: BUILDER_DESKTOP_INPUT_QUERY,
        addEventListener(type, listener) {
            if (type === 'change') mediaListeners.add(listener);
        },
        removeEventListener(type, listener) {
            if (type === 'change') mediaListeners.delete(listener);
        }
    };

    return {
        innerWidth: width,
        innerHeight: height,
        devicePixelRatio: 1,
        matchMedia: (query) => {
            assert.equal(query, BUILDER_DESKTOP_INPUT_QUERY);
            return mediaQuery;
        },
        addEventListener(type, listener) {
            if (!windowListeners.has(type)) windowListeners.set(type, new Set());
            windowListeners.get(type).add(listener);
        },
        removeEventListener(type, listener) {
            windowListeners.get(type)?.delete(listener);
        },
        setViewport(nextWidth, nextHeight = this.innerHeight) {
            this.innerWidth = nextWidth;
            this.innerHeight = nextHeight;
            windowListeners.get('resize')?.forEach((listener) => listener());
        },
        setDesktopInput(matches) {
            mediaQuery.matches = matches;
            mediaListeners.forEach((listener) => listener({ matches, media: BUILDER_DESKTOP_INPUT_QUERY }));
        }
    };
}

test('la plataforma separa capacidad desktop del ancho de la ventana', () => {
    assert.equal(BUILDER_DESKTOP_MIN_WIDTH, 1100);
    assert.equal(
        evaluateBuilderPlatform({ viewportWidth: 390, desktopInput: false }),
        BUILDER_PLATFORM_STATUS.UNSUPPORTED_DEVICE
    );
    assert.equal(
        evaluateBuilderPlatform({ viewportWidth: 1024, desktopInput: false }),
        BUILDER_PLATFORM_STATUS.UNSUPPORTED_DEVICE
    );
    assert.equal(
        evaluateBuilderPlatform({ viewportWidth: 900, desktopInput: true }),
        BUILDER_PLATFORM_STATUS.WINDOW_TOO_SMALL
    );
    assert.equal(
        evaluateBuilderPlatform({ viewportWidth: 1100, desktopInput: true }),
        BUILDER_PLATFORM_STATUS.SUPPORTED
    );
});

test('teléfono y tablet táctil no inicializan el Builder completo', () => {
    for (const device of [
        { width: 390, height: 844 },
        { width: 1024, height: 1366 }
    ]) {
        const targetWindow = createPlatformWindow({ ...device, desktopInput: false });
        const statuses = [];
        let initializations = 0;
        const cleanup = initBuilderPlatformAccess({
            targetWindow,
            onReady: () => { initializations += 1; },
            onStatusChange: (status, context) => statuses.push({ status, context })
        });
        assert.equal(initializations, 0);
        assert.deepEqual(statuses, [{
            status: BUILDER_PLATFORM_STATUS.UNSUPPORTED_DEVICE,
            context: { hasStarted: false }
        }]);
        assert.equal(isBuilderDesktopSupported(targetWindow), false);
        cleanup();
    }
});

test('desktop pequeño espera; al ampliar inicia una vez y los resizes posteriores conservan el draft', () => {
    const targetWindow = createPlatformWindow({ width: 980, height: 768, desktopInput: true });
    const state = new InvitationBuilderState();
    const statuses = [];
    let initializations = 0;
    const cleanup = initBuilderPlatformAccess({
        targetWindow,
        onReady: () => {
            initializations += 1;
            state.initialize('EVT-0001', { nombreEvento: 'María & Fernando', paquete: 'Premium' });
            state.setTheme('champagne');
            state.toggleSection('gallery', true);
            state.updateContent({ title: 'Nombre conservado' });
            state.setPreviewDevice('tablet');
        },
        onStatusChange: (status, context) => statuses.push({ status, context })
    });

    assert.equal(initializations, 0);
    assert.equal(statuses.at(-1).status, BUILDER_PLATFORM_STATUS.WINDOW_TOO_SMALL);

    targetWindow.setViewport(1366, 768);
    assert.equal(initializations, 1);
    assert.equal(statuses.at(-1).status, BUILDER_PLATFORM_STATUS.SUPPORTED);

    targetWindow.setViewport(900, 768);
    assert.equal(statuses.at(-1).status, BUILDER_PLATFORM_STATUS.WINDOW_TOO_SMALL);
    assert.equal(statuses.at(-1).context.hasStarted, true);

    targetWindow.setViewport(1440, 900);
    assert.equal(initializations, 1);
    assert.equal(statuses.at(-1).status, BUILDER_PLATFORM_STATUS.SUPPORTED);
    assert.equal(state.getSnapshot().draft.content.identity.primaryName, 'Nombre conservado');
    assert.equal(state.getSnapshot().draft.themeId, 'champagne');
    assert.deepEqual(state.getSnapshot().draft.enabledSections, ['gallery']);
    assert.equal(state.getSnapshot().ui.previewDevice, 'tablet');
    cleanup();
});

test('debugBuilder solo registra diagnósticos controlados cuando vale 1', () => {
    assert.equal(isBuilderDebugEnabled('?event=EVT-0001&debugBuilder=1'), true);
    assert.equal(isBuilderDebugEnabled('?event=EVT-0001'), false);

    const dom = new JSDOM(`<!doctype html><body>
        <div id="invitation-builder-root">
            <aside data-builder-region="sidebar"></aside>
            <section data-builder-region="editor"><div id="builder-panel-sections"></div></section>
            <aside data-builder-region="preview"><iframe id="invitation-preview-frame"></iframe></aside>
        </div>
    </body>`, { url: 'https://eventorastudio.com/admin/invitations/builder.html?event=EVT-0001&debugBuilder=1' });
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 900 });

    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Evento', paquete: 'Premium' });
    state.setTheme('champagne');
    state.toggleSection('gallery', true);

    const calls = [];
    const originalDebug = console.debug;
    console.debug = (...args) => calls.push(args);
    try {
        const logger = createBuilderDebugLogger({
            targetWindow: dom.window,
            targetDocument: dom.window.document,
            getSnapshot: () => state.getSnapshot()
        });
        logger.trace('section-change-after-state', { sectionId: 'gallery' });
        logger.captureError('window-error', new Error('test/debug-stack'), {
            filename: 'builder.js',
            line: 10,
            column: 20
        });
    } finally {
        console.debug = originalDebug;
        dom.window.close();
    }

    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], '[InvitationBuilder]');
    assert.equal(calls[0][1].viewport.width, 1440);
    assert.deepEqual(calls[0][1].enabledSections, ['gallery']);
    assert.equal(calls[0][1].regions.root.exists, true);
    assert.equal(calls[0][1].regions.sectionPanel.exists, true);
    assert.equal(calls[1][1].error.message, 'test/debug-stack');
    assert.equal('user' in calls[0][1], false);
    assert.equal('token' in calls[0][1], false);
});
