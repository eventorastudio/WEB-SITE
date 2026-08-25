import { getSectionEditor } from '../core/section-editor-registry.js?v=phase54a-rsvp-time-20260817';
import { initAccommodationEditor } from './accommodation-editor.js?v=phase3-logistics-20260813';
import { initDressCodeEditor } from './dress-code-editor.js?v=phase89-dress-code-media-20260820';
import { initGiftEditor } from './gift-editor.js?v=phase142-aloha-prestige-actions-icon-picker-20260825';
import { initItineraryEditor } from './itinerary-editor.js?v=phase3-logistics-20260813';
import { initLinksEditor } from './links-editor.js?v=phase142-aloha-prestige-actions-icon-picker-20260825';
import { initLocationEditor } from './location-editor.js?v=phase93-package-sections-format-20260821';

const MOUNTERS = Object.freeze({
    locations: initLocationEditor,
    itinerary: initItineraryEditor,
    'dress-code': initDressCodeEditor,
    gifts: initGiftEditor,
    accommodations: initAccommodationEditor,
    links: initLinksEditor
});

function emptyState(message = 'Activa Ubicación, Itinerario, Dress Code o Mesa de regalos.') {
    const node = document.createElement('div');
    node.className = 'content-editor-empty';
    const title = document.createElement('strong');
    title.textContent = message;
    const copy = document.createElement('p');
    copy.textContent = 'Los datos configurados permanecen intactos cuando una sección se desactiva o cambia el paquete.';
    node.append(title, copy);
    return node;
}

export function initLogisticsEditors({ container, state, editorIds = null, emptyMessage }) {
    if (!container || !state) return () => {};
    let childCleanups = [];

    const rebuild = (snapshot) => {
        const scroller = document.getElementById('builder-editor');
        const scrollTop = scroller?.scrollTop ?? 0;
        childCleanups.splice(0).forEach((cleanup) => cleanup());
        const availableEditorIds = [...new Set((snapshot.draft.enabledSections ?? [])
            .flatMap((sectionId) => getSectionEditor(sectionId)?.advancedEditors ?? []))];
        const visibleEditorIds = (editorIds ?? availableEditorIds)
            .filter((editorId) => availableEditorIds.includes(editorId));
        if (!visibleEditorIds.length) {
            container.replaceChildren(emptyState(emptyMessage));
            if (scroller) scroller.scrollTop = scrollTop;
            return;
        }
        const fragment = document.createDocumentFragment();
        const targets = [];
        visibleEditorIds.forEach((editorId) => {
            const target = document.createElement('div');
            target.dataset.advancedEditor = editorId;
            fragment.append(target);
            targets.push([editorId, target]);
        });
        container.replaceChildren(fragment);
        targets.forEach(([editorId, target]) => {
            const mount = MOUNTERS[editorId];
            if (mount) childCleanups.push(mount({ container: target, state }));
        });
        if (scroller) scroller.scrollTop = scrollTop;
    };

    rebuild(state.getSnapshot());
    const unsubscribe = state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'sections-changed', 'package-changed'].includes(reason)) rebuild(snapshot);
    }, { source: 'logistics-editors' });
    return () => {
        unsubscribe();
        childCleanups.splice(0).forEach((cleanup) => cleanup());
    };
}
