import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
    INVITATION_CONTENT_SCHEMA_VERSION,
    INVITATION_DRAFT_SCHEMA_VERSION,
    createInvitationContent,
    migrateInvitationDraftContent
} from '../admin/invitations/core/content-schema.js';
import { InvitationBuilderState, createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import { validateInvitationDraft, validateRsvpConfig } from '../admin/invitations/core/builder-validation.js';
import {
    RSVP_GUEST_POLICIES,
    RSVP_METHODS,
    createRsvpConfig,
    resolveRsvpGuestPolicy
} from '../admin/invitations/core/rsvp-schema.js';
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from '../admin/invitations/core/safe-url.js';
import { isSectionAllowed } from '../admin/invitations/core/section-registry.js';
import { COLLECTION_THEMES, THEME_REGISTRY } from '../admin/invitations/core/theme-registry.js';
import {
    applyPhase5ContentBindings,
    applyTemplateContentBindings,
    createTemplateSectionContract
} from '../admin/invitations/core/template-binding-registry.js';
import { initSectionCopyEditors } from '../admin/invitations/editors/section-copy-editor.js';
import { initPreviewController } from '../admin/invitations/modules/preview-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RENDER = 'EVENTORA_INVITATION_PREVIEW_RENDER';
const UPDATE = 'EVENTORA_INVITATION_PREVIEW_UPDATE';
const RENDERED = 'EVENTORA_INVITATION_PREVIEW_RENDERED';

function readyState({ packageId = 'prestige', themeId = 'champagne' } = {}) {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', {
        nombreEvento: 'Evento Aurora',
        fecha: '2027-11-15',
        paquete: packageId
    });
    state.setTheme(themeId);
    state.toggleSection('rsvp', true);
    return state;
}

function configureRsvp(state, overrides = {}) {
    const fields = {
        'content.rsvp.enabled': true,
        'content.rsvp.deadline': '2027-11-01',
        'content.rsvp.deadlineTime': '18:30',
        'content.rsvp.deadlineTimeZone': 'America/Monterrey',
        'content.rsvp.title': 'Confirma tu asistencia',
        'content.rsvp.message': 'Queremos saber si podremos compartir este evento contigo.',
        'content.rsvp.buttonLabel': 'Responder invitación',
        'content.rsvp.method': 'whatsapp',
        'content.rsvp.whatsapp.phone': '+52 844 123 4567',
        'content.rsvp.whatsapp.message': 'Hola, deseo confirmar mi asistencia.',
        'content.rsvp.guestPolicy': 'select-up-to-assigned',
        'content.rsvp.responses.acceptedLabel': 'Sí, asistiré',
        'content.rsvp.responses.declinedLabel': 'No podré asistir',
        'content.rsvp.responses.confirmationMessage': 'Gracias, registramos tu respuesta.',
        ...overrides
    };
    const result = state.updateDraftFields(fields);
    assert.equal(result.ok, true);
    return state.getSnapshot().draft;
}

