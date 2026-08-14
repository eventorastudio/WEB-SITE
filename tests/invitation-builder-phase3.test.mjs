import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { InvitationBuilderState, createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import {
    getCollectionMode,
    getRenderableLocations,
    packageAllowsMultipleLocations
} from '../admin/invitations/core/logistics-schema.js';
import {
    SAFE_URL_PROTOCOLS,
    buildGoogleCalendarUrl,
    buildWhatsAppUrl,
    parseSafeUrl
} from '../admin/invitations/core/safe-url.js';
import { validateInvitationDraft } from '../admin/invitations/core/builder-validation.js';
import { SECTION_EDITOR_REGISTRY } from '../admin/invitations/core/section-editor-registry.js';
import { COLLECTION_THEMES } from '../admin/invitations/core/theme-registry.js';
import { applyPhase3ContentBindings, applyTemplateContentBindings } from '../admin/invitations/core/template-binding-registry.js';
import { initLocationEditor } from '../admin/invitations/editors/location-editor.js';
import { initPreviewController } from '../admin/invitations/modules/preview-controller.js';
import { PREVIEW_MESSAGE_TYPES } from '../admin/invitations/core/builder-events.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createPhase3State() {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', {
        nombreEvento: 'Evento Fase 3',
        tipoEvento: 'Celebración',
        fecha: '2028-11-11',
        hora: '18:30',
        ciudad: 'Saltillo',
        estado: 'Coahuila',
        paquete: 'Prestige'
    });
    state.setTheme('champagne');
    ['location', 'itinerary', 'dress-code', 'gift-registry'].forEach((section) => state.toggleSection(section, true));
    return state;
}

function configureAcceptanceData(state) {
    state.updateDraftFields({
        'content.location.title': 'Ubicaciones',
        'content.location.intro': 'Te esperamos en estos lugares.',
        'content.itinerary.title': 'Itinerario',
        'content.dressCode.title': 'Código de vestimenta',
        'content.dressCode.name': 'Formal',
        'content.dressCode.description': 'Traje oscuro y vestido largo.',
        'content.dressCode.note': 'Evita tonos blancos.',
        'content.gifts.title': 'Mesa de regalos'
    });
    state.updateLocation('LOC-LOCAL-001', {
        type: 'ceremony', title: 'Ceremonia religiosa', venueName: 'Catedral de Santiago',
        address: 'Calle Ejemplo 100, Saltillo', city: 'Saltillo', state: 'Coahuila', time: '19:00',
        mapsUrl: 'https://maps.google.com/?q=Catedral+de+Santiago'
    });
    const second = state.addLocation({
        type: 'reception', title: 'Recepción', venueName: 'Hacienda San José',
        address: 'Carretera Ejemplo 200, Saltillo', time: '20:30',
        mapsUrl: 'https://maps.google.com/?q=Hacienda+San+Jose', wazeUrl: 'https://waze.com/ul'
    }).entity;
    const activities = [
        ['18:30', 'Llegada de invitados', ''], ['19:00', 'Ceremonia', 'LOC-LOCAL-001'],
        ['20:30', 'Recepción', second.id], ['21:00', 'Cena', second.id],
        ['22:30', 'Vals', second.id], ['23:00', 'Fiesta', second.id]
    ];
    activities.forEach(([time, title, locationId]) => state.addItineraryItem({ time, title, locationId }));
    state.addDressColor('recommendedColors', { name: 'Champagne', value: '#E6D2AE' });
    state.addDressColor('recommendedColors', { name: 'Azul noche', value: '#17213A' });
    state.addDressColor('avoidedColors', { name: 'Blanco', value: '#FFFFFF' });
    state.addGift({ type: 'store', name: 'Mesa de regalos ejemplo', url: 'https://example.com/' });
    state.addGift({
        type: 'transfer', name: 'Transferencia', description: 'Opción de prueba',
        details: { bank: 'Banco Ejemplo', beneficiary: 'Persona de prueba' }
    });
    state.addAccommodation({
        name: 'Hotel Eventora', description: 'Hospedaje sugerido para nuestros invitados.',
        reservationUrl: 'https://example.com/hotel', mapsUrl: 'https://maps.google.com/?q=Hotel+Eventora'
    });
    state.addLink({ type: 'calendar', label: 'Agregar al calendario' });
    state.addLink({ type: 'whatsapp', label: 'WhatsApp', phone: '+52 844 123 4567', message: 'Hola, deseo información.' });
    return second;
}

