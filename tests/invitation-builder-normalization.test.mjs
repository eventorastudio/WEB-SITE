import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
    INVITATION_DRAFT_SCHEMA_VERSION,
    INVITATION_EDITABLE_FIELDS,
    getTouchedDraftPaths
} from '../admin/invitations/core/content-schema.js';
import { InvitationBuilderState, createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import { GENERAL_INFORMATION_FIELDS, SECTION_EDITOR_REGISTRY } from '../admin/invitations/core/section-editor-registry.js';
import { COLLECTION_THEMES } from '../admin/invitations/core/theme-registry.js';
import {
    TEMPLATE_BINDING_REGISTRY,
    applyTemplateContentBindings,
    getPhase2BindingCoverage,
    sectionHasRealContent
} from '../admin/invitations/core/template-binding-registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEMO_LEAKAGE = Object.freeze({
    aloha: ['RENATTA', 'Casa Palma', 'Terraza Coral', 'quince vueltas', 'XV 27'],
    luxury: ['Victoria', 'Alejandro', 'Templo de San Francisco', 'Casa Madero'],
    botanical: ['Regina', 'Sebastián', 'Capilla del Bosque', 'Jardín Casa Oliva'],
    midnight: ['VALENTINA', 'Gran Salón Metropolitano', 'SKY ROOM', 'V/15'],
    romance: ['Sofía', 'Mateo', 'Querida vida', 'Parroquia del Sagrado Corazón', 'Hacienda San Carlos'],
    minimal: ['CAMILA', 'DIEGO', 'Casa Estudio Norte', 'Galería Sur'],
    celestial: ['Isabella', 'Santiago', 'Capilla del Cielo', 'Observatorio Alba'],
    vintage: ['Emilia', 'Nicolás', 'Hacienda San Lorenzo', 'ADMIT TO THE WEDDING'],
    garden: ['Julieta', 'Tomás', 'El Invernadero', 'El Gran Jardín'],
    champagne: ['Elena', 'Gabriel', 'Patio del Laurel', 'Salón de Cristal', 'THE WEDDING EDIT'],
    'neon-party': ['ALEXA', 'FORO TENDENZA', 'THE ROOFTOP', 'Quince años', 'A15']
});

