import { portalState } from '../core/portal-state.js';
import { portalEventBus } from '../core/portal-event-bus.js';
import { PORTAL_EVENTS } from '../core/portal-event-types.js';

let cleanups = [];

export function initConnectivityManager() {
    destroyConnectivityManager();
    const update = () => {
        const online = navigator.onLine;
        portalState.set('connectivity', { online, syncing: false });
        document.querySelectorAll('[data-connection-status]').forEach((element) => {
            element.dataset.connection = online ? 'online' : 'offline';
            element.textContent = online ? 'En línea' : 'Sin conexión';
        });
        portalEventBus.emit(PORTAL_EVENTS.CONNECTIVITY_CHANGED, { online });
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    cleanups = [
        () => window.removeEventListener('online', update),
        () => window.removeEventListener('offline', update)
    ];
    update();
}

export function destroyConnectivityManager() {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
}
