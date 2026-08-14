import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    COLLECTION_THEMES,
    THEME_REGISTRY,
    getThemeById
} from '../admin/invitations/core/theme-registry.js';
import {
    PACKAGE_REGISTRY,
    SECTION_REGISTRY,
    getSectionsForPackage,
    isSectionAllowed
} from '../admin/invitations/core/section-registry.js';
import {
    InvitationBuilderState,
    createInvitationDraft,
    assertEnabledSections
} from '../admin/invitations/core/builder-state.js';
import {
    createBuilderUrl,
    readBuilderRoute
} from '../admin/invitations/core/builder-routing.js';
import { validateBasicContent } from '../admin/invitations/core/builder-validation.js';
import { TEMPLATE_BINDING_REGISTRY } from '../admin/invitations/core/template-binding-registry.js';
import {
    PERMISSIONS,
    hasPermission,
    resolveRoleContext
} from '../admin/core/roles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

function validateBalancedHtml(html, label) {
    const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    const stack = [];
    for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
        const token = match[0];
        const tag = match[1].toLowerCase();
        if (voidElements.has(tag) || token.endsWith('/>')) continue;
        if (!token.startsWith('</')) stack.push(tag);
        else assert.equal(stack.pop(), tag, `${label} tiene una etiqueta </${tag}> fuera de orden`);
    }
    assert.deepEqual(stack, [], `${label} contiene etiquetas HTML sin cerrar`);
}

test('THEME_REGISTRY contiene las once colecciones reales y Personalizada', async () => {
    assert.equal(COLLECTION_THEMES.length, 11);
    assert.equal(THEME_REGISTRY.length, 12);
    assert.deepEqual(
        COLLECTION_THEMES.map((theme) => theme.id),
        ['aloha', 'luxury', 'botanical', 'midnight', 'romance', 'minimal', 'celestial', 'vintage', 'garden', 'champagne', 'neon-party']
    );
    assert.equal(getThemeById('custom').name, 'Personalizada');
    assert.equal(getThemeById('missing'), null);

    for (const theme of COLLECTION_THEMES) {
        assert.ok(theme.cover.startsWith('/principal/'));
        assert.ok(theme.templatePath.startsWith('/principal/demos/'));
        await access(path.join(ROOT, theme.templatePath.replace(/^\//, '')));
        await access(path.join(ROOT, theme.cover.replace(/^\//, '')));
        assert.equal(theme.bindingAdapterId, theme.id);
        assert.ok(TEMPLATE_BINDING_REGISTRY[theme.bindingAdapterId]);
    }
});

test('SECTION_REGISTRY deriva permisos acumulativos de los paquetes reales', () => {
    assert.ok(SECTION_REGISTRY.length >= 10);
    assert.deepEqual(PACKAGE_REGISTRY.map((item) => item.id), ['esencial', 'premium', 'prestige']);
    assert.equal(isSectionAllowed('countdown', 'esencial'), true);
    assert.equal(isSectionAllowed('welcome-video', 'esencial'), false);
    assert.equal(isSectionAllowed('welcome-video', 'premium'), true);
    assert.equal(isSectionAllowed('itinerary', 'premium'), false);
    assert.equal(isSectionAllowed('itinerary', 'prestige'), true);
    assert.equal(isSectionAllowed('missing', 'prestige'), false);
    assert.ok(getSectionsForPackage('prestige').every((section) => section.allowed));
});

test('una sección bloqueada no puede activarse y un downgrade conserva configuración', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'María & Fernando', fecha: '2027-11-15' });

    assert.deepEqual(state.toggleSection('itinerary', true), { ok: false, code: 'builder/section-not-allowed' });
    state.setPackage('prestige');
    assert.equal(state.toggleSection('itinerary', true).ok, true);
    state.setPackage('premium');

    assert.ok(state.getSnapshot().draft.enabledSections.includes('itinerary'));
    assert.deepEqual(state.getUnavailableEnabledSections(), ['itinerary']);
});

test('enabledSections mantiene el contrato Array<string> con IDs únicos del registro', () => {
    assert.deepEqual(assertEnabledSections(['gallery', 'itinerary']), ['gallery', 'itinerary']);
    assert.throws(() => assertEnabledSections(new Set(['gallery'])), /builder\/enabled-sections-must-be-array/);
    assert.throws(() => assertEnabledSections(['gallery', undefined]), /builder\/invalid-enabled-section:undefined/);
    assert.throws(() => assertEnabledSections(['gallery', 'gallery']), /builder\/duplicate-enabled-section:gallery/);

    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Evento' });
    assert.deepEqual(state.toggleSection(undefined, true), { ok: false, code: 'builder/invalid-section-id' });
    assert.deepEqual(state.toggleSection('gallery', 'yes'), { ok: false, code: 'builder/invalid-section-state' });
});

test('cambiar Champagne por Luxury no borra nombre, fecha ni contenido', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', {
        nombreEvento: 'Evento original',
        tipoEvento: 'Boda',
        fecha: '2027-11-15',
        hora: '18:30',
        ciudad: 'Saltillo'
    });

    state.setTheme('champagne');
    state.updateContent({ title: 'María & Fernando', date: '2027-11-15' });
    const before = state.getSnapshot().draft.content;
    state.setTheme('luxury');
    const after = state.getSnapshot().draft.content;

    assert.deepEqual(after, before);
    assert.equal(state.getSnapshot().draft.themeId, 'luxury');
    assert.equal(after.identity.primaryName, 'María & Fernando');
    assert.equal(after.schedule.date, '2027-11-15');
});

