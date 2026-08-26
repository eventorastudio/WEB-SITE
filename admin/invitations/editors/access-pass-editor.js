import { getSectionEditor } from '../core/section-editor-registry.js?v=phase170-access-qr-visibility-20260826';
import { createEditorFieldsGrid, syncEditorFields } from './editor-fields.js?v=phase54-rsvp-time-20260817';

export function initAccessPassEditor({ container, state, guestService }) {
    if (!container || !state) return () => {};
    const definition = getSectionEditor('access-preview');
    let availability = { status: 'idle', totalGuests: 0, guestsWithQr: 0 };
    let requestId = 0;

    const getEventId = () => state.getSnapshot().draft?.eventId;
    const availabilityMessage = () => {
        if (availability.status === 'loading') return 'Consultando disponibilidad de QR…';
        if (availability.status === 'error') return 'No fue posible consultar el estado de QR.';
        if (availability.totalGuests === 0 || availability.guestsWithQr === 0) {
            return 'No hay QR generados. Créelos desde la administración del evento.';
        }
        if (availability.guestsWithQr < availability.totalGuests) {
            return `${availability.guestsWithQr} de ${availability.totalGuests} invitados tienen QR.`;
        }
        return `QR generados: ${availability.guestsWithQr} de ${availability.totalGuests} invitados.`;
    };

    const syncQrControl = () => {
        const control = container.querySelector('[data-draft-path="content.access.showQr"]');
        if (control) control.disabled = availability.status !== 'ready' || availability.guestsWithQr === 0;
        const status = container.querySelector('[data-access-qr-status]');
        if (status) status.textContent = availabilityMessage();
    };

    const refreshAvailability = async () => {
        const currentRequest = ++requestId;
        const eventId = getEventId();
        if (!guestService || !eventId) {
            availability = { status: 'error', totalGuests: 0, guestsWithQr: 0 };
            syncQrControl();
            return;
        }
        availability = { status: 'loading', totalGuests: 0, guestsWithQr: 0 };
        syncQrControl();
        try {
            const result = await guestService.getQrAvailability(eventId);
            if (currentRequest !== requestId) return;
            availability = { status: 'ready', ...result };
        } catch {
            if (currentRequest !== requestId) return;
            availability = { status: 'error', totalGuests: 0, guestsWithQr: 0 };
        }
        syncQrControl();
    };

    const render = (snapshot) => {
        const details = document.createElement('details');
        details.className = 'section-content-editor';
        details.open = true;
        const summary = document.createElement('summary');
        const title = document.createElement('span');
        title.textContent = definition.title;
        const status = document.createElement('small');
        status.textContent = snapshot.draft?.enabledSections?.includes('access-preview') ? 'Activa' : 'Conservada';
        summary.append(title, status);
        const body = document.createElement('div');
        body.className = 'section-content-editor-body';
        const note = document.createElement('p');
        note.className = 'section-editor-notice';
        note.textContent = 'Configura el pase sin modificar el invitado, el QR ni los pases asignados.';
        const fields = createEditorFieldsGrid(definition.fields, state);
        const qrStatus = document.createElement('p');
        qrStatus.className = 'section-editor-notice';
        qrStatus.dataset.accessQrStatus = 'true';
        qrStatus.textContent = availabilityMessage();
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'button button-secondary';
        refresh.textContent = 'Actualizar estado de QR';
        refresh.addEventListener('click', () => { void refreshAvailability(); });
        body.append(fields, qrStatus, refresh, note);
        details.append(summary, body);
        container.replaceChildren(details);
        syncEditorFields(container, snapshot);
        syncQrControl();
    };
    render(state.getSnapshot());
    void refreshAvailability();
    return state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'sections-changed', 'package-changed'].includes(reason)) {
            render(snapshot);
            if (reason === 'initialized') void refreshAvailability();
        }
        else if (reason === 'content-changed') {
            syncEditorFields(container, snapshot);
            syncQrControl();
        }
    }, { source: 'access-pass-editor' });
}
