function labelForState({ publishing, outcome }) {
    if (publishing) return 'Publicando…';
    if (outcome === 'published') return 'Publicado';
    if (outcome === 'unchanged') return 'Sin cambios';
    return 'Publicar';
}

export function initInvitationPublicationController({
    button,
    status,
    state,
    service,
    onError = () => {},
    onTrace = () => {}
}) {
    if (!button || !state || !service) return () => {};
    let publishing = false;
    let outcome = 'idle';
    let disposed = false;

    const render = () => {
        if (disposed) return;
        button.disabled = publishing;
        button.textContent = labelForState({ publishing, outcome });
        button.dataset.state = publishing ? 'saving' : outcome;
        if (status) {
            status.textContent = publishing
                ? 'Creando una revisión inmutable.'
                : ({
                    published: 'Nueva revisión publicada.',
                    unchanged: 'El contenido ya coincide con la revisión activa.',
                    error: 'No se publicó. El draft local permanece disponible.'
                })[outcome] ?? '';
        }
    };

    const publish = async () => {
        if (publishing) return;
        publishing = true;
        outcome = 'idle';
        render();
        try {
            const snapshot = state.getSnapshot();
            const result = await service.publishState(state, snapshot.draft?.eventId);
            outcome = result.status;
            onTrace('invitation-published', {
                eventId: snapshot.draft?.eventId,
                status: result.status,
                revisionId: result.revisionId,
                revisionNumber: result.revisionNumber
            });
        } catch (error) {
            outcome = 'error';
            onError(error, {
                source: 'invitation-publication',
                reason: 'publish-invitation',
                retry: () => void publish()
            });
        } finally {
            publishing = false;
            render();
        }
    };

    const onClick = () => void publish();
    button.addEventListener('click', onClick);
    const unsubscribe = state.subscribe(({ reason }) => {
        if (!['draft-persisted', 'active-step-changed', 'preview-device-changed'].includes(reason)) {
            outcome = 'idle';
        }
        render();
    }, { source: 'invitation-publication-controller' });
    render();

    return () => {
        disposed = true;
        button.removeEventListener('click', onClick);
        unsubscribe?.();
    };
}
