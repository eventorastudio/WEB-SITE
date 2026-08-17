import { buildWhatsAppUrl } from '../admin/invitations/core/safe-url.js?v=phase54-public-rsvp-20260817';
import { timestampToDate } from './core/rsvp-public-config-contract.js?v=phase54-public-rsvp-20260817';

export function createRsvpView(documentRoot = document) {
    const elements = {
        card: documentRoot.getElementById('rsvp-card'),
        title: documentRoot.getElementById('rsvp-title'),
        message: documentRoot.getElementById('rsvp-message'),
        summary: documentRoot.getElementById('rsvp-access-summary'),
        guestName: documentRoot.getElementById('rsvp-guest-name'),
        passLimit: documentRoot.getElementById('rsvp-pass-limit'),
        deadline: documentRoot.getElementById('rsvp-deadline'),
        form: documentRoot.getElementById('rsvp-form'),
        fieldset: documentRoot.getElementById('rsvp-fieldset'),
        accepted: documentRoot.querySelector('input[name="rsvp-status"][value="accepted"]'),
        declined: documentRoot.querySelector('input[name="rsvp-status"][value="declined"]'),
        acceptedLabel: documentRoot.getElementById('rsvp-accepted-label'),
        declinedLabel: documentRoot.getElementById('rsvp-declined-label'),
        passSelector: documentRoot.getElementById('rsvp-pass-selector'),
        passes: documentRoot.getElementById('rsvp-passes'),
        submit: documentRoot.getElementById('rsvp-submit'),
        whatsapp: documentRoot.getElementById('rsvp-whatsapp'),
        current: documentRoot.getElementById('rsvp-current-response'),
        feedback: documentRoot.getElementById('rsvp-feedback'),
        retry: documentRoot.getElementById('rsvp-retry')
    };
    let currentModel = null;
    let submitHandler = () => {};
    let retryHandler = () => {};

    elements.form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitHandler(readSelection());
    });
    [elements.accepted, elements.declined].forEach((control) => {
        control.addEventListener('change', updatePassSelector);
    });
    elements.retry.addEventListener('click', () => retryHandler());

    function setState(state) {
        elements.card.setAttribute('data-state', state);
    }

    function resetActions() {
        elements.form.hidden = true;
        elements.whatsapp.hidden = true;
        elements.current.hidden = true;
        elements.retry.hidden = true;
        elements.feedback.textContent = '';
        elements.feedback.removeAttribute('data-tone');
    }

    function renderLoading() {
        currentModel = null;
        setState('loading');
        elements.card.setAttribute('aria-busy', 'true');
        elements.title.textContent = 'Verificando invitación…';
        elements.message.textContent = 'Espera un momento mientras validamos este acceso.';
        elements.summary.hidden = true;
        resetActions();
    }

    function renderUnavailable(status, { retry = false } = {}) {
        currentModel = null;
        setState(status === 'error' ? 'error' : 'unavailable');
        elements.card.setAttribute('aria-busy', 'false');
        elements.title.textContent = status === 'error' ? 'No pudimos cargar la invitación' : 'Invitación no disponible';
        elements.message.textContent = status === 'error'
            ? 'Revisa tu conexión e inténtalo nuevamente.'
            : 'Esta invitación no está disponible.';
        elements.summary.hidden = true;
        resetActions();
        elements.retry.hidden = !retry;
    }

    function renderSession(model) {
        currentModel = model;
        setState(model.state);
        elements.card.setAttribute('aria-busy', 'false');
        elements.title.textContent = model.config.title || 'Confirma tu asistencia';
        elements.message.textContent = model.config.message || '';
        elements.guestName.textContent = model.access.displayName;
        elements.passLimit.textContent = `${model.access.passLimit} pase${model.access.passLimit === 1 ? '' : 's'} asignado${model.access.passLimit === 1 ? '' : 's'}`;
        elements.summary.hidden = false;
        renderDeadline(model.config);
        resetActions();
        renderCurrentResponse(model.response);

        if (model.config.method === 'whatsapp') {
            const whatsappUrl = buildWhatsAppUrl(model.config.whatsapp);
            if (!model.closed && whatsappUrl) {
                elements.whatsapp.href = whatsappUrl;
                elements.whatsapp.textContent = model.config.buttonLabel || 'Responder por WhatsApp';
                elements.whatsapp.hidden = false;
            }
        } else {
            renderInternalForm(model);
        }

        if (model.closed) {
            elements.feedback.textContent = 'El plazo para responder ha finalizado.';
            elements.feedback.setAttribute('data-tone', 'error');
        }
    }

    function renderDeadline(config) {
        if (config.responseClosesAt == null) {
            elements.deadline.hidden = true;
            elements.deadline.textContent = '';
            return;
        }
        const date = timestampToDate(config.responseClosesAt);
        try {
            const formatted = new Intl.DateTimeFormat('es-MX', {
                dateStyle: 'long',
                timeStyle: 'short',
                timeZone: config.deadlineTimeZone
            }).format(date);
            elements.deadline.textContent = `Responde antes del ${formatted} (${config.deadlineTimeZone}).`;
            elements.deadline.hidden = false;
        } catch {
            elements.deadline.hidden = true;
            elements.deadline.textContent = '';
        }
    }

    function renderInternalForm(model) {
        elements.acceptedLabel.textContent = model.config.responses.acceptedLabel || 'Asistiré';
        elements.declinedLabel.textContent = model.config.responses.declinedLabel || 'No podré asistir';
        elements.submit.textContent = model.config.buttonLabel || 'Enviar respuesta';
        elements.passes.replaceChildren();
        for (let value = 1; value <= model.access.passLimit; value += 1) {
            const option = documentRoot.createElement('option');
            option.value = String(value);
            option.textContent = `${value} pase${value === 1 ? '' : 's'}`;
            elements.passes.append(option);
        }
        const response = model.response;
        elements.accepted.checked = response?.status === 'accepted';
        elements.declined.checked = response?.status === 'declined';
        elements.passes.value = String(response?.passesConfirmed || 1);
        elements.fieldset.disabled = model.closed;
        elements.submit.disabled = model.closed;
        elements.form.hidden = false;
        updatePassSelector();
    }

    function renderCurrentResponse(response) {
        if (!response) return;
        elements.current.textContent = response.status === 'accepted'
            ? `Respuesta actual: asistirás con ${response.passesConfirmed} pase${response.passesConfirmed === 1 ? '' : 's'}.`
            : 'Respuesta actual: no podrás asistir.';
        elements.current.hidden = false;
    }

    function updatePassSelector() {
        const selectable = currentModel?.config.guestPolicy === 'select-up-to-assigned';
        elements.passSelector.hidden = !(selectable && elements.accepted.checked);
    }

    function readSelection() {
        const status = elements.accepted.checked ? 'accepted' : (elements.declined.checked ? 'declined' : '');
        const passesConfirmed = status === 'declined'
            ? 0
            : (currentModel?.config.guestPolicy === 'assigned-only'
                ? currentModel?.access.passLimit
                : Number(elements.passes.value));
        return { status, passesConfirmed };
    }

    function setSaving(saving) {
        if (saving) setState('saving');
        elements.card.setAttribute('aria-busy', saving ? 'true' : 'false');
        elements.fieldset.disabled = saving || Boolean(currentModel?.closed);
        elements.submit.disabled = saving || Boolean(currentModel?.closed);
        if (saving) {
            elements.feedback.textContent = 'Guardando tu respuesta…';
            elements.feedback.removeAttribute('data-tone');
        }
    }

    function showSaveResult(result, confirmationMessage) {
        setState(result.status);
        renderCurrentResponse(result.response);
        elements.feedback.textContent = result.status === 'unchanged'
            ? 'Tu respuesta ya estaba guardada.'
            : (confirmationMessage || 'Tu respuesta quedó guardada.');
        elements.feedback.setAttribute('data-tone', 'success');
        elements.retry.hidden = true;
        elements.feedback.focus({ preventScroll: true });
    }

    function showSaveError() {
        setState('error');
        elements.feedback.textContent = 'No pudimos guardar tu respuesta. Tu selección se conserva; inténtalo de nuevo.';
        elements.feedback.setAttribute('data-tone', 'error');
        elements.feedback.focus({ preventScroll: true });
        elements.retry.hidden = false;
    }

    return Object.freeze({
        onSubmit(handler) { submitHandler = typeof handler === 'function' ? handler : () => {}; },
        onRetry(handler) { retryHandler = typeof handler === 'function' ? handler : () => {}; },
        renderLoading,
        renderUnavailable,
        renderSession,
        readSelection,
        setSaving,
        showSaveResult,
        showSaveError
    });
}
