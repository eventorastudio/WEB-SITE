import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
    INVITATION_CONTENT_SCHEMA_VERSION,
    INVITATION_DRAFT_SCHEMA_VERSION,
    INVITATION_EDITABLE_FIELDS,
    PREVIEW_SEMANTIC_FALLBACKS,
    getDraftValue
} from '../admin/invitations/core/content-schema.js';
import { SECTION_EDITOR_REGISTRY } from '../admin/invitations/core/section-editor-registry.js';
import { InvitationBuilderState, createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import { validateInvitationDraft } from '../admin/invitations/core/builder-validation.js';
import { SECTION_REGISTRY } from '../admin/invitations/core/section-registry.js';
import { COLLECTION_THEMES } from '../admin/invitations/core/theme-registry.js';
import {
    TEMPLATE_BINDING_REGISTRY,
    applyTemplateContentBindings,
    createTemplateSectionContract,
    validateTemplateBindingAdapter
} from '../admin/invitations/core/template-binding-registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('el contrato canónico Fase 2 está versionado y precarga únicamente datos reales del evento', () => {
    const draft = createInvitationDraft('EVT-0001', {
        nombreEvento: 'María & Fernando',
        tipoEvento: 'Boda',
        fecha: '2027-11-15',
        hora: '19:00',
        ciudad: 'Saltillo',
        estado: 'Coahuila'
    });

    assert.equal(draft.schemaVersion, INVITATION_DRAFT_SCHEMA_VERSION);
    assert.equal(draft.contentSchemaVersion, INVITATION_CONTENT_SCHEMA_VERSION);
    assert.equal(draft.packageId, null);
    assert.equal(draft.meta.packageSource, 'unselected');
    assert.deepEqual(draft.content.identity, {
        primaryName: 'María & Fernando',
        secondaryName: '',
        eventType: 'Boda',
        phrase: ''
    });
    assert.deepEqual(draft.content.schedule, { date: '2027-11-15', time: '19:00' });
    assert.deepEqual(draft.content.place, { city: 'Saltillo', state: 'Coahuila' });
    assert.equal(JSON.stringify(draft).includes(PREVIEW_SEMANTIC_FALLBACKS.welcomeTitle), false);
});

test('un paquete válido se precarga y uno ausente exige selección local explícita', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Evento', fecha: '2027-11-15' });
    assert.equal(state.getSnapshot().draft.packageId, null);
    assert.deepEqual(state.toggleSection('countdown', true), { ok: false, code: 'builder/section-not-allowed' });

    assert.deepEqual(state.setPackage('premium'), { ok: true, changed: true });
    assert.equal(state.getSnapshot().draft.packageId, 'premium');
    assert.equal(state.getSnapshot().draft.meta.packageSource, 'local-selection');

    const stored = createInvitationDraft('EVT-0002', { nombreEvento: 'Evento', paquete: 'Prestige' });
    assert.equal(stored.packageId, 'prestige');
    assert.equal(stored.meta.packageSource, 'event');
});

test('los paths editables actualizan el draft, validan sin bloquear y marcan cambios locales', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Evento', fecha: '2027-11-15', paquete: 'Prestige' });
    assert.equal(state.getSnapshot().ui.isDirty, false);

    state.updateDraftFields({
        'content.identity.primaryName': 'Alejandra Fernanda & Maximiliano Sebastián',
        'content.schedule.time': '25:99',
        'content.identity.phrase': 'Nos encantará compartir este día contigo.',
        'locations.0.name': 'Hacienda del Valle'
    });
    const snapshot = state.getSnapshot();
    assert.equal(snapshot.ui.isDirty, true);
    assert.equal(snapshot.draft.content.identity.primaryName, 'Alejandra Fernanda & Maximiliano Sebastián');
    assert.equal(snapshot.draft.locations[0].name, 'Hacienda del Valle');
    assert.equal(snapshot.ui.validationErrors['content.schedule.time'], 'La hora no es válida.');
    assert.throws(() => state.updateDraftField('__proto__.polluted', 'sí'), /unknown-editable-path/);
});

test('cambiar tema, sección o paquete nunca muta ni elimina el contenido de la sección', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'María', fecha: '2027-11-15', paquete: 'Prestige' });
    state.setTheme('champagne');
    state.toggleSection('welcome-story', true);
    state.toggleSection('itinerary', true);
    state.updateDraftFields({
        'content.welcome.story': 'Una historia que debe permanecer.',
        'content.itinerary.intro': 'Recepción, cena y baile.'
    });
    const content = state.getSnapshot().draft.content;

    state.setTheme('luxury');
    state.setTheme('aloha');
    assert.deepEqual(state.getSnapshot().draft.content, content);

    state.toggleSection('welcome-story', false);
    assert.equal(state.getSnapshot().draft.content.welcome.story, 'Una historia que debe permanecer.');
    state.toggleSection('welcome-story', true);
    assert.equal(state.getSnapshot().draft.content.welcome.story, 'Una historia que debe permanecer.');

    state.setPackage('premium');
    assert.ok(state.getUnavailableEnabledSections().includes('itinerary'));
    assert.equal(state.getSnapshot().draft.content.itinerary.intro, 'Recepción, cena y baile.');
    state.setPackage('prestige');
    assert.equal(state.getSnapshot().draft.content.itinerary.intro, 'Recepción, cena y baile.');
});

