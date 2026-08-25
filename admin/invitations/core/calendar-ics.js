export { DEFAULT_EVENT_DURATION_MINUTES, buildIcsEvent, calendarLocalTimestamp, escapeIcsText, safeIcsFilename } from '../../../shared/calendar-ics.js';

const CALENDAR_FUNCTION_ORIGIN = 'https://us-central1-eventorastudio-d6d95.cloudfunctions.net';
export function getPublicCalendarUrl({ eventId, publicKey, download = false } = {}) {
    const url = new URL(`${CALENDAR_FUNCTION_ORIGIN}/calendar`);
    url.searchParams.set('event', String(eventId ?? ''));
    url.searchParams.set('key', String(publicKey ?? ''));
    if (download) url.searchParams.set('download', '1');
    return url.href;
}

export function isAndroidPlatform(navigatorRoot = globalThis.navigator) {
    return /Android/i.test(String(navigatorRoot?.userAgent ?? ''));
}

function encodeIntentValue(value) {
    return encodeURIComponent(String(value ?? '')).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function buildAndroidCalendarIntent({ title, location, description, beginTime, endTime, fallbackUrl } = {}) {
    const extras = [
        ['S.title', title],
        ['S.eventLocation', location],
        ['S.description', description],
        ['l.beginTime', beginTime],
        ['l.endTime', endTime],
        ['S.browser_fallback_url', fallbackUrl]
    ].filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
        .map(([key, value]) => `${key}=${typeof value === 'number' ? String(value) : encodeIntentValue(value)}`);
    return `intent://calendar/events#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/event;${extras.join(';')};end`;
}

export async function handoffIcsEvent(result, {
    documentRoot = document,
    navigatorRoot = documentRoot.defaultView?.navigator ?? globalThis.navigator,
    urlApi = URL,
    onState = () => {},
    debug = false,
    title = 'Evento'
} = {}) {
    if (!result?.ok) return { ok: false, strategy: 'fallback', code: result?.code || 'calendar/invalid-event' };
    const fileApi = typeof File === 'function';
    const blob = new Blob([result.content], { type: 'text/calendar;charset=utf-8' });
    const file = fileApi ? new File([result.content], result.filename, { type: 'text/calendar;charset=utf-8' }) : null;
    const shareApi = typeof navigatorRoot?.share === 'function';
    const canShareFile = Boolean(file && typeof navigatorRoot?.canShare === 'function' && navigatorRoot.canShare({ files: [file] }));
    const platformAppleMobile = /iPad|iPhone|iPod/.test(navigatorRoot?.userAgent ?? '') || (navigatorRoot?.platform === 'MacIntel' && Number(navigatorRoot?.maxTouchPoints) > 1);
    const report = (strategy) => { if (debug) console.info('[Calendar action]', { platformAppleMobile, fileApi, shareApi, canShareFile, strategy, handlerInvoked: true }); };
    if (shareApi && canShareFile) {
        report('share-file'); onState('Preparando calendario…');
        try { await navigatorRoot.share({ files: [file], title }); onState(''); return { ok: true, strategy: 'share-file' }; }
        catch (error) { onState(error?.name === 'AbortError' ? '' : 'No fue posible abrir el calendario.'); if (error?.name === 'AbortError') return { ok: false, cancelled: true, strategy: 'share-file' }; }
    }
    report('blob-download'); onState('Preparando calendario…');
    const objectUrl = urlApi.createObjectURL(blob); const anchor = documentRoot.createElement('a');
    anchor.href = objectUrl; anchor.download = result.filename; anchor.rel = 'noopener'; anchor.style.display = 'none'; documentRoot.body.append(anchor); anchor.click(); anchor.remove();
    documentRoot.defaultView?.setTimeout(() => urlApi.revokeObjectURL(objectUrl), 1500); onState('');
    return { ok: true, strategy: 'blob-download', platformAppleMobile };
}
