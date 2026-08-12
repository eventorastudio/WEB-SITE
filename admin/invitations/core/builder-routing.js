const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,150}$/;

export function normalizeEventId(value) {
    if (typeof value !== 'string') return null;
    const eventId = value.trim();
    return EVENT_ID_PATTERN.test(eventId) ? eventId : null;
}

export function readBuilderRoute(search = '') {
    const params = new URLSearchParams(search);
    const rawEventId = params.get('event');
    return Object.freeze({
        eventId: normalizeEventId(rawEventId),
        hasEventParameter: rawEventId !== null,
        invalidEventParameter: rawEventId !== null && normalizeEventId(rawEventId) === null
    });
}

export function createBuilderUrl(eventId, basePath = 'builder.html') {
    const normalized = normalizeEventId(eventId);
    if (!normalized) return basePath;
    return `${basePath}?${new URLSearchParams({ event: normalized }).toString()}`;
}
