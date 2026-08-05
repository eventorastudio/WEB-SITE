export const PORTAL_CONFIG = Object.freeze({
    appName: 'Eventora Studio Prestige',
    loginPath: './index.html',
    defaultPage: 'dashboard.html',
    storageKey: 'eventora-prestige:theme',
    defaultTheme: 'dark'
});

export function getRequestedEventId() {
    const value = new URLSearchParams(window.location.search).get('event');
    return value ? value.trim() : '';
}

export function buildPortalUrl(page, eventId) {
    const url = new URL(page, window.location.href);
    if (eventId) url.searchParams.set('event', eventId);
    return `${url.pathname}${url.search}`;
}
