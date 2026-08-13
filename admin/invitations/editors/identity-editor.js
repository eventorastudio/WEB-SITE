import { GENERAL_INFORMATION_FIELDS } from '../core/section-editor-registry.js?v=phase21-normalization-20260813';
import { createEditorFieldsGrid, syncEditorFields } from './editor-fields.js?v=phase21-normalization-20260813';

export function initIdentityEditor({ container, state }) {
    if (!container || !state) return () => {};
    container.replaceChildren(createEditorFieldsGrid(GENERAL_INFORMATION_FIELDS, state));

    const render = (snapshot) => syncEditorFields(container, snapshot);
    render(state.getSnapshot());
    return state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'content-changed'].includes(reason)) render(snapshot);
    }, { source: 'identity-editor' });
}
