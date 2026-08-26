export const DEVICE_CATEGORIES = Object.freeze(['desktop', 'tablet', 'mobile']);
export const DEVICE_LABELS = Object.freeze({ desktop: 'PC', tablet: 'Tablet', mobile: 'Móvil' });
export const DEVICE_BREAKPOINTS = Object.freeze({ mobileMax: 730, tabletMax: 1050 });
export const DEFAULT_DEVICE_AVAILABILITY = Object.freeze({ desktop: true, tablet: true, mobile: true });

export function normalizeDeviceAvailability(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const normalized = Object.fromEntries(DEVICE_CATEGORIES.map((category) => [
        category,
        source[category] === false ? false : true
    ]));
    return Object.values(normalized).some(Boolean) ? normalized : { ...DEFAULT_DEVICE_AVAILABILITY };
}

export function getDeviceCategory(width = globalThis.innerWidth) {
    const viewportWidth = Number(width);
    if (!Number.isFinite(viewportWidth) || viewportWidth <= DEVICE_BREAKPOINTS.mobileMax) return 'mobile';
    if (viewportWidth <= DEVICE_BREAKPOINTS.tabletMax) return 'tablet';
    return 'desktop';
}

export function isDeviceAllowed(availability, category = getDeviceCategory()) {
    return normalizeDeviceAvailability(availability)[category] === true;
}

export function formatAllowedDevices(availability) {
    const labels = DEVICE_CATEGORIES
        .filter((category) => normalizeDeviceAvailability(availability)[category])
        .map((category) => DEVICE_LABELS[category]);
    if (labels.length <= 1) return labels[0] || DEVICE_LABELS.mobile;
    if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
    return `${labels[0]}, ${labels[1]} y ${labels[2]}`;
}