test('el draft separa content, media, links y appearance y no inicia sucio', () => {
    const draft = createInvitationDraft('event-doc-id', {
        nombreEvento: 'XV de Andrea',
        fecha: { seconds: 1826236800 },
        paquete: 'Prestige'
    });
    assert.equal(draft.eventId, 'event-doc-id');
    assert.equal(draft.packageId, 'prestige');
    assert.equal(draft.meta.packageSource, 'event');
    assert.ok(draft.content && draft.media && draft.links && draft.appearance);
    assert.deepEqual(draft.enabledSections, []);

    const state = new InvitationBuilderState();
    state.initialize('event-doc-id', { nombreEvento: 'XV de Andrea', fecha: '2028-01-01' });
    assert.equal(state.getSnapshot().ui.isDirty, false);
    state.setPreviewDevice('tablet');
    assert.equal(state.getSnapshot().ui.isDirty, false);
    state.setTheme('aloha');
    assert.equal(state.getSnapshot().ui.isDirty, true);
});

test('routing interpreta ?event= y rechaza IDs inseguros', () => {
    assert.deepEqual(readBuilderRoute('?event=EVT-0001'), {
        eventId: 'EVT-0001',
        hasEventParameter: true,
        invalidEventParameter: false
    });
    assert.equal(readBuilderRoute('?event=../usuarios').invalidEventParameter, true);
    assert.equal(readBuilderRoute('').eventId, null);
    assert.equal(createBuilderUrl('EVT-0001'), 'builder.html?event=EVT-0001');
});

test('la validación básica detecta nombre vacío y fechas calendáricas inválidas', () => {
    assert.equal(validateBasicContent({ title: '', date: '2027-02-31' }).title.length > 0, true);
    assert.equal(validateBasicContent({ title: '', date: '2027-02-31' }).date.length > 0, true);
    assert.deepEqual(validateBasicContent({ title: 'María & Fernando', date: '2027-11-15' }), {});
});

