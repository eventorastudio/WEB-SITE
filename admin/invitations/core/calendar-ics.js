export const DEFAULT_EVENT_DURATION_MINUTES = 240;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

export function escapeIcsText(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function localDateTime(date, time) {
    const dateMatch = DATE_RE.exec(String(date ?? ''));
    const timeMatch = TIME_RE.exec(String(time ?? ''));
    if (!dateMatch || !timeMatch || Number(timeMatch[1]) > 23 || Number(timeMatch[2]) > 59) return null;
    const year = Number(dateMatch[1]); const month = Number(dateMatch[2]); const day = Number(dateMatch[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
    return { year, month, day, hour: Number(timeMatch[1]), minute: Number(timeMatch[2]) };
}

function formatLocal({ year, month, day, hour, minute }) {
    return `${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}00`;
}

function addMinutes(value, minutes) {
    const date = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute + minutes));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
}

function stampUtc(now = new Date()) {
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}Z`;
}

function safeEventId(value) { return String(value ?? 'event').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100) || 'event'; }

export function safeIcsFilename(title = 'evento') {
    const slug = String(title).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    return `${slug || 'evento'}.ics`;
}

export function buildIcsEvent({ eventId, title, date, time, location = '', description = '', durationMinutes = DEFAULT_EVENT_DURATION_MINUTES, now } = {}) {
    const start = localDateTime(date, time);
    if (!start) return { ok: false, code: 'calendar/missing-date-time' };
    const end = addMinutes(start, Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : DEFAULT_EVENT_DURATION_MINUTES);
    const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eventora Studio//Invitation//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT', `UID:calendar-${safeEventId(eventId)}@eventorastudio.com`, `DTSTAMP:${stampUtc(now)}`, `DTSTART:${formatLocal(start)}`, `DTEND:${formatLocal(end)}`,
        `SUMMARY:${escapeIcsText(title || 'Evento')}`
    ];
    if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return { ok: true, content: `${lines.join('\r\n')}\r\n`, filename: safeIcsFilename(title || 'evento') };
}

export function downloadIcsEvent(result, documentRoot = document, urlApi = URL) {
    if (!result?.ok) return false;
    const blob = new Blob([result.content], { type: 'text/calendar;charset=utf-8' });
    const objectUrl = urlApi.createObjectURL(blob);
    const anchor = documentRoot.createElement('a');
    anchor.href = objectUrl; anchor.download = result.filename; anchor.rel = 'noopener'; anchor.style.display = 'none';
    documentRoot.body.append(anchor); anchor.click();
    window.setTimeout(() => { anchor.remove(); urlApi.revokeObjectURL(objectUrl); }, 1000);
    return true;
}
