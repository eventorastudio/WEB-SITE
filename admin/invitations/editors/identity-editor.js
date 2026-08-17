import { GENERAL_INFORMATION_FIELDS } from '../core/section-editor-registry.js?v=phase54a-rsvp-time-20260817';
import { createEditorFieldsGrid, syncEditorFields } from './editor-fields.js?v=phase54a-rsvp-time-20260817';

export function initIdentityEditor({ container, state }) {
    if (!container || !state) return () => {};
    container.replaceChildren(createEditorFieldsGrid(GENERAL_INFORMATION_FIELDS, state));

    const render = (snapshot) => syncEditorFields(container, snapshot);
    render(state.getSnapshot());
    return state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'content-changed'].includes(reason)) render(snapshot);
    }, { source: 'identity-editor' });
}
