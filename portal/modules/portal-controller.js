import { buildPortalUrl, PORTAL_CONFIG } from '../config.js';
import { redirectToLogin, resolvePortalContext } from '../core/access-guard.js';
import { PORTAL_FEATURES } from '../core/entitlement-guard.js';
import { portalEventBus } from '../core/portal-event-bus.js';
import { PORTAL_EVENTS } from '../core/portal-event-types.js';
import { portalState } from '../core/portal-state.js';
import { portalUi } from '../core/portal-ui.js';
import { portalAuthService } from '../services/portal-auth-service.js';
import { portalEventService } from '../services/portal-event-service.js';
import { portalGuestService } from '../services/portal-guest-service.js';
import { checkinService } from '../services/checkin-service.js';
import { destroyConnectivityManager, initConnectivityManager } from './connectivity-manager.js';
import { destroyGuestSearch, initGuestSearch } from './guest-search.js';
import { destroyCheckinHistory, initCheckinHistory } from './checkin-history.js';
import { destroyLiveStats, initLiveStats } from './live-stats.js';
import { destroyQrScanner, initQrScanner } from './qr-scanner.js';

const PAGE_FEATURE = Object.freeze({
    dashboard: PORTAL_FEATURES.LIVE,
    invitados: PORTAL_FEATURES.PORTAL,
    'check-in': PORTAL_FEATURES.QR,
    actividad: PORTAL_FEATURES.HISTORY
});

let destroyers = [];

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
    const page = document.body.dataset.portalPage;
    if (!PAGE_FEATURE[page]) return;
    try {
        const context = await resolvePortalContext({ feature: PAGE_FEATURE[page] });
        const container = createContainer(context, page);
        await renderShell(container);
        startModules(container, page);
        registerLifecycle();
        portalState.set('ui', { page, ready: true });
        portalUi.revealPage();
        portalEventBus.emit(PORTAL_EVENTS.READY, { page, eventId: context.event.id });
    } catch (error) {
        handleAccessFailure(error);
    }
}

function createContainer(context, page) {
    return {
        state: portalState,
        ui: portalUi,
        eventBus: portalEventBus,
        services: {
            auth: portalAuthService,
            event: portalEventService,
            guest: portalGuestService,
            checkin: checkinService
        },
        context: { ...context, page }
    };
}

async function renderShell(container) {
    const { event, profile } = container.context;
    setText('portal-event-name', event.nombre);
    setText('portal-event-meta', formatEventMeta(event));
    setText('portal-client-name', profile.nombre || profile.correo || 'Cliente Prestige');
    setText('portal-user-initial', (profile.nombre || profile.correo || 'C').charAt(0).toUpperCase());
    document.title = `${event.nombre} · Prestige | Eventora Studio`;
    document.querySelectorAll('[data-portal-link]').forEach((link) => {
        link.href = buildPortalUrl(link.dataset.portalLink, event.id);
    });
    const eventSelector = document.getElementById('portal-event-selector');
    if (eventSelector) {
        const events = await portalEventService.getAuthorizedEventOptions(profile);
        eventSelector.replaceChildren();
        events.forEach((availableEvent) => {
            const option = document.createElement('option');
            option.value = availableEvent.id;
            option.textContent = availableEvent.nombre;
            option.selected = availableEvent.id === event.id;
            eventSelector.appendChild(option);
        });
        eventSelector.hidden = events.length < 2;
        eventSelector.addEventListener('change', () => {
            window.location.assign(buildPortalUrl(`${container.context.page}.html`, eventSelector.value));
        });
    }
    const logout = document.getElementById('portal-logout');
    logout?.addEventListener('click', async () => {
        portalUi.setBusy(logout, true, 'Cerrando sesión...');
        try {
            await portalAuthService.logout();
            portalEventBus.emit(PORTAL_EVENTS.LOGGED_OUT, {});
            window.location.assign(PORTAL_CONFIG.loginPath);
        } catch {
            portalUi.toast({ title: 'No fue posible cerrar sesión', message: 'Inténtalo nuevamente.', type: 'error' });
            portalUi.setBusy(logout, false);
        }
    });
}

function startModules(container, page) {
    initConnectivityManager();
    destroyers.push(destroyConnectivityManager);
    if (page === 'dashboard') {
        initLiveStats(container);
        destroyers.push(destroyLiveStats);
        if (container.context.entitlements.historialAccesos) {
            initCheckinHistory(container);
            destroyers.push(destroyCheckinHistory);
        } else {
            setText('recent-activity-list', 'El historial de accesos no está habilitado para este evento.');
        }
    }
    if (page === 'invitados') {
        initGuestSearch(container);
        destroyers.push(destroyGuestSearch);
        if (container.context.entitlements.historialAccesos) {
            initCheckinHistory(container);
            destroyers.push(destroyCheckinHistory);
        }
    }
    if (page === 'check-in') {
        initQrScanner(container);
        destroyers.push(destroyQrScanner);
    }
    if (page === 'actividad') {
        initCheckinHistory(container);
        destroyers.push(destroyCheckinHistory);
        const revert = document.getElementById('revert-checkin');
        if (revert) {
            revert.disabled = true;
            revert.title = checkinService.getRevertCapability().reason;
        }
    }
}

function registerLifecycle() {
    window.addEventListener('pagehide', destroyPortal, { once: true });
    window.addEventListener('beforeunload', destroyPortal, { once: true });
}

function destroyPortal() {
    destroyers.forEach((destroy) => {
        try { destroy(); } catch (error) { console.warn('[Portal] Cleanup error', error); }
    });
    destroyers = [];
    portalEventBus.clear();
}

function handleAccessFailure(error) {
    const code = String(error?.code || error?.message || 'portal/access-denied');
    portalEventBus.emit(PORTAL_EVENTS.ACCESS_DENIED, { code });
    if (code.includes('auth-required')) {
        redirectToLogin();
        return;
    }
    if (code.includes('feature-not-enabled')) {
        portalUi.showGate({
            kind: 'premium',
            title: 'Función exclusiva de Prestige',
            description: 'El control de accesos, escaneo QR y seguimiento en vivo no están habilitados para este evento.',
            actionLabel: 'Volver al acceso',
            onAction: redirectToLogin
        });
        return;
    }
    const descriptions = {
        'portal/event-not-found': 'El evento solicitado no existe o ya no está disponible.',
        'portal/event-not-assigned': 'Tu cuenta no tiene acceso a este evento.',
        'portal/profile-inactive': 'Tu cuenta de operación está desactivada.',
        'portal/profile-not-found': 'Tu cuenta aún no está configurada para el Portal Prestige.',
        'portal/role-not-allowed': 'Esta cuenta no tiene un rol permitido para el Portal Prestige.'
    };
    portalUi.showGate({
        title: 'Acceso denegado',
        description: descriptions[code] || 'No fue posible validar tus permisos para este evento.',
        actionLabel: 'Volver al acceso',
        onAction: redirectToLogin
    });
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function formatEventMeta(event) {
    const date = event.fecha ? new Date(event.fecha) : null;
    const formattedDate = date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(date)
        : 'Fecha por confirmar';
    return `${formattedDate}${event.hora ? ` · ${event.hora}` : ''} · ${event.ubicacion} · ${event.estado}`;
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch((error) => {
        console.warn('[Portal PWA] Service worker unavailable', error);
    }));
}
