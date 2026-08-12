import { portalEventBus } from '../core/portal-event-bus.js';
import { PORTAL_EVENTS } from '../core/portal-event-types.js';
import { calculateEventStats } from '../../shared/event-stats.js';

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
    const stats = calculateEventStats(guests);
    return {
        grupos: stats.guestCount,
        pases: stats.totalPases,
        utilizados: stats.pasesUtilizados,
        confirmados: stats.pasesConfirmados,
        pendientes: stats.pasesPendientes,
        noAsistiran: stats.pasesNoAsistiran,
        gruposLlegaron: stats.gruposConLlegada,
        gruposPendientes: stats.guestCount - stats.gruposConLlegada
    };
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