test('SECTION_EDITOR_REGISTRY cubre cada sección y todos sus fields pertenecen al schema', () => {
    assert.deepEqual(Object.keys(SECTION_EDITOR_REGISTRY).sort(), SECTION_REGISTRY.map(({ id }) => id).sort());
    Object.entries(SECTION_EDITOR_REGISTRY).forEach(([sectionId, editor]) => {
        assert.equal(editor.title.length > 0, true, sectionId);
        editor.fields.forEach(({ path: fieldPath }) => {
            assert.ok(INVITATION_EDITABLE_FIELDS[fieldPath], `${sectionId}/${fieldPath} no pertenece al schema`);
        });
    });
});

test('validación canónica reconoce nombre, fecha, hora y deadline inválidos', () => {
    const draft = createInvitationDraft('EVT-0001', {});
    draft.content.schedule.time = '31:80';
    draft.content.rsvp.deadline = '2027-02-31';
    const errors = validateInvitationDraft(draft);
    assert.ok(errors['content.identity.primaryName']);
    assert.ok(errors['content.schedule.date']);
    assert.ok(errors['content.schedule.time']);
    assert.ok(errors['content.rsvp.deadline']);
});

test('los once adapters resuelven bindings, usan fallback demo y aplican texto seguro', async () => {
    assert.equal(Object.keys(TEMPLATE_BINDING_REGISTRY).length, 11);
    for (const theme of COLLECTION_THEMES) {
        const html = await readFile(path.join(ROOT, theme.templatePath.replace(/^\//, '')), 'utf8');
        const dom = new JSDOM(html);
        try {
            const document = dom.window.document;
            const adapter = TEMPLATE_BINDING_REGISTRY[theme.id];
            assert.deepEqual(validateTemplateBindingAdapter(document, theme.id), { valid: true, missing: [] });

            const identity = document.querySelector(adapter.identity);
            const demoMarkup = identity.innerHTML;
            const draft = createInvitationDraft('EVT-0001', {});
            applyTemplateContentBindings(document, theme.id, draft);
            assert.equal(identity.innerHTML, demoMarkup, `${theme.id} debe conservar su fallback demo`);
            assert.equal(draft.content.identity.primaryName, '');

            const scriptCount = document.querySelectorAll('script').length;
            const malicious = '<script>alert(1)</script>';
            draft.content.identity.primaryName = malicious;
            draft.content.identity.secondaryName = 'Familia Hernández Rodríguez';
            draft.content.schedule.date = '2027-11-15';
            draft.content.schedule.time = '19:00';
            draft.content.place.city = 'Saltillo';
            draft.content.identity.phrase = 'Nos encantará compartir este día contigo.';
            applyTemplateContentBindings(document, theme.id, draft);

            assert.ok(identity.textContent.toLowerCase().includes(malicious.toLowerCase()), `${theme.id} debe tratar HTML como texto`);
            assert.equal(document.querySelectorAll('script').length, scriptCount, `${theme.id} no debe crear scripts`);
            assert.match(document.querySelector(adapter.eventLine).textContent, /2027|NOVIEMBRE/i);

            draft.content.identity.primaryName = '';
            draft.content.identity.secondaryName = '';
            applyTemplateContentBindings(document, theme.id, draft);
            assert.equal(identity.innerHTML, demoMarkup, `${theme.id} debe restaurar el fallback al vaciar`);

            const contract = createTemplateSectionContract(theme.id, SECTION_REGISTRY);
            contract.sections.forEach(({ id, previewSelectors }) => {
                previewSelectors.forEach((selector) => {
                    assert.doesNotThrow(() => document.querySelectorAll(selector), `${theme.id}/${id}`);
                    assert.ok(document.querySelector(selector), `${theme.id}/${id} no resolvió ${selector}`);
                });
            });
            contract.groups.forEach(({ selector }) => assert.ok(document.querySelector(selector), `${theme.id} no resolvió group ${selector}`));
        } finally {
            dom.window.close();
        }
    }
});

test('el schema permite consultar paths sin exponer referencias mutables', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Evento', fecha: '2027-11-15', paquete: 'Premium' });
    const snapshot = state.getSnapshot();
    snapshot.draft.content.identity.primaryName = 'Mutado afuera';
    assert.equal(getDraftValue(state.getSnapshot().draft, 'content.identity.primaryName'), 'Evento');
});
