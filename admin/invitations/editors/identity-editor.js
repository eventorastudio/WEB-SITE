import { GENERAL_INFORMATION_FIELDS, OPENING_INFORMATION_FIELDS } from '../core/section-editor-registry.js?v=phase94-opening-cover-20260821';
import { createEditorFieldsGrid, syncEditorFields } from './editor-fields.js?v=phase94-opening-cover-20260821';

export function initIdentityEditor({ container, openingContainer, state }) {
    if (!container || !state) return () => {};
    container.replaceChildren(createEditorFieldsGrid(GENERAL_INFORMATION_FIELDS, state));
    openingContainer?.replaceChildren(createEditorFieldsGrid(OPENING_INFORMATION_FIELDS, state));

    const render = (snapshot) => {
        syncEditorFields(container, snapshot);
        syncEditorFields(openingContainer, snapshot);
        const openingGroup = openingContainer?.closest('.information-group');
        if (openingGroup) openingGroup.hidden = snapshot.draft.themeId !== 'aloha';
    };
    render(state.getSnapshot());
    return state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'content-changed'].includes(reason)) render(snapshot);
    }, { source: 'identity-editor' });
}
