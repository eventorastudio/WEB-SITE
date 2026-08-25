import { buildIcsEvent } from '../generated/calendar-ics.js';

const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,150}$/;
const PUBLIC_KEY_RE = /^[a-f0-9]{48}$/;

export function createCalendarHttpHandler({ db, now = () => new Date() } = {}) {
    return async (request, response) => {
        if (request.method !== 'GET') { response.status(405).set('Allow', 'GET').send('Method not allowed.'); return; }
        const eventId = String(request.query?.event ?? '');
        const publicKey = String(request.query?.key ?? '');
        if (!EVENT_ID_RE.test(eventId) || !PUBLIC_KEY_RE.test(publicKey)) { response.status(404).send('Not found.'); return; }
        try {
            const snapshot = await db.doc(`eventos/${eventId}/invitacionPublic/${publicKey}`).get();
            if (!snapshot.exists) { response.status(404).send('Not found.'); return; }
            const projection = snapshot.data() ?? {};
            const content = projection.content ?? {};
            const location = projection.locations?.[0] ?? {};
            const title = [content.identity?.primaryName, content.identity?.secondaryName].filter(Boolean).join(' & ') || 'Evento';
            const result = buildIcsEvent({
                eventId,
                title,
                date: content.schedule?.date,
                time: content.schedule?.time,
                location: [location.venueName, location.address, location.city, location.state].filter(Boolean).join(', '),
                description: content.welcome?.message || content.identity?.eventType || '',
                now: now()
            });
            if (!result.ok) { response.status(422).send('Calendar data unavailable.'); return; }
            response.set('Content-Type', 'text/calendar; charset=utf-8');
            const download = String(request.query?.download ?? '') === '1';
            response.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${result.filename}"`);
            response.set('Cache-Control', 'public, max-age=300');
            response.status(200).send(result.content);
        } catch {
            response.status(404).send('Not found.');
        }
    };
}
