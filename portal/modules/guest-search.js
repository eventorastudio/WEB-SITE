import { filterGuests } from '../services/portal-guest-service.js';
import { getCheckinErrorMessage } from '../services/checkin-service.js';
import { portalEventBus } from '../core/portal-event-bus.js';
import { PORTAL_EVENTS } from '../core/portal-event-types.js';

let unsubscribe = null;
let cleanup = [];
let guests = [];
let debounceTimer = null;

export function initGuestSearch(container) {
    destroyGuestSearch();
    const eventId = container.context.event.id;
    const input = document.getElementById('guest-search-input');
    const filter = document.getElementById('guest-filter');
    const tableFilter = document.getElementById('guest-table-filter');
    const sort = document.getElementById('guest-sort');
    const render = () => renderGuests(container, input?.value, filter?.value, tableFilter?.value, sort?.value);
    const onInput = () => {
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(render, 220);
    };
    input?.addEventListener('input', onInput);
    filter?.addEventListener('change', render);
    tableFilter?.addEventListener('change', render);
    sort?.addEventListener('change', render);
    cleanup = [
        () => input?.removeEventListener('input', onInput),
        () => filter?.removeEventListener('change', render),
        () => tableFilter?.removeEventListener('change', render),
        () => sort?.removeEventListener('change', render)
    ];
    unsubscribe = container.services.guest.subscribeGuests(eventId, (nextGuests) => {
        guests = nextGuests;
        syncTableFilter(tableFilter);
        render();
        portalEventBus.emit(PORTAL_EVENTS.GUESTS_UPDATED, { guests });
    }, () => container.ui.toast({ title: 'Lista sin actualizar', message: 'Conservamos los últimos invitados disponibles.', type: 'warning' }));
}

export function destroyGuestSearch() {
    unsubscribe?.();
    cleanup.forEach((remove) => remove());
    window.clearTimeout(debounceTimer);
    unsubscribe = null;
    cleanup = [];
    guests = [];
    debounceTimer = null;
}

function renderGuests(container, search = '', filter = 'todos', table = 'todas', sort = 'nombre') {
    const target = document.getElementById('guest-results');
    if (!target) return;
    const result = filterGuests(guests, search, filter).filter((guest) => table === 'todas' || String(guest.mesa) === table);
    sortGuests(result, sort);
    target.replaceChildren();
    if (!result.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-copy';
        empty.textContent = 'No encontramos invitados con esos criterios.';
        target.appendChild(empty);
        return;
    }
    result.forEach((guest) => target.appendChild(createGuestCard(container, guest)));
}

function createGuestCard(container, guest) {
    const card = document.createElement('article');
    card.className = 'guest-card';
    const head = document.createElement('div');
    head.className = 'guest-card__head';
    const title = document.createElement('h3');
    title.textContent = guest.nombre;
    const code = document.createElement('span');
    code.className = 'guest-code';
    code.textContent = guest.codigoInvitado || 'Sin código visible';
    code.title = guest.codigoInvitado || 'Sin código visible';
    head.append(title, code);
    const details = document.createElement('dl');
    appendDetail(details, 'Mesa', guest.mesa === null ? 'Sin mesa' : String(guest.mesa));
    appendDetail(details, 'Usados', String(guest.pasesUtilizados));
    appendDetail(details, 'Disponibles', String(guest.pasesDisponibles));
    appendDetail(details, 'Estado', getGuestStateLabel(guest));
    appendDetail(details, 'Última llegada', formatArrival(guest.ultimaLlegada));
    const actions = document.createElement('div');
    actions.className = 'guest-card__actions';
    if (container.context.entitlements.historialAccesos) {
        const history = document.createElement('button');
        history.type = 'button';
        history.className = 'button button--ghost';
        history.textContent = 'Historial';
        history.addEventListener('click', () => portalEventBus.emit(PORTAL_EVENTS.SHOW_GUEST_HISTORY, { guest }));
        actions.appendChild(history);
    }
    if (guest.pasesDisponibles > 0 && container.context.entitlements.checkInQR) {
        const entry = document.createElement('button');
        entry.type = 'button';
        entry.className = 'button button--primary';
        entry.textContent = 'Registrar entrada';
        entry.addEventListener('click', () => openManualEntry(container, guest));
        actions.appendChild(entry);
    }
    card.append(head, details, actions);
    return card;
}

function syncTableFilter(select) {
    if (!select) return;
    const selected = select.value || 'todas';
    select.replaceChildren();
    const all = document.createElement('option');
    all.value = 'todas';
    all.textContent = 'Todas las mesas';
    select.appendChild(all);
    [...new Set(guests.map((guest) => guest.mesa).filter((table) => table !== null && table !== undefined))]
        .sort((left, right) => Number(left) - Number(right))
        .forEach((table) => {
            const option = document.createElement('option');
            option.value = String(table);
            option.textContent = `Mesa ${table}`;
            select.appendChild(option);
        });
    select.value = [...select.options].some((option) => option.value === selected) ? selected : 'todas';
}

function openManualEntry(container, guest) {
    if (!navigator.onLine) {
        container.ui.toast({ title: 'Sin conexión', message: 'La entrada manual se bloquea hasta recuperar conexión.', type: 'warning' });
        return;
    }
    container.ui.openEntryModal({ guest, onSubmit: async (passes) => {
        try {
            const result = await container.services.checkin.registerEntry({
                eventId: container.context.event.id,
                guestId: guest.id,
                passes,
                method: 'manual',
                userId: container.context.user.uid,
            });
            portalEventBus.emit(PORTAL_EVENTS.CHECKIN_COMPLETED, result);
            container.ui.toast({ title: result.result === 'parcial' ? 'Entrada parcial' : 'Entrada aprobada', message: `${result.passesRegistered} pase(s) registrados para ${guest.nombre}.`, type: 'success' });
        } catch (error) {
            container.ui.toast({ title: 'No se registró la entrada', message: getCheckinError(error), type: 'error' });
            return false;
        }
    }});
}

function appendDetail(list, label, value) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    list.appendChild(row);
}

function sortGuests(list, sort) {
    const byName = (left, right) => left.nombre.localeCompare(right.nombre, 'es', { sensitivity: 'base', numeric: true });
    if (sort === 'mesa') list.sort((left, right) => (left.mesa ?? Number.MAX_SAFE_INTEGER) - (right.mesa ?? Number.MAX_SAFE_INTEGER) || byName(left, right));
    else if (sort === 'llegada') list.sort((left, right) => new Date(right.ultimaLlegada || 0) - new Date(left.ultimaLlegada || 0) || byName(left, right));
    else if (sort === 'pendientes') list.sort((left, right) => left.pasesUtilizados - right.pasesUtilizados || byName(left, right));
    else list.sort(byName);
}

function getGuestStateLabel(guest) {
    if (guest.pasesDisponibles === 0) return 'Acceso completo';
    if (guest.pasesUtilizados > 0) return 'Entrada parcial';
    if (guest.estado === 'confirmado') return 'Confirmado';
    if (guest.estado === 'no_asistira') return 'No asistirá';
    return 'Pendiente';
}

function formatArrival(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(date)
        : 'Sin llegada';
}

function getCheckinError(error) {
    return getCheckinErrorMessage(error);
}
