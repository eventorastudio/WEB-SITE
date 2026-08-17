import { getSectionById, isSectionAllowed } from '../core/section-registry.js?v=phase3-logistics-20260813';
import { getSectionEditor } from '../core/section-editor-registry.js?v=phase54a-rsvp-time-20260817';
import { createEditorFieldsGrid, syncEditorFields } from './editor-fields.js?v=phase54a-rsvp-time-20260817';

function createEmptyState() {
    const empty = document.createElement('div');
    empty.className = 'content-editor-empty';
    const title = document.createElement('strong');
    title.textContent = 'Activa una sección para editar su contenido.';
    const copy = document.createElement('p');
    copy.textContent = 'Los editores aparecerán aquí sin borrar los datos de las secciones que desactives.';
    empty.append(title, copy);
    return empty;
}

function createSectionEditor(sectionId, snapshot, state, open) {
    const definition = getSectionEditor(sectionId);
    const section = getSectionById(sectionId);
    if (!definition || !section) return null;

    const details = document.createElement('details');
    details.className = 'section-content-editor';
    details.dataset.sectionEditor = sectionId;
    details.open = open;

    const summary = document.createElement('summary');
    const heading = document.createElement('span');
    heading.textContent = definition.title || section.name;
    const status = document.createElement('small');
    const retained = !isSectionAllowed(sectionId, snapshot.draft.packageId);
    status.textContent = retained ? 'Conservada' : 'Activa';
    status.dataset.state = retained ? 'retained' : 'active';
    summary.append(heading, status);

    const body = document.createElement('div');
    body.className = 'section-content-editor-body';
    if (definition.description) {
        const description = document.createElement('p');
        description.className = 'section-editor-description';
        description.textContent = definition.description;
        body.append(description);
    }
    if (definition.fields.length) body.append(createEditorFieldsGrid(definition.fields, state));
    if (definition.notice) {
        const notice = document.createElement('p');
        notice.className = 'section-editor-notice';
        notice.textContent = definition.notice;
        body.append(notice);
    }

    details.append(summary, body);
    return details;
}

export function initSectionCopyEditors({ container, state }) {
    if (!container || !state) return () => {};

    const rebuild = (snapshot) => {
        const scroller = document.getElementById('builder-editor');
        const scrollTop = scroller?.scrollTop ?? 0;
        const openSections = new Set([...container.querySelectorAll('details[open]')].map((item) => item.dataset.sectionEditor));
        const enabled = snapshot.draft?.enabledSections ?? [];
        if (!enabled.length) {
            container.replaceChildren(createEmptyState());
            if (scroller) scroller.scrollTop = scrollTop;
            return;
        }
        const fragment = document.createDocumentFragment();
        enabled.forEach((sectionId, index) => {
            const editor = createSectionEditor(sectionId, snapshot, state, openSections.has(sectionId) || (!openSections.size && index === 0));
            if (editor) fragment.append(editor);
        });
        container.replaceChildren(fragment);
        syncEditorFields(container, snapshot);
        if (scroller) scroller.scrollTop = scrollTop;
    };

    rebuild(state.getSnapshot());
    return state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'sections-changed', 'package-changed'].includes(reason)) rebuild(snapshot);
        else if (reason === 'content-changed') syncEditorFields(container, snapshot);
    }, { source: 'section-copy-editors' });
}
