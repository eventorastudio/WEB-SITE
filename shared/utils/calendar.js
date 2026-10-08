const GOOGLE_CALENDAR_BASE = 'https://calendar.google.com/calendar/render?action=TEMPLATE';

export function toCalendarDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('Fecha inválida.');
    return date;
}

export function formatCalendarDate(value) {
    return toCalendarDate(value)
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
}

export function buildGoogleCalendarUrl({ title = '', start, end, location = '', description = '' }) {
    const params = new URLSearchParams({
        text: title,
        dates: `${formatCalendarDate(start)}/${formatCalendarDate(end)}`,
        location,
        details: description
    });
    return `${GOOGLE_CALENDAR_BASE}&${params.toString()}`;
}

export function escapeIcsText(value = '') {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/\r?\n/g, '\\n')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,');
}

export function buildIcsEvent({
    title = '',
    start,
    end,
    location = '',
    description = '',
    uid = `eventora-${Date.now()}@eventorastudio.com`,
    timestamp = new Date()
}) {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Eventora Studio//Website Utilities//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(uid)}`,
        `DTSTAMP:${formatCalendarDate(timestamp)}`,
        `DTSTART:${formatCalendarDate(start)}`,
        `DTEND:${formatCalendarDate(end)}`,
        `SUMMARY:${escapeIcsText(title)}`,
        `LOCATION:${escapeIcsText(location)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        'END:VEVENT',
        'END:VCALENDAR'
    ];
    return `${lines.join('\r\n')}\r\n`;
}
