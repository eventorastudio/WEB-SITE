export { DEFAULT_EVENT_DURATION_MINUTES, buildIcsEvent, escapeIcsText, safeIcsFilename } from '../../../shared/calendar-ics.js';

const CALENDAR_FUNCTION_ORIGIN = 'https://us-central1-eventorastudio-d6d95.cloudfunctions.net';
export function getPublicCalendarUrl({ eventId, publicKey } = {}) {
    const url = new URL(`${CALENDAR_FUNCTION_ORIGIN}/calendar`);
    url.searchParams.set('event', String(eventId ?? ''));
    url.searchParams.set('key', String(publicKey ?? ''));
    return url.href;
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
