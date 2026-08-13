export function initBuilderEventBridge({ state, eventBus, eventTypes, onSnapshot }) {
    if (!state || !eventBus?.emit || !eventTypes) return () => {};

    return state.subscribe(({ snapshot, reason }) => {
        onSnapshot?.(snapshot, reason);
        eventBus.emit(eventTypes.BUILDER_DRAFT_UPDATED, {
            eventId: snapshot.draft.eventId,
            reason,
            isDirty: snapshot.ui.isDirty,
            timestamp: Date.now()
        });
        if (reason === 'theme-changed') {
            eventBus.emit(eventTypes.BUILDER_THEME_CHANGED, {
                themeId: snapshot.draft.themeId,
                timestamp: Date.now()
            });
        }
        if (reason === 'sections-changed') {
            eventBus.emit(eventTypes.BUILDER_SECTIONS_CHANGED, {
                enabledSections: [...snapshot.draft.enabledSections],
                timestamp: Date.now()
            });
        }
    }, { source: 'state-event-bridge' });
}
