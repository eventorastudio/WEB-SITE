import { validateInvitationDraft } from '../core/builder-validation.js?v=phase89-dress-code-media-20260820';
import { buildPublicInvitationUrl } from '../../../invitacion/public-invitation-route.js?v=phase90-canonical-invitation-urls-20260821';

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
    let publicUrl = '';
    let validationMessage = '';
    let disposed = false;

    const render = () => {
        if (disposed) return;
        const snapshot = state.getSnapshot();
        const validationErrors = validateInvitationDraft(snapshot.draft);
        const errorEntries = Object.entries(validationErrors);
        const displayOutcome = outcome === 'unchanged' && errorEntries.length
            ? 'validation-error'
            : outcome;
        if (displayOutcome === 'validation-error' && errorEntries.length) {
            validationMessage = createValidationMessage(errorEntries);
        }
        button.disabled = publishing;
        button.textContent = labelForState({ publishing, outcome: displayOutcome });
        button.dataset.state = publishing ? 'saving' : displayOutcome;
        if (status) {
            const message = publishing
                ? 'Creando una revisión inmutable.'
                : ({
                    published: 'Invitación publicada.',
                    unchanged: 'El contenido ya coincide con la revisión activa.',
                    error: 'No se publicó. El draft local permanece disponible.'
                })[displayOutcome] ?? validationMessage;
            status.textContent = message;
            if (publicUrl && ['published', 'unchanged'].includes(displayOutcome)) {
                const link = status.ownerDocument.createElement('a');
                link.href = publicUrl;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = 'Abrir invitación';
                status.append(status.ownerDocument.createTextNode(' '), link);
            }
        }
    };

    const publish = async () => {
        if (publishing) return;
        const snapshot = state.getSnapshot();
        const validationErrors = validateInvitationDraft(snapshot.draft);
        const errorEntries = Object.entries(validationErrors);
        if (errorEntries.length) {
            outcome = 'validation-error';
            publicUrl = '';
            validationMessage = createValidationMessage(errorEntries);
            render();
            focusFirstValidationError(errorEntries[0][0], button.ownerDocument);
            return;
        }

        validationMessage = '';
        publishing = true;
        outcome = 'idle';
        render();
        try {
            const result = await service.publishState(state, snapshot.draft?.eventId);
            outcome = result.status;
            publicUrl = buildPublicInvitationUrl({ eventId: result.eventId, publicKey: result.publicKey });
            onTrace('invitation-published', {
                eventId: snapshot.draft?.eventId,
                status: result.status,
                publicKey: result.publicKey,
                revisionId: result.revisionId,
                revisionNumber: result.revisionNumber
            });
        } catch (error) {
            outcome = 'error';
            publicUrl = '';
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
            validationMessage = '';
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

function createValidationMessage(entries) {
    const details = entries.slice(0, 3)
        .map(([path, message]) => `${path}: ${message}`)
        .join(' ');
    const remaining = entries.length > 3 ? ` Hay ${entries.length - 3} m\u00e1s.` : '';
    return `No se puede publicar: ${entries.length} ${entries.length === 1 ? 'error requiere' : 'errores requieren'} correcci\u00f3n. ${details}${remaining}`;
}

function focusFirstValidationError(path, documentRoot = globalThis.document) {
    if (!documentRoot) return;
    const controls = [...documentRoot.querySelectorAll('[data-draft-path]')];
    const control = controls.find((candidate) => candidate.dataset.draftPath === path)
        ?? [...documentRoot.querySelectorAll('[data-entity-error]')]
            .find((candidate) => candidate.dataset.entityError === path)
            ?.closest('label')
            ?.querySelector('input, select, textarea');
    if (!control) return;
    try {
        control.focus({ preventScroll: true });
    } catch {
        control.focus();
    }
    control.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}
