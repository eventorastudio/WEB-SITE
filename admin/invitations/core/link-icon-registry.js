const ICONS = Object.freeze([
    ['calendar', 'Calendario', 'M4 5h16v15H4z M7 3v4 M17 3v4 M4 9h16 M8 13h3v3H8z'],
    ['google-calendar', 'Google Calendar', 'M5 4h14v16H5z M5 8h14 M9 12h6v5H9z'],
    ['apple-calendar', 'Apple Calendar', 'M5 4h14v16H5z M8 3v4 M16 3v4 M5 9h14'],
    ['whatsapp', 'WhatsApp', 'M12 4a8 8 0 0 0-7 12l-1 4 4-1a8 8 0 1 0 4-15Z M9 9c1 3 3 5 6 6l1-1-2-2-1 1c-1 0-2-1-3-2l1-1-1-2Z'],
    ['instagram', 'Instagram', 'M5 5h14v14H5z M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z M16.5 7.5h.01'],
    ['facebook', 'Facebook', 'M13 21v-8h3l.5-3H13V8c0-1 .4-2 2-2h1.5V3.2C16 3.1 15 3 14 3c-3 0-5 2-5 5v2H6v3h3v8'],
    ['google-maps', 'Google Maps', 'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z M9.5 10a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z'],
    ['apple-maps', 'Apple Maps', 'M5 5l5-2 4 2 5-2v16l-5 2-4-2-5 2z M10 3v16 M14 5v16'],
    ['waze', 'Waze', 'M4 12a8 8 0 0 1 16 0v3H7l-3-3Z M9 12h.01 M15 12h.01 M9 18h6'],
    ['location', 'Ubicación', 'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z M10 10a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z'],
    ['phone', 'Teléfono', 'M7 4l3 2-2 3c1 3 3 4 5 5l3-2 2 3-2 2c-5 1-11-5-10-10Z'],
    ['email', 'Email', 'M4 6h16v12H4z M4 7l8 6 8-6'],
    ['website', 'Sitio web', 'M4 5h16v14H4z M8 9h8 M8 13h5'],
    ['spotify', 'Spotify', 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M8 10c3-1 6-1 9 1 M8 13c3-1 5-1 8 1 M9 16c2 0 4 0 6 1'],
    ['youtube', 'YouTube', 'M4 7h16v10H4z M10 10l5 2-5 3z'],
    ['camera', 'Cámara', 'M4 7h4l1-2h6l1 2h4v12H4z M9 13a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z'],
    ['heart', 'Corazón', 'M12 20S4 15 4 9a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 6-8 11-8 11Z'],
    ['gift', 'Regalo', 'M4 10h16v10H4z M12 10v10 M3 10h18v4H3z'],
    ['external-link', 'Link externo', 'M13 5h6v6 M19 5l-9 9 M18 13v5H5V5h5'],
    ['info', 'Información', 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M12 11v5 M12 8h.01'],
    ['none', 'Sin icono', '']
]);

export const LINK_ICON_OPTIONS = Object.freeze(ICONS.map(([value, label]) => Object.freeze({ value, label })));
export const LINK_ICON_KEYS = Object.freeze(LINK_ICON_OPTIONS.map(({ value }) => value));
const PATHS = new Map(ICONS.map(([value, , path]) => [value, path]));

export function normalizeLinkIconKey(value) { return LINK_ICON_KEYS.includes(value) ? value : ''; }

export function inferLinkIconKey({ type = 'custom', iconKey } = {}) {
    const explicit = normalizeLinkIconKey(iconKey);
    if (explicit) return explicit;
    return ({ calendar: 'calendar', whatsapp: 'whatsapp', instagram: 'instagram', maps: 'google-maps', location: 'location', contact: 'phone', email: 'email', transport: 'location', custom: 'external-link' })[type] ?? 'external-link';
}

export function createLinkIcon(documentRoot, key, { className = 'link-icon' } = {}) {
    const normalized = normalizeLinkIconKey(key);
    if (!normalized || normalized === 'none') return null;
    const svg = documentRoot.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.classList.add(className);
    const path = documentRoot.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', PATHS.get(normalized)); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.5'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); svg.append(path);
    return svg;
}
