import { getSectionEditor } from '../core/section-editor-registry.js?v=phase164-aloha-rsvp-builder-cleanup-20260825';
import { createEditorFieldsGrid, syncEditorFields } from './editor-fields.js?v=phase54-rsvp-time-20260817';

export function initAccessPassEditor({ container, state }) {
    if (!container || !state) return () => {};
    const definition = getSectionEditor('access-preview');
    const render = (snapshot) => {
        const details = document.createElement('details');
        details.className = 'section-content-editor';
        details.open = true;
        const summary = document.createElement('summary');
        const title = document.createElement('span');
        title.textContent = definition.title;
        const status = document.createElement('small');
        status.textContent = snapshot.draft?.enabledSections?.includes('access-preview') ? 'Activa' : 'Conservada';
        summary.append(title, status);
        const body = document.createElement('div');
        body.className = 'section-content-editor-body';
        const note = document.createElement('p');
        note.className = 'section-editor-notice';
        note.textContent = 'Configura el pase sin modificar el invitado, el QR ni los pases asignados.';
        body.append(createEditorFieldsGrid(definition.fields, state), note);
        details.append(summary, body);
        container.replaceChildren(details);
        syncEditorFields(container, snapshot);
    };
    render(state.getSnapshot());
    return state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'sections-changed', 'package-changed'].includes(reason)) render(snapshot);
        else if (reason === 'content-changed') syncEditorFields(container, snapshot);
    }, { source: 'access-pass-editor' });
}
