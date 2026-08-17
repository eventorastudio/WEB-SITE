import {
    projectRsvpOperationalView
} from '../../../shared/rsvp-operations-contract.js?v=phase56-rsvp-operations-20260817';

export function indexRsvpOperationalDocuments({ states = [], conflicts = [] } = {}) {
    const statesByGuestId = new Map();
    const conflictGuestIds = new Set();
    states.forEach((state) => statesByGuestId.set(state.guestId, state));
    conflicts.forEach((conflict) => conflictGuestIds.add(conflict.guestId));
    return Object.freeze({ statesByGuestId, conflictGuestIds });
}

export function createGuestRsvpOperationalElement(documentApi, state, {
    hasConflict = false,
    availability = 'loaded'
} = {}) {
    if (!documentApi || typeof documentApi.createElement !== 'function') {
        throw new TypeError('rsvp-operational-view/invalid-document');
    }
    const view = availability === 'loaded'
        ? projectRsvpOperationalView(state, { hasConflict })
        : unavailableView(availability, hasConflict);
    const container = documentApi.createElement('div');
    const badge = documentApi.createElement('span');
    const passes = documentApi.createElement('small');
    container.className = 'guest-rsvp-operational';
    container.dataset.rsvpStatus = view.status;
    badge.className = `guest-status guest-status--${statusClass(view.status)}`;
    badge.textContent = view.label;
    passes.className = 'guest-rsvp-passes';
    passes.textContent = view.passesLabel;
    container.append(badge, passes);

    if (view.hasConflict) {
        const conflict = documentApi.createElement('span');
        conflict.className = 'guest-rsvp-conflict';
        conflict.textContent = 'Conflicto';
        conflict.setAttribute('aria-label', 'Conflicto RSVP pendiente de revisión');
        container.appendChild(conflict);
    }
    return container;
}

function unavailableView(availability, hasConflict) {
    const loading = availability === 'loading';
    return Object.freeze({
        status: 'pending',
        label: loading ? 'Cargando RSVP' : 'No disponible',
        passesLabel: loading ? 'Consultando respuesta' : 'Estado no consultable',
        hasConflict: hasConflict === true
    });
}

function statusClass(status) {
    return ({ confirmed: 'confirmado', declined: 'no_asistira', pending: 'pendiente' })[status] ?? 'pendiente';
}