test('Fase 3 usa raíces canónicas, IDs estables y objetos normalizados', () => {
    const draft = createInvitationDraft('EVT-0001', { nombreLugar: 'Lugar inicial' });
    assert.deepEqual(Object.keys(draft.locations[0]), [
        'id', 'type', 'title', 'venueName', 'address', 'city', 'state', 'time',
        'mapsUrl', 'wazeUrl', 'description', 'notes'
    ]);
    assert.equal(draft.locations[0].id, 'LOC-LOCAL-001');
    assert.ok(Array.isArray(draft.itinerary));
    assert.ok(Array.isArray(draft.gifts));
    assert.ok(Array.isArray(draft.accommodations));
    assert.ok(Array.isArray(draft.links));
    assert.ok(Array.isArray(draft.content.dressCode.recommendedColors));
    assert.equal(getCollectionMode(draft, 'locations'), 'configured');
});

test('múltiples ubicaciones derivan del contrato y el downgrade conserva datos superiores', () => {
    const state = createPhase3State();
    assert.equal(packageAllowsMultipleLocations('premium'), false);
    assert.equal(packageAllowsMultipleLocations('prestige'), true);
    const second = state.addLocation({ venueName: 'Hacienda San José' });
    assert.equal(second.ok, true);
    assert.match(second.entity.id, /^LOC-LOCAL-002$/);
    state.updateLocation(second.entity.id, { id: 'LOC-HACKED-999', title: 'Recepción' });
    assert.equal(state.getSnapshot().draft.locations[1].id, 'LOC-LOCAL-002');
    state.moveLocation(second.entity.id, 'up');
    assert.equal(state.getSnapshot().draft.locations[0].id, second.entity.id);

    state.setPackage('premium');
    const premiumDraft = state.getSnapshot().draft;
    assert.equal(premiumDraft.locations.length, 2);
    assert.equal(getRenderableLocations(premiumDraft).length, 1);
    assert.deepEqual(state.addLocation(), { ok: false, code: 'builder/multiple-locations-not-allowed' });
    state.setPackage('prestige');
    assert.equal(getRenderableLocations(state.getSnapshot().draft).length, 2);
});

test('el itinerario conserva orden y al borrar location limpia locationId sin borrar actividades', () => {
    const state = createPhase3State();
    const second = state.addLocation({ venueName: 'Hacienda San José' }).entity;
    const ceremony = state.addItineraryItem({ time: '19:00', title: 'Ceremonia', locationId: 'LOC-LOCAL-001' }).entity;
    const dinner = state.addItineraryItem({ time: '21:00', title: 'Cena', locationId: second.id }).entity;
    state.moveItineraryItem(dinner.id, 'up');
    assert.deepEqual(state.getSnapshot().draft.itinerary.map(({ title }) => title), ['Cena', 'Ceremonia']);
    const result = state.removeLocation(second.id);
    assert.equal(result.clearedReferences, 1);
    const snapshot = state.getSnapshot();
    assert.equal(snapshot.draft.itinerary.length, 2);
    assert.equal(snapshot.draft.itinerary.find(({ id }) => id === dinner.id).locationId, '');
    assert.equal(snapshot.draft.itinerary.find(({ id }) => id === ceremony.id).locationId, 'LOC-LOCAL-001');
    assert.equal(Object.keys(snapshot.ui.validationErrors).some((path) => path.endsWith('.locationId')), false);
});

