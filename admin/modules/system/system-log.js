// modules/system/system-log.js
// Registra exclusivamente eventos observados durante la sesión actual.

import { eventBus } from '../../core/event-bus.js';
import { EVENT_TYPES } from '../../core/event-types.js';

const EVENT_LABELS = Object.freeze({
    [EVENT_TYPES.EVENT_LOADED]: 'Evento cargado',
    [EVENT_TYPES.EVENT_UPDATED]: 'Configuración de evento actualizada',
    [EVENT_TYPES.GUEST_IMPORTED]: 'Invitados importados',
    [EVENT_TYPES.GUEST_CREATED]: 'Invitado creado',
    [EVENT_TYPES.GUEST_UPDATED]: 'Invitado actualizado',
    [EVENT_TYPES.GUEST_DELETED]: 'Invitado eliminado',
    [EVENT_TYPES.LOGIN_SUCCESS]: 'Usuario autenticado',
    [EVENT_TYPES.LOGIN_FAILED]: 'Error de autenticación',
    [EVENT_TYPES.THEME_SAVED]: 'Configuración guardada'
});

export function createSystemLog(onChange) {
    const entries = [];
    const unsubscribers = [];

    Object.entries(EVENT_LABELS).forEach(([eventType, message]) => {
        const unsubscribe = eventBus.on(eventType, () => {
            entries.unshift({ message, type: 'event', timestamp: new Date() });
            entries.splice(18);
            onChange?.([...entries]);
        });
        unsubscribers.push(unsubscribe);
    });

    return {
        record(message, type = 'info') {
            entries.unshift({ message, type, timestamp: new Date() });
            entries.splice(18);
            onChange?.([...entries]);
        },
        getEntries() { return [...entries]; },
        destroy() { unsubscribers.forEach((unsubscribe) => unsubscribe?.()); }
    };
}