test('el permiso del Builder proviene de custom claims y nunca de un fallback CEO', async () => {
    const designer = await resolveRoleContext({
        getIdTokenResult: async () => ({ claims: { role: 'DISENADOR' } })
    });
    const missing = await resolveRoleContext({
        getIdTokenResult: async () => ({ claims: {} })
    });

    assert.equal(hasPermission(designer, PERMISSIONS.INVITATIONS_EDIT), true);
    assert.equal(missing.role, null);
    assert.equal(missing.isInternal, false);
    assert.equal(hasPermission(missing, PERMISSIONS.INVITATIONS_EDIT), false);
});

test('Dashboard y Administrar evento abren la misma aplicación Builder', async () => {
    const [dashboardHtml, dashboardJs, eventHtml, eventJs] = await Promise.all([
        read('admin/dashboard.html'),
        read('admin/dashboard.js'),
        read('admin/event.html'),
        read('admin/event.js')
    ]);
    assert.match(dashboardHtml, /id="btn-create-invitation"/);
    assert.match(dashboardJs, /\.\/invitations\/builder\.html/);
    assert.match(eventHtml, /id="btn-open-invitation-builder"/);
    assert.match(eventJs, /\.\/invitations\/builder\.html\?\$\{query\.toString\(\)\}/);
    assert.match(dashboardJs, /PERMISSIONS\.INVITATIONS_EDIT/);
    assert.match(eventJs, /PERMISSIONS\.INVITATIONS_EDIT/);
});

test('el Builder protege acceso, usa eventService y controla evento inexistente', async () => {
    const [builder, html] = await Promise.all([
        read('admin/invitations/builder.js'),
        read('admin/invitations/builder.html')
    ]);
    assert.match(builder, /authService\.getRoleContext\(\{ forceRefresh: true \}\)/);
    assert.match(builder, /hasPermission\(roleContext, PERMISSIONS\.INVITATIONS_EDIT\)/);
    assert.match(builder, /eventService\.getEventById\(eventId\)/);
    assert.match(builder, /if \(!eventData\)/);
    assert.match(builder, /El evento no existe o fue eliminado/);
    assert.match(builder, /subscribeToErrors/);
    assert.match(builder, /reportRuntimeError/);
    assert.match(builder, /initBuilderPlatformAccess/);
    assert.match(builder, /assertBuilderRootInvariant/);
    assert.match(html, /id="builder-runtime-error" role="alert" hidden/);
    assert.match(html, />Reintentar</);
    assert.match(html, /id="invitation-builder-root" data-builder-root hidden/);
    assert.match(html, /id="builder-platform-gate"/);
    assert.match(html, />Invitation Builder disponible solo en computadora</);
    assert.match(html, /data-builder-region="sidebar"/);
    assert.match(html, /data-builder-region="editor"/);
    assert.match(html, /data-builder-region="preview"/);

    const topLevel = builder.slice(0, builder.indexOf('async function boot'));
    assert.match(topLevel, /initBuilderPlatformAccess/);
    assert.doesNotMatch(topLevel, /\nboot\(\);/);
});