async function themeDocument(themeId) {
    const theme = COLLECTION_THEMES.find(({ id }) => id === themeId);
    const html = await readFile(path.join(ROOT, theme.templatePath.replace(/^\//, '')), 'utf8');
    const dom = new JSDOM(html, { url: 'https://eventora.local/' });
    dom.window.document.querySelectorAll('script, audio, #event-music, #music-control, #opening').forEach((node) => node.remove());
    return dom;
}

async function assertThemeRsvp(themeId) {
    const dom = await themeDocument(themeId);
    try {
        const state = readyState({ themeId });
        const draft = configureRsvp(state);
        const result = applyTemplateContentBindings(dom.window.document, themeId, draft);
        assert.equal(result.applied, true);
        const root = dom.window.document.querySelector('[data-builder-semantic-section="rsvp"]');
        assert.ok(root, `${themeId}: raíz RSVP`);
        assert.match(root.textContent, /Confirma tu asistencia/);
        assert.match(root.textContent, /Evento contigo/iu);
        assert.match(root.textContent, /Sí, asistiré/);
        const action = dom.window.document.querySelector('[data-builder-action="whatsapp"]');
        assert.match(action?.getAttribute('href') ?? '', /^https:\/\/wa\.me\/528441234567/);
        assert.equal(action?.getAttribute('target'), null);
    } finally {
        dom.window.close();
    }
}

function installDom(html) {
    const dom = new JSDOM(html, { url: 'http://127.0.0.1:4173/admin/invitations/builder.html' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    return {
        dom,
        close() {
            dom.window.close();
            delete globalThis.window;
            delete globalThis.document;
        }
    };
}

test('1. contrato RSVP canónico amplía content.rsvp y versiona sólo el schema de contenido', () => {
    const content = createInvitationContent();
    assert.equal(INVITATION_DRAFT_SCHEMA_VERSION, 5);
    assert.equal(INVITATION_CONTENT_SCHEMA_VERSION, 4);
    assert.deepEqual(Object.keys(content.rsvp), [
        'enabled', 'title', 'message', 'buttonLabel', 'deadline', 'deadlineTime',
        'deadlineTimeZone', 'method', 'whatsapp', 'guestPolicy', 'responses'
    ]);
    assert.deepEqual(Object.keys(content.rsvp.whatsapp), ['phone', 'message']);
    assert.deepEqual(Object.keys(content.rsvp.responses), ['acceptedLabel', 'declinedLabel', 'confirmationMessage']);
});

test('2. defaults RSVP son neutrales y la migración conserva los cuatro campos preexistentes', () => {
    const defaults = createRsvpConfig();
    assert.equal(defaults.enabled, true);
    assert.equal(defaults.method, 'internal');
    assert.equal(defaults.guestPolicy, 'assigned-only');
    const migrated = migrateInvitationDraftContent({
        contentSchemaVersion: 2,
        content: { rsvp: { title: 'Título legado', message: 'Mensaje', buttonLabel: 'Confirmar', deadline: '2027-10-01' } }
    });
    assert.equal(migrated.contentSchemaVersion, 4);
    assert.equal(migrated.content.rsvp.title, 'Título legado');
    assert.equal(migrated.content.rsvp.deadline, '2027-10-01');
    assert.equal(migrated.content.rsvp.deadlineTime, '');
    assert.equal(migrated.content.rsvp.deadlineTimeZone, '');
    assert.equal(migrated.content.rsvp.whatsapp.phone, '');
});

test('3. enabled se actualiza como booleano canónico', () => {
    const state = readyState();
    state.updateDraftField('content.rsvp.enabled', false);
    assert.equal(state.getSnapshot().draft.content.rsvp.enabled, false);
    state.updateDraftField('content.rsvp.enabled', true);
    assert.equal(state.getSnapshot().draft.content.rsvp.enabled, true);
});

test('4. disabled no exige campos activos y conserva toda la configuración', () => {
    const state = readyState();
    configureRsvp(state);
    state.updateDraftField('content.rsvp.enabled', false);
    const snapshot = state.getSnapshot();
    assert.deepEqual(validateRsvpConfig(snapshot.draft.content.rsvp), {});
    assert.equal(snapshot.draft.content.rsvp.whatsapp.phone, '+52 844 123 4567');
    assert.equal(snapshot.draft.content.rsvp.responses.declinedLabel, 'No podré asistir');
});

test('5. deadline calendárica válida es aceptada', () => {
    const draft = createInvitationDraft('EVT-1', { nombreEvento: 'Evento', fecha: '2027-11-15' });
    draft.content.rsvp.deadline = '2027-10-31';
    draft.content.rsvp.deadlineTime = '23:59';
    draft.content.rsvp.deadlineTimeZone = 'America/Monterrey';
    assert.equal(validateInvitationDraft(draft)['content.rsvp.deadline'], undefined);
});

test('6. deadline calendárica inválida produce error canónico', () => {
    const config = createRsvpConfig({ deadline: '2027-02-31' });
    assert.match(validateRsvpConfig(config)['content.rsvp.deadline'], /no es válida/i);
});

test('7. method whatsapp válido requiere y acepta teléfono', () => {
    const config = createRsvpConfig({ method: 'whatsapp', whatsapp: { phone: '+52 844 123 4567', message: 'Hola' } });
    assert.deepEqual(validateRsvpConfig(config), {});
});

test('8. method internal es capacidad configurada sin formulario público', () => {
    const config = createRsvpConfig({ method: 'internal' });
    assert.deepEqual(validateRsvpConfig(config), {});
    assert.ok(RSVP_METHODS.includes('internal'));
});

test('9. método desconocido se rechaza', () => {
    const config = { ...createRsvpConfig(), method: 'email' };
    assert.match(validateRsvpConfig(config)['content.rsvp.method'], /método RSVP válido/i);
});

test('10. teléfono internacional válido se normaliza sin duplicar sanitizadores', () => {
    assert.equal(normalizeWhatsAppPhone('+52 (844) 123-4567'), '528441234567');
});

test('11. teléfono inválido se rechaza', () => {
    const config = createRsvpConfig({ method: 'whatsapp', whatsapp: { phone: '123' } });
    assert.match(validateRsvpConfig(config)['content.rsvp.whatsapp.phone'], /7 a 15 dígitos/i);
});

test('12. protocolos peligrosos son rechazados antes de extraer dígitos', () => {
    for (const value of ['javascript:528441234567', 'data:528441234567', 'vbscript:528441234567']) {
        assert.equal(normalizeWhatsAppPhone(value), '');
        assert.equal(buildWhatsAppUrl({ phone: value, message: 'Hola' }), '');
    }
});

test('13. WhatsApp URL usa únicamente https://wa.me y codifica el mensaje', () => {
    const url = new URL(buildWhatsAppUrl({ phone: '+52 844 123 4567', message: 'Hola & gracias' }));
    assert.equal(url.origin, 'https://wa.me');
    assert.equal(url.pathname, '/528441234567');
    assert.equal(url.searchParams.get('text'), 'Hola & gracias');
});

test('14. untouched conserva el fallback RSVP propio de Aloha', async () => {
    const dom = await themeDocument('aloha');
    try {
        const title = dom.window.document.querySelector('[data-prestige-feature~="guest-control"] h2');
        const originalTitle = title.textContent;
        const originalCta = dom.window.document.querySelector('[data-demo-action="rsvp"]').textContent;
        applyTemplateContentBindings(dom.window.document, 'aloha', createInvitationDraft('EVT-1', {}));
        assert.equal(title.textContent, originalTitle);
        assert.equal(dom.window.document.querySelector('[data-demo-action="rsvp"]').textContent, originalCta);
        assert.equal(dom.window.document.querySelector('[data-builder-rsvp-config]'), null);
    } finally { dom.window.close(); }
});

test('15. explicit clear no restaura el título demo al cambiar de tema', async () => {
    const state = readyState({ themeId: 'aloha' });
    state.updateDraftField('content.rsvp.title', '');
    for (const themeId of ['aloha', 'luxury']) {
        const dom = await themeDocument(themeId);
        try {
            applyTemplateContentBindings(dom.window.document, themeId, state.getSnapshot().draft);
            const field = dom.window.document.querySelector('[data-builder-field-path="content.rsvp.title"]');
            assert.equal(field.hidden, true, themeId);
            assert.equal(field.textContent, '', themeId);
        } finally { dom.window.close(); }
    }
});

test('16. cambio de tema conserva el objeto RSVP completo', () => {
    const state = readyState();
    const expected = structuredClone(configureRsvp(state).content.rsvp);
    for (const themeId of ['champagne', 'luxury', 'garden', 'aloha', 'romance', 'custom']) state.setTheme(themeId);
    assert.deepEqual(state.getSnapshot().draft.content.rsvp, expected);
});

test('17. toggle de sección OFF/ON conserva RSVP', () => {
    const state = readyState();
    const expected = structuredClone(configureRsvp(state).content.rsvp);
    state.toggleSection('rsvp', false);
    assert.deepEqual(state.getSnapshot().draft.content.rsvp, expected);
    state.toggleSection('rsvp', true);
    assert.deepEqual(state.getSnapshot().draft.content.rsvp, expected);
});

test('18. downgrade a Esencial conserva una policy Premium pero aplica la capacidad segura', () => {
    const state = readyState({ packageId: 'premium' });
    state.updateDraftField('content.rsvp.guestPolicy', 'select-up-to-assigned');
    state.setPackage('esencial');
    const config = state.getSnapshot().draft.content.rsvp;
    assert.equal(config.guestPolicy, 'select-up-to-assigned');
    assert.deepEqual(resolveRsvpGuestPolicy(config, { passSelectionAllowed: isSectionAllowed('pass-selection', 'esencial') }), {
        configured: 'select-up-to-assigned', effective: 'assigned-only', retained: true
    });
    assert.equal(isSectionAllowed('rsvp', 'esencial'), true);
});

test('19. upgrade restaura la policy seleccionable desde SECTION_REGISTRY', () => {
    const state = readyState({ packageId: 'premium' });
    state.updateDraftField('content.rsvp.guestPolicy', 'select-up-to-assigned');
    state.setPackage('esencial');
    assert.deepEqual(state.updateDraftField('content.rsvp.guestPolicy', 'select-up-to-assigned'), { ok: false, code: 'builder/rsvp-policy-not-allowed' });
    state.setPackage('premium');
    const policy = resolveRsvpGuestPolicy(state.getSnapshot().draft.content.rsvp, {
        passSelectionAllowed: isSectionAllowed('pass-selection', state.getSnapshot().draft.packageId)
    });
    assert.equal(policy.effective, 'select-up-to-assigned');
    assert.equal(policy.retained, false);
});

test('20. Champagne consume el binding RSVP común', async () => assertThemeRsvp('champagne'));
test('21. Luxury consume el binding RSVP común', async () => assertThemeRsvp('luxury'));
test('22. Garden consume el binding RSVP común', async () => assertThemeRsvp('garden'));
test('23. Aloha consume el binding RSVP común', async () => assertThemeRsvp('aloha'));

test('24. Botanical, Midnight, Romance, Minimal, Celestial, Vintage y Neon Party usan el mismo adapter RSVP', async () => {
    for (const themeId of ['botanical', 'midnight', 'romance', 'minimal', 'celestial', 'vintage', 'neon-party']) {
        await assertThemeRsvp(themeId);
    }
    assert.equal(COLLECTION_THEMES.length, 11);
});

test('25. Personalizada crea RSVP desde el mismo contrato sin copy de otra demo', () => {
    const dom = new JSDOM('<main><section data-custom-section="rsvp" data-prestige-feature="rsvp"></section></main>', { url: 'https://eventora.local/' });
    try {
        const state = readyState({ themeId: 'custom' });
        const draft = configureRsvp(state, { 'content.rsvp.title': 'RSVP para cualquier evento' });
        const result = applyPhase5ContentBindings(dom.window.document, 'custom', draft);
        assert.equal(result.applied, true);
        assert.match(dom.window.document.body.textContent, /RSVP para cualquier evento/);
        assert.match(dom.window.document.body.textContent, /Gracias, registramos tu respuesta/);
        assert.doesNotMatch(dom.window.document.body.textContent, /boda|novios|quinceañera/i);
        state.updateDraftField('content.rsvp.title', 'RSVP actualizado por UPDATE');
        applyPhase5ContentBindings(dom.window.document, 'custom', state.getSnapshot().draft);
        assert.match(dom.window.document.body.textContent, /RSVP actualizado por UPDATE/);
        assert.doesNotMatch(dom.window.document.body.textContent, /RSVP para cualquier evento/);
    } finally { dom.window.close(); }
});

test('26. el copy canónico RSVP es neutral al tipo de evento', () => {
    const serialized = JSON.stringify(createRsvpConfig());
    assert.doesNotMatch(serialized, /boda|novi[ao]s?|ceremonia|misa|quinceañera/i);
    assert.deepEqual(RSVP_GUEST_POLICIES, ['assigned-only', 'select-up-to-assigned']);
});

test('27. XSS en copy y respuestas llega como textContent, nunca como markup', async () => {
    const dom = await themeDocument('champagne');
    try {
        const state = readyState();
        const attack = '<img src=x onerror=alert(1)><script>alert(2)</script>';
        const draft = configureRsvp(state, {
            'content.rsvp.title': attack,
            'content.rsvp.responses.acceptedLabel': attack
        });
        applyTemplateContentBindings(dom.window.document, 'champagne', draft);
        assert.match(dom.window.document.body.textContent, /<img src=x/);
        assert.equal(dom.window.document.querySelectorAll('script').length, 0);
        assert.equal(dom.window.document.querySelectorAll('img[src="x"]').length, 0);
        assert.equal(dom.window.document.querySelectorAll('[onclick]').length, 0);
    } finally { dom.window.close(); }
});

test('28. CTA externo queda marcado para intercepción de Vista del editor', async () => {
    const dom = await themeDocument('luxury');
    try {
        const state = readyState();
        applyTemplateContentBindings(dom.window.document, 'luxury', configureRsvp(state));
        const action = dom.window.document.querySelector('[data-builder-action="whatsapp"]');
        assert.ok(action);
        assert.equal(action.dataset.rsvpMethod, 'whatsapp');
        assert.equal(action.getAttribute('target'), null);
        const frameSource = await readFile(path.join(ROOT, 'admin/invitations/preview/frame.js'), 'utf8');
        assert.match(frameSource, /event\.preventDefault\(\)/);
        assert.match(frameSource, /VISTA DEL EDITOR/);
    } finally { dom.window.close(); }
});

test('29. edición RSVP emite UPDATE con debounce y no recarga el iframe', { concurrency: false }, async () => {
    const harness = installDom('<div id="stage"></div><span id="status"></span><div id="controls"></div><iframe id="frame"></iframe>');
    const state = readyState();
    const frame = document.getElementById('frame');
    const messages = [];
    let iframeLoads = 0;
    frame.addEventListener('load', () => { iframeLoads += 1; });
    frame.contentWindow.postMessage = (message, origin) => {
        messages.push(message);
        if (message.type === RENDER) {
            window.dispatchEvent(new window.MessageEvent('message', {
                data: { type: RENDERED, requestId: message.requestId, payload: { themeId: message.payload.theme.id, themeName: message.payload.theme.name } },
                origin,
                source: frame.contentWindow
            }));
        }
    };
    const cleanup = initPreviewController({
        frame,
        controls: document.getElementById('controls'),
        status: document.getElementById('status'),
        stage: document.getElementById('stage'),
        state,
        updateDebounceMs: 0
    });
    try {
        state.updateDraftField('content.rsvp.title', 'Actualización inmediata');
        await new Promise((resolve) => window.setTimeout(resolve, 10));
        state.updateDraftField('content.rsvp.enabled', false);
        await new Promise((resolve) => window.setTimeout(resolve, 10));
        assert.equal(messages.at(-1).payload.enabledSections.includes('rsvp'), false);
        state.updateDraftField('content.rsvp.enabled', true);
        await new Promise((resolve) => window.setTimeout(resolve, 10));
        assert.equal(messages.at(-1).payload.enabledSections.includes('rsvp'), true);
        assert.equal(messages.filter(({ type }) => type === RENDER).length, 1);
        assert.equal(messages.filter(({ type }) => type === UPDATE).length, 3);
        assert.equal(iframeLoads, 0);
    } finally {
        cleanup();
        harness.close();
    }
});

test('30. editar RSVP marca únicamente el dirty general', () => {
    const state = readyState();
    state.updateDraftField('content.rsvp.title', 'Nuevo título');
    assert.equal(state.getSnapshot().ui.isDirty, true);
    assert.equal(state.getSnapshot().ui.draftDirty, true);
});

test('31. editar RSVP deja mediaDirty intacto', () => {
    const state = readyState();
    state.updateDraftField('content.rsvp.message', 'Nuevo mensaje');
    assert.equal(state.getSnapshot().ui.mediaDirty, false);
});

test('32. switch, método, teléfono, textarea y policy mantienen scrollTop', { concurrency: false }, () => {
    const harness = installDom('<div id="invitation-builder-root"><section id="builder-editor"><div id="editors"></div></section></div>');
    const state = readyState();
    const cleanup = initSectionCopyEditors({ container: document.getElementById('editors'), state });
    try {
        const scroller = document.getElementById('builder-editor');
        scroller.scrollTop = 970;
        const actions = [
            ['content.rsvp.enabled', 'change', false],
            ['content.rsvp.enabled', 'change', true],
            ['content.rsvp.method', 'change', 'whatsapp'],
            ['content.rsvp.whatsapp.phone', 'input', '+52 844 123 4567'],
            ['content.rsvp.whatsapp.message', 'input', 'Mensaje'],
            ['content.rsvp.guestPolicy', 'change', 'select-up-to-assigned']
        ];
        actions.forEach(([fieldPath, eventName, value]) => {
            const control = document.querySelector(`[data-draft-path="${fieldPath}"]`);
            if (control.type === 'checkbox') control.checked = value;
            else control.value = value;
            control.dispatchEvent(new window.Event(eventName, { bubbles: true }));
            assert.equal(scroller.scrollTop, 970, fieldPath);
        });
        state.toggleSection('rsvp', false);
        assert.equal(scroller.scrollTop, 970, 'toggle section OFF');
        state.toggleSection('rsvp', true);
        assert.equal(scroller.scrollTop, 970, 'toggle section ON');
    } finally {
        cleanup();
        harness.close();
    }
});

test('33. regresión Multimedia: RSVP no muta assets, IDs ni mediaDirty', () => {
    const state = readyState({ packageId: 'premium' });
    state.toggleSection('gallery', true);
    const media = state.addMediaAsset('gallery', {
        role: 'gallery', kind: 'image', originalName: 'foto.webp', mimeType: 'image/webp', size: 1000,
        width: 1200, height: 1500, previewUrl: 'blob:https://eventora.local/foto', status: 'ready'
    }).entity;
    const before = structuredClone(state.getSnapshot().draft.media);
    state.markMediaPersisted();
    state.updateDraftField('content.rsvp.title', 'RSVP independiente');
    assert.deepEqual(state.getSnapshot().draft.media, before);
    assert.equal(state.getSnapshot().draft.media.gallery[0].id, media.id);
    assert.equal(state.getSnapshot().ui.mediaDirty, false);
});

test('34. regresión Fase 3: logística y WhatsApp genérico permanecen intactos', () => {
    const state = readyState({ packageId: 'prestige' });
    state.updateLocation('LOC-LOCAL-001', { venueName: 'Centro Cultural', mapsUrl: 'https://maps.google.com/' });
    const gift = state.addGift({ type: 'store', title: 'Tienda', url: 'https://example.com/' }).entity;
    const link = state.addLink({ type: 'whatsapp', label: 'Contacto', phone: '+52 844 765 4321', message: 'Información' }).entity;
    const before = { locations: state.getSnapshot().draft.locations, gifts: state.getSnapshot().draft.gifts, links: state.getSnapshot().draft.links };
    configureRsvp(state);
    const after = state.getSnapshot().draft;
    assert.deepEqual({ locations: after.locations, gifts: after.gifts, links: after.links }, before);
    assert.ok(after.gifts.some(({ id }) => id === gift.id));
    assert.ok(after.links.some(({ id }) => id === link.id));
});

test('35. el root del Builder permanece inmutable durante edición y toggle RSVP', { concurrency: false }, () => {
    const harness = installDom('<div id="invitation-builder-root"><section id="builder-editor"><div id="editors"></div></section></div>');
    const root = document.getElementById('invitation-builder-root');
    const state = readyState();
    const cleanup = initSectionCopyEditors({ container: document.getElementById('editors'), state });
    try {
        state.updateDraftField('content.rsvp.title', 'Sin reemplazar root');
        state.toggleSection('rsvp', false);
        state.toggleSection('rsvp', true);
        assert.strictEqual(document.getElementById('invitation-builder-root'), root);
        assert.equal(root.isConnected, true);
        assert.ok(createTemplateSectionContract('custom', [{ id: 'rsvp', previewSelectors: [] }]).sections[0].previewSelectors.length);
        assert.ok(THEME_REGISTRY.find(({ id }) => id === 'custom').capabilities.includes('rsvp'));
    } finally {
        cleanup();
        harness.close();
    }
});