async function createTemplate(theme) {
    const html = await readFile(path.join(ROOT, theme.templatePath.replace(/^\//, '')), 'utf8');
    const dom = new JSDOM(html);
    dom.window.document.querySelectorAll('script, audio, #event-music, #music-control, #opening').forEach((node) => node.remove());
    return dom;
}

function isVisible(node, boundary = null) {
    for (let current = node; current && current !== boundary; current = current.parentElement) {
        if (current.hidden) return false;
    }
    return true;
}

function visibleText(root) {
    return [...root.querySelectorAll('h1,h2,h3,p,blockquote,small,span,strong,b,em,a,button')]
        .filter((node) => isVisible(node, root.parentElement))
        .map((node) => node.textContent.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .join(' | ');
}

function distinctiveValues() {
    return Object.fromEntries(Object.entries(INVITATION_EDITABLE_FIELDS).map(([fieldPath, definition], index) => {
        if (definition.type === 'date') return [fieldPath, '2027-11-15'];
        if (definition.type === 'time') return [fieldPath, '19:00'];
        return [fieldPath, `REAL-${String(index + 1).padStart(2, '0')}-${fieldPath.replace(/[^a-z0-9]+/gi, '-').toUpperCase()}`];
    }));
}

test('schema v4 distingue untouched, value y explicit clear sin persistencia', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Evento real', paquete: 'Prestige' });
    assert.equal(INVITATION_DRAFT_SCHEMA_VERSION, 4);
    assert.deepEqual(state.getSnapshot().draft.meta.touchedPaths, []);

    const firstEmpty = state.updateDraftField('content.welcome.eyebrow', '');
    assert.equal(firstEmpty.changed, true);
    assert.ok(getTouchedDraftPaths(state.getSnapshot().draft).includes('content.welcome.eyebrow'));
    assert.equal(sectionHasRealContent(state.getSnapshot().draft, 'welcome-story'), true);
    assert.equal(state.updateDraftField('content.welcome.eyebrow', '').changed, false);

    state.updateDraftField('content.identity.primaryName', '');
    assert.equal(state.getSnapshot().draft.content.identity.primaryName, '');
    assert.ok(getTouchedDraftPaths(state.getSnapshot().draft).includes('content.identity.primaryName'));
});

test('Romance reemplaza su narrativa demo y explicit clear no restaura el fallback', async () => {
    const theme = COLLECTION_THEMES.find(({ id }) => id === 'romance');
    const dom = await createTemplate(theme);
    try {
        const state = new InvitationBuilderState();
        state.initialize('EVT-0001', { paquete: 'Prestige' });
        state.updateDraftFields({
            'content.welcome.eyebrow': 'Nuestra historia',
            'content.welcome.title': 'Donde comenzó todo',
            'content.welcome.message': 'Gracias por acompañarnos.',
            'content.welcome.story': 'Nos conocimos hace años y hoy celebramos este nuevo capítulo.'
        });
        applyTemplateContentBindings(dom.window.document, 'romance', state.getSnapshot().draft);
        const welcome = dom.window.document.querySelector('.love-note');
        const rendered = visibleText(welcome);
        assert.match(rendered, /Nuestra historia/);
        assert.match(rendered, /Donde comenzó todo/);
        assert.match(rendered, /Gracias por acompañarnos/);
        assert.match(rendered, /Nos conocimos hace años/);
        assert.doesNotMatch(rendered, /Querida vida|Nos elegimos en los días sencillos|Ahora queremos escribir/);

        state.updateDraftField('content.welcome.story', '');
        applyTemplateContentBindings(dom.window.document, 'romance', state.getSnapshot().draft);
        const story = welcome.querySelector('[data-builder-field-path="content.welcome.story"]');
        assert.equal(story.hidden, true);
        assert.doesNotMatch(visibleText(welcome), /Nos conocimos|Nos elegimos en los días sencillos/);
    } finally {
        dom.window.close();
    }
});

test('Aloha Builder acepta Bautizo y una persona sin alterar la demo pública XV', async () => {
    const theme = COLLECTION_THEMES.find(({ id }) => id === 'aloha');
    const source = await readFile(path.join(ROOT, theme.templatePath.replace(/^\//, '')), 'utf8');
    assert.match(source, /XV Renatta|XV · Birthday · Pool party/);

    const dom = await createTemplate(theme);
    try {
        const state = new InvitationBuilderState();
        state.initialize('EVT-0001', { paquete: 'Prestige' });
        state.updateDraftFields({
            'content.identity.primaryName': 'Mateo',
            'content.identity.secondaryName': '',
            'content.identity.eventType': 'Bautizo',
            'content.identity.phrase': 'Celebremos juntos este día especial.'
        });
        applyTemplateContentBindings(dom.window.document, 'aloha', state.getSnapshot().draft);
        const rendered = visibleText(dom.window.document.body);
        assert.match(rendered, /Bautizo/);
        assert.match(rendered, /Mateo/);
        assert.doesNotMatch(rendered, /\bXV\b|Renatta|quinceañera|quince vueltas/i);
        assert.doesNotMatch(dom.window.document.querySelector('.hero-copy h2').textContent, /&\s*$/);
    } finally {
        dom.window.close();
    }
});

test('ubicación configurada reemplaza todas las sedes demo en las once colecciones', async () => {
    const copyValues = {
        'content.location.title': 'Dónde celebrar',
        'content.location.intro': 'Te esperamos en un lugar muy especial.'
    };
    const locationValues = {
        venueName: 'Hacienda Los Olivos',
        address: 'Av. Ejemplo 123',
        description: 'La celebración comenzará a las siete de la tarde.'
    };
    for (const theme of COLLECTION_THEMES) {
        const dom = await createTemplate(theme);
        try {
            const state = new InvitationBuilderState();
            state.initialize('EVT-0001', { paquete: 'Prestige' });
            state.updateDraftFields(copyValues);
            state.updateLocation('LOC-LOCAL-001', locationValues);
            applyTemplateContentBindings(dom.window.document, theme.id, state.getSnapshot().draft);
            const location = dom.window.document.querySelector('[data-prestige-feature~="multiple-locations"]');
            const rendered = visibleText(location);
            [...Object.values(copyValues), ...Object.values(locationValues)].forEach((value) => assert.match(rendered, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${theme.id}/${value}`));
            DEMO_LEAKAGE[theme.id].slice(2).forEach((value) => assert.equal(rendered.toLowerCase().includes(value.toLowerCase()), false, `${theme.id}/${value}`));
        } finally {
            dom.window.close();
        }
    }
});

test('los 43 fields de copy tienen editor, handler y ownership sin colisiones en los once temas', async () => {
    const editorPaths = new Set([
        ...GENERAL_INFORMATION_FIELDS.map(({ path: fieldPath }) => fieldPath),
        ...Object.values(SECTION_EDITOR_REGISTRY).flatMap(({ fields }) => fields.map(({ path: fieldPath }) => fieldPath))
    ]);
    const editablePaths = Object.keys(INVITATION_EDITABLE_FIELDS);
    assert.equal(editablePaths.length, 43);
    assert.deepEqual([...editorPaths].sort(), editablePaths.sort());

    const values = distinctiveValues();
    values['content.identity.primaryName'] = 'Cliente Alpha';
    values['content.identity.secondaryName'] = 'Cliente Beta';
    values['content.identity.eventType'] = 'Evento corporativo';

    for (const theme of COLLECTION_THEMES) {
        const coverage = getPhase2BindingCoverage(theme.id);
        assert.equal(coverage.total, 43, theme.id);
        assert.equal(coverage.bound, 43, theme.id);
        assert.ok(Object.values(coverage.paths).every((status) => status === 'PASS'), theme.id);

        const dom = await createTemplate(theme);
        try {
            const state = new InvitationBuilderState();
            state.initialize('EVT-0001', { paquete: 'Prestige' });
            state.updateDraftFields(values);
            const result = applyTemplateContentBindings(dom.window.document, theme.id, state.getSnapshot().draft);
            assert.deepEqual(result.collisions, [], theme.id);
            assert.equal(dom.window.document.querySelectorAll('[data-builder-semantic-section]').length, 12, theme.id);

            editablePaths.forEach((fieldPath) => {
                if (fieldPath === 'content.countdown.arrivedMessage') return;
                const directlyOwned = dom.window.document.querySelector(`[data-builder-bound-path="${fieldPath}"],[data-builder-field-path="${fieldPath}"]`);
                const compositeOwned = [...dom.window.document.querySelectorAll('[data-builder-bound-paths]')]
                    .some((node) => node.dataset.builderBoundPaths.split(' ').includes(fieldPath));
                assert.ok(directlyOwned || compositeOwned, `${theme.id}/${fieldPath}`);
            });
        } finally {
            dom.window.close();
        }
    }
});

test('configuración completa no deja leakage conocido y una colisión deliberada sí se reporta', async () => {
    const values = distinctiveValues();
    values['content.identity.primaryName'] = 'Cliente Alpha';
    values['content.identity.secondaryName'] = '';
    values['content.identity.eventType'] = 'Graduación';

    for (const theme of COLLECTION_THEMES) {
        const dom = await createTemplate(theme);
        try {
            const state = new InvitationBuilderState();
            state.initialize('EVT-0001', { paquete: 'Prestige' });
            state.updateDraftFields(values);
            const result = applyTemplateContentBindings(dom.window.document, theme.id, state.getSnapshot().draft);
            assert.equal(result.collisions.length, 0, theme.id);
            const rendered = visibleText(dom.window.document.body);
            DEMO_LEAKAGE[theme.id].forEach((term) => {
                assert.equal(rendered.toLowerCase().includes(term.toLowerCase()), false, `${theme.id} conserva ${term}`);
            });
            assert.doesNotMatch(dom.window.document.querySelector(TEMPLATE_BINDING_REGISTRY[theme.id].identity).textContent, /&\s*$/);
        } finally {
            dom.window.close();
        }
    }

    const champagne = COLLECTION_THEMES.find(({ id }) => id === 'champagne');
    const collisionDom = await createTemplate(champagne);
    try {
        collisionDom.window.document.querySelector('.hero-copy h2').dataset.builderBindingOwner = 'otro-owner';
        const draft = createInvitationDraft('EVT-0001', { nombreEvento: 'Cliente Alpha' });
        const result = applyTemplateContentBindings(collisionDom.window.document, 'champagne', draft);
        assert.equal(result.collisions.length, 1);
        assert.equal(result.collisions[0].previous, 'otro-owner');
        assert.equal(result.collisions[0].next, 'identity');
    } finally {
        collisionDom.window.close();
    }
});