test('la preview usa plantilla real, postMessage tipado y bloquea navegación externa', async () => {
    const [controller, frame, html] = await Promise.all([
        read('admin/invitations/modules/preview-controller.js'),
        read('admin/invitations/preview/frame.js'),
        read('admin/invitations/builder.html')
    ]);
    assert.match(html, /sandbox="allow-scripts allow-same-origin"/);
    assert.match(html, /data-src="\.\/preview\/frame\.html\?v=phase4-media-/);
    assert.doesNotMatch(html, /\s+src="\.\/preview\/frame\.html/);
    assert.match(controller, /postMessage\(message, targetOrigin\)/);
    assert.match(controller, /event\.origin !== targetOrigin/);
    assert.match(frame, /fetch\(templateUrl/);
    assert.match(frame, /applyTemplateContentBindings\(document, payload\.theme\.id, payload\.draft\)/);
    assert.match(controller, /PREVIEW_MESSAGE_TYPES\.UPDATE/);
    assert.match(frame, /event\.source !== window\.parent/);
    assert.match(frame, /function interceptNavigation/);
    assert.match(frame, /event\.preventDefault\(\)/);
    assert.match(frame, /querySelectorAll\('script, audio,/);
});

test('los módulos internos nunca reemplazan ni eliminan el root inmutable', async () => {
    const files = [
        'admin/invitations/builder.js',
        'admin/invitations/modules/basic-information.js',
        'admin/invitations/modules/package-selector.js',
        'admin/invitations/modules/preview-controller.js',
        'admin/invitations/modules/section-selector.js',
        'admin/invitations/modules/theme-selector.js'
    ];
    const source = (await Promise.all(files.map(read))).join('\n');
    assert.doesNotMatch(source, /invitation-builder-root[^\n]*(?:replaceChildren|replaceWith|remove|innerHTML)/);
    assert.doesNotMatch(source, /document\.body\.(?:replaceChildren|replaceWith|remove)/);
    assert.doesNotMatch(source, /document\.body\.innerHTML\s*=/);
});

test('el layout del editor mantiene tres regiones estables y ya no intenta convertirse en editor móvil', async () => {
    const css = await read('admin/invitations/builder.css');
    assert.match(css, /\.builder-shell \{[^}]*height: 100dvh;[^}]*display: flex;/s);
    assert.match(css, /\.builder-workspace \{[^}]*flex: 1 1 auto;[^}]*grid-template-columns: 172px minmax\(480px, 1fr\) minmax\(360px, 450px\);/s);
    assert.match(css, /\.builder-editor \{[^}]*min-height: 0;[^}]*overflow-y: auto;/s);
    assert.match(css, /\.builder-preview \{[^}]*min-height: 0;/s);
    assert.match(css, /\.section-option \{[^}]*position: relative;/s);
    assert.match(css, /\.section-option input \{[^}]*position: absolute;/s);
    assert.doesNotMatch(css, /@media \(max-width: (?:1020|760|480)px\)/);
});

test('Fase 1 no importa primitivas de escritura Firestore ni simula guardado', async () => {
    const builderFiles = [
        'admin/invitations/builder.js',
        'admin/invitations/core/builder-debug.js',
        'admin/invitations/core/builder-platform.js',
        'admin/invitations/core/builder-state.js',
        'admin/invitations/core/preview-sections.js',
        'admin/invitations/modules/basic-information.js',
        'admin/invitations/modules/preview-controller.js',
        'admin/invitations/modules/section-selector.js',
        'admin/invitations/modules/state-event-bridge.js'
    ];
    const source = (await Promise.all(builderFiles.map(read))).join('\n');
    assert.doesNotMatch(source, /firebase-firestore\.js/);
    assert.doesNotMatch(source, /\b(?:addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction|serverTimestamp)\b/);
    assert.doesNotMatch(source, /saveTheme|saveDraft|autosave/i);

    const html = await read('admin/invitations/builder.html');
    assert.match(html, /Guardar borrador · Próximamente/);
    assert.match(html, /class="builder-save" type="button" disabled/);
});

test('builder y frame tienen HTML balanceado, IDs únicos y referencias locales existentes', async () => {
    for (const relativePath of ['admin/invitations/builder.html', 'admin/invitations/preview/frame.html']) {
        const html = await read(relativePath);
        validateBalancedHtml(html, relativePath);
        const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
        assert.equal(new Set(ids).size, ids.length, `${relativePath} contiene IDs duplicados`);

        const directory = path.dirname(path.join(ROOT, relativePath));
        const references = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)]
            .map((match) => match[1])
            .filter((value) => !/^(?:https?:|mailto:|tel:)/.test(value));
        for (const reference of references) await access(path.resolve(directory, reference.split('?')[0]));

        const deferredReferences = [...html.matchAll(/data-src="([^"#]+)"/g)].map((match) => match[1]);
        for (const reference of deferredReferences) await access(path.resolve(directory, reference.split('?')[0]));
    }
});
