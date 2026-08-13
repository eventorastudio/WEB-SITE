export const INVITATION_DRAFT_SCHEMA_VERSION = 2;
export const INVITATION_CONTENT_SCHEMA_VERSION = 1;

const FIELD_DEFINITIONS = [
    ['content.identity.primaryName', 'text', 120],
    ['content.identity.secondaryName', 'text', 120],
    ['content.identity.eventType', 'text', 80],
    ['content.identity.phrase', 'text', 240],
    ['content.schedule.date', 'date', 10],
    ['content.schedule.time', 'time', 5],
    ['content.place.city', 'text', 100],
    ['content.place.state', 'text', 100],
    ['content.welcome.eyebrow', 'text', 80],
    ['content.welcome.title', 'text', 140],
    ['content.welcome.message', 'text', 400],
    ['content.welcome.story', 'text', 1600],
    ['content.countdown.title', 'text', 120],
    ['content.countdown.preMessage', 'text', 240],
    ['content.countdown.arrivedMessage', 'text', 240],
    ['content.location.title', 'text', 120],
    ['content.location.intro', 'text', 400],
    ['locations.0.name', 'text', 140],
    ['locations.0.address', 'text', 240],
    ['locations.0.description', 'text', 500],
    ['content.dressCode.title', 'text', 120],
    ['content.dressCode.name', 'text', 120],
    ['content.dressCode.description', 'text', 500],
    ['content.dressCode.note', 'text', 300],
    ['content.rsvp.title', 'text', 120],
    ['content.rsvp.message', 'text', 500],
    ['content.rsvp.buttonLabel', 'text', 80],
    ['content.rsvp.deadline', 'date', 10],
    ['content.music.title', 'text', 120],
    ['content.music.text', 'text', 300],
    ['content.video.title', 'text', 120],
    ['content.video.subtitle', 'text', 180],
    ['content.video.intro', 'text', 400],
    ['content.gallery.title', 'text', 120],
    ['content.gallery.subtitle', 'text', 180],
    ['content.gallery.description', 'text', 500],
    ['content.gifts.title', 'text', 120],
    ['content.gifts.description', 'text', 500],
    ['content.gifts.ctaLabel', 'text', 80],
    ['content.passes.title', 'text', 120],
    ['content.passes.instructions', 'text', 400],
    ['content.itinerary.title', 'text', 120],
    ['content.itinerary.intro', 'text', 400],
    ['content.access.title', 'text', 120],
    ['content.access.description', 'text', 400],
    ['content.access.label', 'text', 80]
];

export const INVITATION_EDITABLE_FIELDS = Object.freeze(Object.fromEntries(
    FIELD_DEFINITIONS.map(([path, type, maxLength]) => [path, Object.freeze({ path, type, maxLength })])
));

export const PREVIEW_SEMANTIC_FALLBACKS = Object.freeze({
    primaryName: 'Tu evento',
    eventLine: 'Fecha por definir',
    welcomeTitle: 'Bienvenidos',
    countdownArrived: 'El gran día ha llegado.'
});

function text(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

export function normalizeInvitationDate(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const direct = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
        if (direct) return direct;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
    }
    if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
    const seconds = value.seconds ?? value._seconds;
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString().slice(0, 10);
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    return '';
}

export function createInvitationContent(eventData = {}) {
    return {
        identity: {
            primaryName: text(eventData.nombreEvento ?? eventData.nombre),
            secondaryName: text(eventData.nombreSecundario ?? eventData.subtituloEvento),
            eventType: text(eventData.tipoEvento),
            phrase: ''
        },
        schedule: {
            date: normalizeInvitationDate(eventData.fecha),
            time: text(eventData.hora)
        },
        place: {
            city: text(eventData.ciudad),
            state: text(eventData.estado)
        },
        welcome: { eyebrow: '', title: '', message: '', story: '' },
        countdown: { title: '', preMessage: '', arrivedMessage: '' },
        location: { title: '', intro: '' },
        dressCode: { title: '', name: '', description: '', note: '' },
        rsvp: { title: '', message: '', buttonLabel: '', deadline: '' },
        music: { title: '', text: '' },
        video: { title: '', subtitle: '', intro: '' },
        gallery: { title: '', subtitle: '', description: '' },
        gifts: { title: '', description: '', ctaLabel: '' },
        passes: { title: '', instructions: '' },
        itinerary: { title: '', intro: '' },
        access: { title: '', description: '', label: '' }
    };
}

export function createInitialLocations(eventData = {}) {
    const name = text(eventData.nombreLugar ?? eventData.lugar ?? eventData.venue);
    const address = text(eventData.direccion ?? eventData.address);
    const description = text(eventData.descripcionLugar);
    return [{ name, address, description }];
}

export function getDraftValue(draft, path) {
    if (!draft || typeof path !== 'string') return undefined;
    return path.split('.').reduce((value, key) => value?.[key], draft);
}

export function normalizeEditableDraftValue(path, value) {
    const definition = INVITATION_EDITABLE_FIELDS[path];
    if (!definition) throw new TypeError(`builder/unknown-editable-path:${String(path)}`);
    return String(value ?? '').slice(0, definition.maxLength);
}

export function setDraftValue(draft, path, value) {
    if (!draft || !INVITATION_EDITABLE_FIELDS[path]) {
        throw new TypeError(`builder/unknown-editable-path:${String(path)}`);
    }
    const keys = path.split('.');
    let target = draft;
    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        const nextKey = keys[index + 1];
        if (target[key] == null) target[key] = /^\d+$/.test(nextKey) ? [] : {};
        target = target[key];
    }
    target[keys.at(-1)] = normalizeEditableDraftValue(path, value);
}

export function cloneInvitationValue(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}
