import { portalEventBus } from '../core/portal-event-bus.js';
import { PORTAL_EVENTS } from '../core/portal-event-types.js';

let unsubscribe = null;

export function initLiveStats(container) {
    destroyLiveStats();
    const { event, guest } = container.services;
    const eventId = container.context.event.id;
    unsubscribe = guest.subscribeGuests(eventId, (guests) => {
        const stats = calculateLiveStats(guests);
        renderLiveStats(stats);
        portalEventBus.emit(PORTAL_EVENTS.GUESTS_UPDATED, { guests, stats });
    }, () => container.ui.toast({ title: 'Datos sin actualizar', message: 'No fue posible actualizar las estadísticas en vivo.', type: 'warning' }));
}

export function destroyLiveStats() {
    unsubscribe?.();
    unsubscribe = null;
}

export function calculateLiveStats(guests) {
    return guests.reduce((totals, guest) => {
        totals.grupos += 1;
        totals.pases += guest.pases;
        totals.utilizados += guest.pasesUtilizados;
        if (guest.estado === 'confirmado' || guest.estado === 'llego') totals.confirmados += guest.pases;
        if (guest.estado === 'pendiente') totals.pendientes += guest.pases;
        if (guest.estado === 'no_asistira') totals.noAsistiran += guest.pases;
        if (guest.pasesUtilizados > 0) totals.gruposLlegaron += 1;
        if (guest.pasesUtilizados === 0) totals.gruposPendientes += 1;
        return totals;
    }, { grupos: 0, pases: 0, utilizados: 0, confirmados: 0, pendientes: 0, noAsistiran: 0, gruposLlegaron: 0, gruposPendientes: 0 });
}

function renderLiveStats(stats) {
    const values = {
        'stat-groups': stats.grupos,
        'stat-passes': stats.pases,
        'stat-confirmed': stats.confirmados,
        'stat-pending': stats.pendientes,
        'stat-no-attendance': stats.noAsistiran,
        'stat-arrivals': stats.utilizados,
        'stat-remaining': Math.max(stats.pases - stats.utilizados, 0),
        'stat-attendance': stats.pases ? `${Math.round((stats.utilizados / stats.pases) * 100)}%` : '0%'
    };
    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    });
}
