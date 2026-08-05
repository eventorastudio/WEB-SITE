import { portalEventBus } from '../core/portal-event-bus.js';
import { PORTAL_EVENTS } from '../core/portal-event-types.js';

let unsubscribe = null;
let busUnsubscribe = null;
let filterCleanups = [];
let latestEntries = [];

export function initCheckinHistory(container) {
    destroyCheckinHistory();
    const eventId = container.context.event.id;
    const refresh = () => renderHistory(latestEntries);
    ['activity-search', 'activity-method', 'activity-result', 'activity-time'].forEach((id) => {
        const element = document.getElementById(id);
        if (!element) return;
        const eventName = element.tagName === 'INPUT' ? 'input' : 'change';
        element.addEventListener(eventName, refresh);
        filterCleanups.push(() => element.removeEventListener(eventName, refresh));
    });
    unsubscribe = container.services.checkin.subscribeHistory(eventId, (entries) => {
        latestEntries = entries;
        refresh();
    }, () => container.ui.toast({ title: 'Historial no disponible', message: 'No se pudo actualizar el historial de accesos.', type: 'warning' }), 50);
    busUnsubscribe = portalEventBus.on(PORTAL_EVENTS.SHOW_GUEST_HISTORY, async ({ guest }) => {
        try {
            const entries = await container.services.checkin.getGuestHistory(eventId, guest.id);
            openGuestHistory(guest, entries);
        } catch {
            container.ui.toast({ title: 'No se pudo consultar el historial', message: 'Inténtalo nuevamente.', type: 'warning' });
        }
    });
}

export function destroyCheckinHistory() {
    unsubscribe?.();
    busUnsubscribe?.();
    filterCleanups.forEach((cleanup) => cleanup());
    unsubscribe = null;
    busUnsubscribe = null;
    filterCleanups = [];
    latestEntries = [];
}

function renderHistory(entries) {
    const filteredEntries = filterHistory(entries);
    ['recent-activity-list', 'activity-list'].forEach((id) => {
        const target = document.getElementById(id);
        if (!target) return;
        target.replaceChildren();
        if (!filteredEntries.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-copy';
            empty.textContent = 'Aún no hay llegadas registradas.';
            target.appendChild(empty);
            return;
        }
        filteredEntries.forEach((entry) => target.appendChild(createHistoryItem(entry)));
    });
}

function filterHistory(entries) {
    const search = normalizeSearch(document.getElementById('activity-search')?.value);
    const method = document.getElementById('activity-method')?.value || 'todos';
    const result = document.getElementById('activity-result')?.value || 'todos';
    const time = document.getElementById('activity-time')?.value || 'todos';
    const minimum = time === '1h' ? Date.now() - 60 * 60 * 1000 : time === '24h' ? Date.now() - 24 * 60 * 60 * 1000 : 0;
    return entries.filter((entry) => {
        const text = normalizeSearch(`${entry.nombreInvitado} ${entry.codigoInvitado}`);
        return (!search || text.includes(search))
            && (method === 'todos' || entry.metodo === method)
            && (result === 'todos' || entry.resultado === result)
            && (!minimum || new Date(entry.fechaHora || 0).getTime() >= minimum);
    });
}

function normalizeSearch(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function createHistoryItem(entry) {
    const item = document.createElement('article');
    item.className = 'history-item';
    const main = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = entry.nombreInvitado || entry.codigoInvitado || 'Acceso registrado';
    const meta = document.createElement('span');
    meta.textContent = `${formatDateTime(entry.fechaHora)} · ${entry.pasesRegistrados} pase(s) · ${entry.metodo === 'qr' ? 'QR' : 'Manual'} · ${shortUser(entry.registradoPor)}`;
    main.append(title, meta);
    const result = document.createElement('span');
    result.className = `status-pill status-pill--${entry.resultado}`;
    result.textContent = entry.resultado === 'parcial' ? 'Parcial' : 'Aprobado';
    item.append(main, result);
    return item;
}

function openGuestHistory(guest, entries) {
    document.getElementById('portal-history-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'portal-history-modal';
    overlay.className = 'portal-modal-overlay';
    const dialog = document.createElement('section');
    dialog.className = 'portal-modal portal-modal--history';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = document.createElement('h2');
    title.textContent = `Historial · ${guest.nombre}`;
    const list = document.createElement('div');
    list.className = 'history-list';
    if (entries.length) entries.forEach((entry) => list.appendChild(createHistoryItem(entry)));
    else list.textContent = 'Sin accesos registrados.';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'button button--ghost';
    close.textContent = 'Cerrar';
    close.addEventListener('click', () => overlay.remove());
    dialog.append(title, list, close);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    close.focus();
}

function formatDateTime(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
        : 'Sin hora confirmada';
}

function shortUser(uid) {
    return uid ? `Operador ${uid.slice(0, 8)}` : 'Operador';
}
