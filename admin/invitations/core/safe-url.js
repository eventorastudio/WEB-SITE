const BLOCKED_PROTOCOLS = Object.freeze(['javascript:', 'data:', 'vbscript:']);
function clean(value, maxLength = 2048) {
    return String(value ?? '').trim().slice(0, maxLength);
}

export function parseSafeUrl(value, { protocols = ['https:'] } = {}) {
    const candidate = clean(value);
    if (!candidate) return { ok: true, value: '', url: null };
    if (BLOCKED_PROTOCOLS.some((protocol) => candidate.toLowerCase().startsWith(protocol))) {
        return { ok: false, value: candidate, url: null, code: 'url/blocked-protocol' };
    }

    try {
        const url = new URL(candidate);
        if (!protocols.includes(url.protocol)) {
            return { ok: false, value: candidate, url: null, code: 'url/protocol-not-allowed' };
        }
        return { ok: true, value: url.href, url };
    } catch {
        return { ok: false, value: candidate, url: null, code: 'url/invalid' };
    }
}

export function safeUrlForField(value, field, linkType = 'custom') {
    const protocols = field === 'url' && linkType === 'contact'
        ? ['https:', 'mailto:', 'tel:']
        : ['https:'];
    return parseSafeUrl(value, { protocols });
}

export function safeUrlError(value, field, linkType = 'custom') {
    const result = safeUrlForField(value, field, linkType);
    if (result.ok) return '';
    if (result.code === 'url/blocked-protocol') return 'Este protocolo no está permitido.';
    if (result.code === 'url/protocol-not-allowed') return 'Usa una URL HTTPS válida.';
    return 'Escribe una URL completa y válida.';
}

export function normalizeWhatsAppPhone(value) {
    const source = clean(value, 32);
    if (!source) return '';
    const digits = source.replace(/\D/g, '');
    return /^\d{7,15}$/.test(digits) ? digits : '';
}

export function buildWhatsAppUrl({ phone = '', message = '' } = {}) {
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    if (!normalizedPhone) return '';
    const url = new URL(`https://wa.me/${normalizedPhone}`);
    const cleanMessage = clean(message, 1000);
    if (cleanMessage) url.searchParams.set('text', cleanMessage);
    return url.href;
}

function compactDate(value) {
    return String(value ?? '').replace(/-/g, '');
}

function compactTime(value) {
    return String(value ?? '').replace(':', '').padEnd(4, '0');
}

export function buildGoogleCalendarUrl(draft = {}, location = null) {
    const content = draft.content ?? {};
    const date = /^\d{4}-\d{2}-\d{2}$/.test(content.schedule?.date ?? '')
        ? compactDate(content.schedule.date)
        : '';
    if (!date) return '';
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(content.schedule?.time ?? '')
        ? compactTime(content.schedule.time)
        : '0000';
    const start = `${date}T${time}00`;
    const endDate = new Date(`${content.schedule.date}T${content.schedule?.time || '00:00'}:00`);
    endDate.setHours(endDate.getHours() + 4);
    const end = `${compactDate(endDate.toISOString().slice(0, 10))}T${compactTime(endDate.toTimeString().slice(0, 5))}00`;
    const identity = [content.identity?.primaryName, content.identity?.secondaryName]
        .map((value) => clean(value, 120)).filter(Boolean).join(' & ') || 'Evento';
    const venue = location ?? draft.locations?.[0] ?? {};
    const place = [venue.venueName, venue.address, venue.city, venue.state]
        .map((value) => clean(value, 240)).filter(Boolean).join(', ');
    const url = new URL('https://calendar.google.com/calendar/render');
    url.searchParams.set('action', 'TEMPLATE');
    url.searchParams.set('text', identity);
    url.searchParams.set('dates', `${start}/${end}`);
    if (place) url.searchParams.set('location', place);
    return url.href;
}

export const SAFE_URL_PROTOCOLS = Object.freeze({
    web: Object.freeze(['https:']),
    contact: Object.freeze(['https:', 'mailto:', 'tel:']),
    blocked: BLOCKED_PROTOCOLS
});