test('Dress Code, gifts, hotel y links soportan add/edit/delete/reorder sin persistencia', () => {
    const state = createPhase3State();
    const colorA = state.addDressColor('recommendedColors', { name: 'Champagne', value: '#E6D2AE' }).entity;
    const colorB = state.addDressColor('recommendedColors', { name: 'Azul', value: '#17213A' }).entity;
    state.moveDressColor('recommendedColors', colorB.id, 'up');
    state.updateDressColor('recommendedColors', colorA.id, { name: 'Champagne suave' });
    assert.deepEqual(state.getSnapshot().draft.content.dressCode.recommendedColors.map(({ name }) => name), ['Azul', 'Champagne suave']);
    state.removeDressColor('recommendedColors', colorB.id);

    const giftA = state.addGift({ name: 'Tienda', url: 'https://example.com/' }).entity;
    const giftB = state.addGift({ type: 'transfer', name: 'Transferencia', details: { bank: 'Banco Ejemplo' } }).entity;
    state.moveGift(giftB.id, 'up');
    state.updateGift(giftA.id, { reference: 'REF-TEST' });
    assert.equal(state.getSnapshot().draft.gifts[1].reference, 'REF-TEST');

    const hotel = state.addAccommodation({ name: 'Hotel Eventora' }).entity;
    assert.equal(state.addAccommodation().code, 'builder/multiple-accommodations-not-contracted');
    state.updateAccommodation(hotel.id, { reservationUrl: 'https://example.com/hotel' });
    const link = state.addLink({ type: 'instagram', label: 'Instagram', url: 'https://instagram.com/eventora' }).entity;
    state.updateLink(link.id, { description: 'Perfil del evento' });
    assert.equal(state.getSnapshot().draft.accommodations.length, 1);
    assert.equal(state.getSnapshot().draft.links[0].description, 'Perfil del evento');
});

test('la política central rechaza protocolos peligrosos y deriva Calendar/WhatsApp', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,test', 'vbscript:msgbox(1)']) {
        assert.equal(parseSafeUrl(value).ok, false);
    }
    assert.equal(parseSafeUrl('https://example.com/').ok, true);
    assert.deepEqual(SAFE_URL_PROTOCOLS.web, ['https:']);
    const state = createPhase3State();
    state.updateLocation('LOC-LOCAL-001', { mapsUrl: 'javascript:alert(1)', wazeUrl: 'data:text/html,test' });
    const errors = validateInvitationDraft(state.getSnapshot().draft);
    assert.ok(errors['locations.LOC-LOCAL-001.mapsUrl']);
    assert.ok(errors['locations.LOC-LOCAL-001.wazeUrl']);
    assert.match(buildGoogleCalendarUrl(state.getSnapshot().draft), /^https:\/\/calendar\.google\.com\//);
    assert.match(buildWhatsAppUrl({ phone: '+52 844 123 4567', message: 'Hola' }), /^https:\/\/wa\.me\/528441234567\?text=Hola$/);
});

test('tema y toggles no mutan ninguna colección logística', () => {
    const state = createPhase3State();
    configureAcceptanceData(state);
    const before = state.getSnapshot().draft;
    state.setTheme('luxury');
    state.setTheme('garden');
    state.toggleSection('itinerary', false);
    assert.equal(state.getSnapshot().draft.enabledSections.includes('itinerary'), false);
    assert.equal(state.getSnapshot().draft.itinerary.length, 6);
    state.toggleSection('itinerary', true);
    state.toggleSection('location', false);
    assert.equal(state.getSnapshot().draft.locations.length, 2);
    state.toggleSection('location', true);
    const after = state.getSnapshot().draft;
    for (const key of ['locations', 'itinerary', 'gifts', 'accommodations', 'links']) assert.deepEqual(after[key], before[key]);
    assert.deepEqual(after.content.dressCode, before.content.dressCode);
});

