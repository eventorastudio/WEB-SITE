// Contrato puro del ciclo de vida del evento.
// - estadoEvento: campo canónico administrado por los formularios del ADMIN.
// - estadoevento: variante legacy no gobernada; el frontend nuevo la ignora.
// - estado: región geográfica, nunca un estado operativo.

export const EVENT_LIFECYCLE_STATUSES = Object.freeze(['activo', 'borrador', 'finalizado']);

export function normalizeEventLifecycleStatus(eventData = {}) {
    const value = normalizeText(eventData?.estadoEvento);
    return EVENT_LIFECYCLE_STATUSES.includes(value) ? value : 'borrador';
}

/** “En curso” equivale al ciclo de vida Activo elegido por el ADMIN. */
export function isEventInProgress(eventData = {}) {
    return normalizeEventLifecycleStatus(eventData) === 'activo';
}

export function getEventStatusPresentation(eventData = {}) {
    const status = normalizeEventLifecycleStatus(eventData);
    if (status === 'activo') return { status, label: 'Activo', className: 'activo' };
    if (status === 'finalizado') return { status, label: 'Finalizado', className: 'finalizado' };
    return { status: 'borrador', label: 'Borrador', className: 'borrador' };
}

function normalizeText(value) {
    return typeof value === 'string'
        ? value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        : '';
}
