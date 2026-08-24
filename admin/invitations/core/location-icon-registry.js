const SVG_NS = 'http://www.w3.org/2000/svg';

// Stable, persisted keys. The SVG geometry stays local to the renderer/editor;
// documents only store one of these short keys.
export const LOCATION_ICON_KEYS = Object.freeze([
    'church', 'chapel', 'rings', 'heart', 'flower', 'hibiscus', 'party',
    'confetti', 'champagne', 'cocktail', 'wine', 'dinner', 'music', 'dancing',
    'dj', 'cake', 'star', 'moon', 'palm', 'beach', 'hotel', 'house', 'venue', 'location',
    'clock', 'camera', 'car', 'event'
]);

export const LOCATION_ICON_OPTIONS = Object.freeze([
    ['', 'Sin icono'], ['church', 'Iglesia'], ['chapel', 'Capilla'], ['rings', 'Anillos'],
    ['heart', 'Corazón'], ['flower', 'Flor'], ['hibiscus', 'Hibisco'], ['party', 'Fiesta'],
    ['confetti', 'Confeti'], ['champagne', 'Champaña'], ['cocktail', 'Cóctel'], ['wine', 'Vino'],
    ['dinner', 'Cena'], ['music', 'Música'], ['dancing', 'Baile'], ['dj', 'DJ'], ['cake', 'Pastel'],
    ['star', 'Estrella'], ['moon', 'Luna'], ['palm', 'Palmera'], ['beach', 'Playa'], ['hotel', 'Hotel'],
    ['house', 'Lugar'], ['venue', 'Venue'], ['location', 'Ubicación'], ['clock', 'Hora'], ['camera', 'Cámara'],
    ['car', 'Transporte'], ['event', 'Evento']
].map(([value, label]) => Object.freeze({ value, label })));

const ICON_PATHS = Object.freeze({
    church: ['M4 21h16M6 21V9h12v12M4 9h16M12 3v6M9.5 6h5M9 21v-5h6v5'],
    chapel: ['M4 21h16M6 21V11h12v10M4 11h16M12 4v7M9.5 7h5'],
    rings: ['M8 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm8 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z'],
    heart: ['m12 20-7-7a4.5 4.5 0 0 1 6.4-6.3L12 8.3l.6-1.6A4.5 4.5 0 0 1 19 13l-7 7Z'],
    flower: ['M12 12c-4-1-5-4-3-6 2-2 4 0 3 4 1-4 4-5 6-3 2 2 0 4-4 5 4-1 6 1 6 3 0 3-3 3-6 1 2 3 1 5-1 6-2 1-4-1-4-5-1 1-4 0-6-2-6-4 0-3 3-3 6-1Z','M12 12v9','M9.5 21h5'],
    hibiscus: ['M12 19c-2-4-6-5-7-8-1-3 2-5 5-2 1-4 5-4 5 0 3-3 6-1 5 2-1 3-5 4-7 8Z','M10 12h4'],
    party: ['M4 20 20 4M7 4h.01M17 20h.01M5 9h.01M19 11h.01M12 3h.01'],
    confetti: ['M5 19 19 5M4 5h.01M12 3h.01M20 11h.01M7 13h.01M16 20h.01'],
    champagne: ['M8 3h8l-2 7v9h3v2H7v-2h3v-9L8 3Zm1 5h6'],
    cocktail: ['M4 4h16l-8 8v7M9 21h6M12 12V4M17 3l2-2'],
    wine: ['M7 3h10l-1 6a4 4 0 0 1-3 3v6h3v2H8v-2h3v-6a4 4 0 0 1-3-3L7 3Zm1 4h8'],
    dinner: ['M6 3v8M4 3v7a2 2 0 0 0 4 0V3M6 10v11M16 3v18M16 3c3 2 3 5 0 7'],
    music: ['M9 18V5l10-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm10-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z'],
    dancing: ['M9 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 7l4 4 4-2M12 11l-2 8M12 11l6 8M7 7l-3 5'],
    dj: ['M4 4h16v16H4zM8 8h8v8H8zM12 10v4M10 12h4'],
    cake: ['M5 10h14v10H5zM3 10h18M8 6v4M12 4v6M16 6v4M7 14h10M7 17h10'],
    star: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z'],
    moon: ['M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z'],
    palm: ['M12 21V9M12 10C8 8 5 8 3 9c3 2 6 2 9 1Zm0-1c1-4 3-6 6-7 0 3-2 6-6 7Zm0 1c4-1 7 0 9 2-4 1-7 0-9-2Z'],
    beach: ['M3 18h18M6 18c1-5 4-8 6-8s5 3 6 8M12 10V4M9 6l3-2 3 2'],
    hotel: ['M4 21V5h16v16M4 9h16M8 13h2M14 13h2M8 17h2M14 17h2M10 5V2h4v3'],
    house: ['m3 11 9-8 9 8v9H3v-9ZM9 20v-5h6v5'],
    venue: ['M4 21h16M6 21V8h12v13M4 8h16M8 8V4h8v4M9 12h2M13 12h2M9 16h2M13 16h2'],
    location: ['M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z','M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
    clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z','M12 7v5l3 2'],
    camera: ['M4 7h4l1.5-2h5L16 7h4v12H4V7Z','M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
    car: ['M5 17h14l-1-7H6l-1 7ZM7 10l1-4h8l1 4M7 17v2M17 17v2M8 14h.01M16 14h.01'],
    event: ['M5 4h14v16H5zM8 2v4M16 2v4M5 9h14M8 13h3M8 16h6']
});

const DEFAULTS_BY_TYPE = Object.freeze({
    ceremony: ['church', 'location'],
    reception: ['rings', 'house'],
    party: ['party', 'house'],
    session: ['moon', 'location'],
    accommodation: ['hotel', 'hotel'],
    other: ['event', 'location']
});

export function normalizeLocationIconKey(value) {
    const key = String(value ?? '').trim();
    return LOCATION_ICON_KEYS.includes(key) ? key : '';
}

export function defaultLocationIconKeys(type) {
    const [categoryIcon, venueIcon] = DEFAULTS_BY_TYPE[type] ?? DEFAULTS_BY_TYPE.other;
    return { categoryIcon, venueIcon };
}

export function createLocationIcon(documentRoot, value, { className = '' } = {}) {
    const key = normalizeLocationIconKey(value);
    if (!key || !documentRoot?.createElementNS) return null;
    const svg = documentRoot.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (className) svg.setAttribute('class', className);
    ICON_PATHS[key].forEach((definition) => {
        const path = documentRoot.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', definition);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.7');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.append(path);
    });
    return svg;
}
