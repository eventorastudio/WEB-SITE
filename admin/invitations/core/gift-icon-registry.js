const ICONS = Object.freeze([
    ['liverpool', 'Liverpool', 'M3 4h18v16H3z M7 8h10v8H7z'],
    ['macstore', 'MacStore', 'M12 4a4 4 0 0 0-4 4v8a4 4 0 0 0 8 0V8a4 4 0 0 0-4-4Z M5 12h14'],
    ['amazon', 'Amazon', 'M4 8h16v10H4z M7 8V6a5 5 0 0 1 10 0v2'],
    ['mercado-libre', 'Mercado Libre', 'M4 11h16v8H4z M7 11V8a5 5 0 0 1 10 0v3'],
    ['palacio', 'Palacio de Hierro', 'M4 5h16v14H4z M8 5v14 M16 5v14 M4 10h16'],
    ['sears', 'Sears', 'M4 5h16v14H4z M8 5v14 M16 5v14'],
    ['coppel', 'Coppel', 'M7 5h10v14H7z M7 9h10 M7 15h10'],
    ['walmart', 'Walmart', 'M12 3v18 M3 12h18 M5.6 5.6l12.8 12.8 M18.4 5.6 5.6 18.4'],
    ['target', 'Target', 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
    ['apple', 'Apple', 'M12 8c-2-3 1-5 3-5 0 2-1 4-3 5-1 2 1 3 3 3 5-2 0-4 1-4 4 0 3 2 4 3 4-1 3-2 5-5 5s-3-2-5-2-4 2-5-5c0-4 2-6 5-6Z'],
    ['ikea', 'IKEA', 'M4 6h16v12H4z M8 6v12 M16 6v12 M4 12h16'],
    ['gift', 'Regalo', 'M4 10h16v10H4z M12 10v10 M3 10h18v4H3z M12 10H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z'],
    ['envelope', 'Sobre', 'M3 6h18v12H3z M3 7l9 7 9-7'],
    ['cash', 'Efectivo', 'M4 6h16v12H4z M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z'],
    ['card', 'Tarjeta', 'M3 6h18v12H3z M3 10h18'],
    ['bank', 'Banco', 'M3 10h18 M5 10v8 M9 10v8 M15 10v8 M19 10v8 M3 18h18 M12 4l9 6H3l9-6Z'],
    ['transfer', 'Transferencia', 'M4 8h12 M12 4l4 4-4 4 M20 16H8 M12 12l-4 4 4 4'],
    ['heart', 'Corazón', 'M12 20S4 15 4 9a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 6-8 11-8 11Z'],
    ['star', 'Estrella', 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6-3-5.6 3 1.1-1.8-4.5-4.4 6.2-.9L12 3Z'],
    ['rings', 'Anillos', 'M9 15a4 4 0 1 1 0-8h2a4 4 0 1 1 0 8H9Zm4-7h2a4 4 0 1 1 0 8h-2'],
    ['home', 'Hogar', 'M3 11l9-7 9 7v9H3z M9 20v-6h6v6'],
    ['travel', 'Viaje', 'M4 15l7-2 5-8 2 1-3 8 5 2-1 2-6-1-5 3Z'],
    ['honeymoon', 'Luna de miel', 'M12 20S4 15 4 9a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 6-8 11-8 11Z M19 3v4 M17 5h4'],
    ['none', 'Sin icono', '']
]);

export const GIFT_ICON_OPTIONS = Object.freeze(ICONS.map(([value, label]) => Object.freeze({ value, label })));
export const GIFT_ICON_KEYS = Object.freeze(GIFT_ICON_OPTIONS.map(({ value }) => value));
const ICON_PATHS = new Map(ICONS.map(([value, , path]) => [value, path]));
const ICON_LABELS = new Map(GIFT_ICON_OPTIONS.map(({ value, label }) => [value, label]));

export function normalizeGiftIconKey(value) {
    return GIFT_ICON_KEYS.includes(value) ? value : 'gift';
}

export function inferGiftIconKey({ name = '', type = '', iconKey } = {}) {
    if (GIFT_ICON_KEYS.includes(iconKey)) return iconKey;
    const text = String(name).toLowerCase().replace(/[áéíóú]/g, (char) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }[char]));
    const match = ['liverpool', 'macstore', 'amazon', 'mercado-libre', 'palacio', 'sears', 'coppel', 'walmart', 'target', 'apple', 'ikea'].find((key) => text.includes(key.replace('-', ' ')) || text.includes(key));
    if (match) return match;
    if (type === 'cash') return 'cash';
    if (type === 'transfer') return 'bank';
    if (text.includes('sobre')) return 'envelope';
    if (text.includes('tarjeta')) return 'card';
    return 'gift';
}

export function getGiftIconLabel(key) { return ICON_LABELS.get(normalizeGiftIconKey(key)) ?? 'Regalo'; }

export function createGiftIcon(documentRoot, key, { className = 'gift-icon' } = {}) {
    const normalized = normalizeGiftIconKey(key);
    if (normalized === 'none') return null;
    const svg = documentRoot.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add(className);
    const path = documentRoot.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICON_PATHS.get(normalized) || ICON_PATHS.get('gift'));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    return svg;
}
