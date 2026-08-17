function labelForState({ saving, outcome, dirty }) {
    if (saving) return 'Guardando RSVP…';
    if (outcome === 'saved' && !dirty) return 'RSVP guardado';
    return 'Guardar RSVP';
}

export function initRsvpPersistenceController({
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
        const dirty = Boolean(snapshot.ui?.rsvpDirty);
        button.disabled = saving || !dirty;
        button.textContent = labelForState({ saving, outcome, dirty });
        button.dataset.state = saving ? 'saving' : (outcome === 'saved' && !dirty ? 'saved' : (dirty ? 'dirty' : 'idle'));
        if (status) {
            status.textContent = saving
                ? 'Guardando configuración RSVP.'
                : (outcome === 'saved'
                    ? (dirty ? 'La versión enviada se guardó; hay cambios nuevos pendientes.' : 'Configuración RSVP guardada.')
                    : (outcome === 'error' ? 'No se guardó. El borrador local permanece disponible.' : ''));
        }
    };

    const save = async () => {
        if (saving || !state.getSnapshot().ui?.rsvpDirty) return;
        saving = true;
        outcome = 'idle';
        render();
        try {
            const snapshot = state.getSnapshot();
            const result = await service.saveState(state, snapshot.draft?.eventId);
            outcome = 'saved';
            onTrace('rsvp-saved', { eventId: snapshot.draft?.eventId, clean: result.clean });
        } catch (error) {
            outcome = 'error';
            onError(error, {
                source: 'rsvp-persistence',
                reason: 'save-rsvp',
                retry: () => void save()
            });
        } finally {
            saving = false;
            render();
        }
    };

    const onClick = () => void save();
    button.addEventListener('click', onClick);
    const unsubscribe = state.subscribe(({ reason, snapshot }) => {
        if (reason === 'content-changed' && snapshot.ui?.rsvpDirty) outcome = 'idle';
        render(snapshot);
    }, { source: 'rsvp-persistence-controller' });
    render();

    return () => {
        disposed = true;
        button.removeEventListener('click', onClick);
        unsubscribe?.();
    };
}
