function labelForState({ saving, outcome, dirty }) {
    if (saving) return 'Guardando borrador…';
    if (outcome === 'saved' && !dirty) return 'Borrador guardado';
    return 'Guardar borrador';
}

export function initDraftPersistenceController({
    button,
    status,
    state,
    service,
    onError = () => {},
    onTrace = () => {}
}) {
    if (!button || !state || !service) return () => {};
    let saving = false;
    let outcome = 'idle';
    let disposed = false;

    const render = (snapshot = state.getSnapshot()) => {
        if (disposed) return;
        const dirty = Boolean(snapshot.ui?.generalDraftDirty);
        button.disabled = saving || !dirty;
        button.textContent = labelForState({ saving, outcome, dirty });
        button.dataset.state = saving ? 'saving' : (outcome === 'saved' && !dirty ? 'saved' : (dirty ? 'dirty' : 'idle'));
        if (status) {
            status.textContent = saving
                ? 'Guardando el borrador general.'
                : (outcome === 'saved'
                    ? (dirty ? 'La versión enviada se guardó; hay cambios generales nuevos pendientes.' : 'Borrador general guardado.')
                    : (outcome === 'error' ? 'No se guardó. Los cambios locales permanecen disponibles.' : ''));
        }
    };

    const save = async () => {
        if (saving || !state.getSnapshot().ui?.generalDraftDirty) return;
        saving = true;
        outcome = 'idle';
        render();
        try {
            const snapshot = state.getSnapshot();
            const result = await service.saveState(state, snapshot.draft?.eventId);
            outcome = 'saved';
            onTrace('draft-saved', { eventId: snapshot.draft?.eventId, clean: result.clean });
        } catch (error) {
            outcome = 'error';
            onError(error, {
                source: 'draft-persistence',
                reason: 'save-draft',
                retry: () => void save()
            });
        } finally {
            saving = false;
            render();
        }
    };

    const onClick = () => void save();
    button.addEventListener('click', onClick);
    const unsubscribe = state.subscribe(({ snapshot }) => {
        if (snapshot.ui?.generalDraftDirty) outcome = 'idle';
        render(snapshot);
    }, { source: 'draft-persistence-controller' });
    render();

    return () => {
        disposed = true;
        button.removeEventListener('click', onClick);
        unsubscribe?.();
    };
}