test('Personalizada consume locations, itinerary, Dress Code, gifts y hotel desde el mismo draft', () => {
    const dom = new JSDOM(`
        <main>
            <section data-prestige-feature="multiple-locations"></section>
            <section data-prestige-feature="itinerary"></section>
            <section data-prestige-feature="dress-code"></section>
            <section data-prestige-feature="gift-registry"></section>
        </main>
    `);
    try {
        const state = createPhase3State();
        configureAcceptanceData(state);
        applyPhase3ContentBindings(dom.window.document, 'custom', state.getSnapshot().draft);
        const text = dom.window.document.body.textContent.replace(/\s+/g, ' ');
        for (const expected of ['Catedral de Santiago', 'Llegada de invitados', 'Formal', 'Mesa de regalos ejemplo', 'Hotel Eventora']) {
            assert.ok(text.includes(expected), expected);
        }
        assert.equal(dom.window.document.querySelectorAll('[data-builder-phase3-section]').length, 4);
    } finally {
        dom.window.close();
    }
});

test('los once adapters consumen Fase 3 sin mezclar sedes demo ni crear href inseguros', async () => {
    const state = createPhase3State();
    configureAcceptanceData(state);
    const draft = state.getSnapshot().draft;
    for (const theme of COLLECTION_THEMES) {
        const html = await readFile(path.join(ROOT, theme.templatePath.replace(/^\//, '')), 'utf8');
        const dom = new JSDOM(html);
        try {
            dom.window.document.querySelectorAll('script, audio, #event-music, #music-control, #opening').forEach((node) => node.remove());
            applyTemplateContentBindings(dom.window.document, theme.id, draft);
            const text = dom.window.document.body.textContent.replace(/\s+/g, ' ');
            for (const expected of ['Catedral de Santiago', 'Hacienda San José', 'Llegada de invitados', 'Traje oscuro', 'Mesa de regalos ejemplo', 'Hotel Eventora']) {
                assert.ok(text.includes(expected), `${theme.id} no mostró ${expected}`);
            }
            assert.equal(dom.window.document.querySelectorAll('[data-builder-phase3-section="location"] [data-entity-id]').length >= 2, true, theme.id);
            const hrefs = [...dom.window.document.querySelectorAll('[data-builder-phase3-section] a[href]')].map((anchor) => anchor.href);
            assert.ok(hrefs.length >= 5, theme.id);
            assert.ok(hrefs.every((href) => href.startsWith('https://')), theme.id);
        } finally {
            dom.window.close();
        }
    }
});

test('SECTION_EDITOR_REGISTRY integra los seis editores de Fase 3', () => {
    assert.deepEqual(SECTION_EDITOR_REGISTRY.location.advancedEditors, ['locations', 'accommodations', 'links']);
    assert.deepEqual(SECTION_EDITOR_REGISTRY.itinerary.advancedEditors, ['itinerary']);
    assert.deepEqual(SECTION_EDITOR_REGISTRY['dress-code'].advancedEditors, ['dress-code']);
    assert.deepEqual(SECTION_EDITOR_REGISTRY['gift-registry'].advancedEditors, ['gifts']);
});

test('el editor de ubicaciones conserva scrollTop al agregar, editar, reordenar y confirmar eliminación', { concurrency: false }, () => {
    const dom = new JSDOM('<div id="invitation-builder-root"><div id="builder-editor"><div id="target"></div></div></div>', { pretendToBeVisual: true });
    const previous = { window: globalThis.window, document: globalThis.document };
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    try {
        const scroller = document.getElementById('builder-editor');
        const root = document.getElementById('invitation-builder-root');
        scroller.scrollTop = 420;
        const state = createPhase3State();
        const cleanup = initLocationEditor({ container: document.getElementById('target'), state });
        document.querySelector('[data-entity-action="add"]').click();
        assert.equal(scroller.scrollTop, 420);
        assert.equal(root.scrollTop, 0);
        const cards = [...document.querySelectorAll('[data-entity-id]')];
        const title = cards[1].querySelector('[data-entity-field="title"]');
        title.value = 'Recepción';
        title.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.equal(scroller.scrollTop, 420);
        assert.equal(root.scrollTop, 0);
        cards[1].querySelector('[data-entity-action="up"]').click();
        assert.equal(scroller.scrollTop, 420);
        assert.equal(root.scrollTop, 0);
        const first = document.querySelector('[data-entity-id]');
        first.querySelector('[data-entity-action="delete"]').click();
        assert.equal(first.querySelector('.entity-delete-confirmation').hidden, false);
        first.querySelector('[data-entity-action="confirm-delete"]').click();
        assert.equal(scroller.scrollTop, 420);
        assert.equal(root.scrollTop, 0);
        assert.equal(state.getSnapshot().draft.locations.length, 1);
        cleanup();
    } finally {
        globalThis.window = previous.window;
        globalThis.document = previous.document;
        dom.window.close();
    }
});

test('entities-changed envía UPDATE completo, no recarga el iframe y filtra el downgrade', { concurrency: false }, async () => {
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
            if (message.type === PREVIEW_MESSAGE_TYPES.RENDER) {
                window.dispatchEvent(new dom.window.MessageEvent('message', {
                    origin,
                    source: frame.contentWindow,
                    data: {
                        type: PREVIEW_MESSAGE_TYPES.RENDERED,
                        requestId: message.requestId,
                        payload: { themeId: message.payload.theme.id, themeName: message.payload.theme.name }
                    }
                }));
            }
        };
        let loadCount = 0;
        frame.addEventListener('load', () => { loadCount += 1; });
        const state = createPhase3State();
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
        state.addItineraryItem({ time: '18:30', title: 'Llegada' });
        await new Promise((resolve) => window.setTimeout(resolve, 10));
        const update = messages.filter(({ type }) => type === PREVIEW_MESSAGE_TYPES.UPDATE).at(-1);
        assert.ok(update);
        assert.equal(update.payload.draft.itinerary.length, 1);
        assert.ok(Array.isArray(update.payload.draft.locations));
        assert.ok(Array.isArray(update.payload.draft.gifts));
        assert.ok(Array.isArray(update.payload.draft.accommodations));
        assert.ok(Array.isArray(update.payload.draft.links));
        const sourceAfterUpdate = frame.getAttribute('src');

        state.setPackage('premium');
        await new Promise((resolve) => window.setTimeout(resolve, 10));
        const downgrade = messages.filter(({ type }) => type === PREVIEW_MESSAGE_TYPES.UPDATE).at(-1);
        assert.equal(downgrade.payload.enabledSections.includes('itinerary'), false);
        assert.equal(downgrade.payload.draft.itinerary.length, 1);
        assert.equal(frame.getAttribute('src'), sourceAfterUpdate);
        assert.ok(loadCount <= 1);
        cleanup();
    } finally {
        globalThis.window = previous.window;
        globalThis.document = previous.document;
        dom.window.close();
    }
});

test('Fase 3 sigue sin writes, Storage, RSVP real, autosave ni publicación', async () => {
    const files = [
        'admin/invitations/core/builder-state.js', 'admin/invitations/core/logistics-schema.js',
        'admin/invitations/core/safe-url.js', 'admin/invitations/editors/logistics-editor.js',
        'admin/invitations/modules/preview-controller.js', 'admin/invitations/preview/frame.js'
    ];
    const source = (await Promise.all(files.map((file) => readFile(path.join(ROOT, file), 'utf8')))).join('\n');
    assert.doesNotMatch(source, /\b(?:addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction|uploadBytes|firebase-storage)\b/);
    assert.doesNotMatch(source, /saveDraft|autosave|publishInvitation/i);
});

test('preview móvil evita overflow grave y toda acción queda interceptada por Vista del editor', async () => {
    const [css, frame] = await Promise.all([
        readFile(path.join(ROOT, 'admin/invitations/preview/frame.css'), 'utf8'),
        readFile(path.join(ROOT, 'admin/invitations/preview/frame.js'), 'utf8')
    ]);
    assert.match(css, /html, body \{[^}]*overflow-x: clip;/s);
    assert.match(css, /@media \(max-width: 480px\)/);
    assert.match(css, /\.builder-phase3-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(frame, /function interceptNavigation/);
    assert.match(frame, /showBuilderActionNotice/);
    assert.match(frame, /VISTA DEL EDITOR/);
    assert.doesNotMatch(frame, /window\.(?:open|location\.assign|location\.replace)/);
});
