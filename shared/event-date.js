// Contrato único para fechas civiles de eventos.
// No convierte timestamps ni aplica zonas horarias: YYYY-MM-DD representa
// exactamente el día local/civil elegido para el evento.

export const EVENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const EVENT_DATE_YEAR_MIN = 1900;
export const EVENT_DATE_YEAR_MAX = 2200;

export function isValidEventDate(value) {
    if (typeof value !== 'string' || !EVENT_DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < EVENT_DATE_YEAR_MIN || year > EVENT_DATE_YEAR_MAX) return false;
    const civil = new Date(Date.UTC(year, month - 1, day));
    return civil.getUTCFullYear() === year
        && civil.getUTCMonth() === month - 1
        && civil.getUTCDate() === day;
}

export function normalizeEventDate(value, { strict = false } = {}) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (isValidEventDate(normalized)) return normalized;
    if (strict) throw new TypeError('event-date/invalid-civil-date');
    return '';
}

export function compareEventDates(left, right) {
    const a = normalizeEventDate(left, { strict: true });
    const b = normalizeEventDate(right, { strict: true });
    return a === b ? 0 : (a < b ? -1 : 1);
}
