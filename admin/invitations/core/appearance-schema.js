const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeAppearance(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        const error = new TypeError('draft/invalid-appearance-shape');
        error.code = 'draft/invalid-appearance-shape';
        throw error;
    }
    const keys = Object.keys(value);
    if (keys.some((key) => key !== 'accentColor')) {
        const error = new TypeError('draft/invalid-appearance-shape');
        error.code = 'draft/invalid-appearance-shape';
        throw error;
    }
    const accentColor = value.accentColor;
    if (accentColor == null || accentColor === '') return {};
    if (typeof accentColor !== 'string' || !HEX_COLOR.test(accentColor)) {
        const error = new TypeError('draft/invalid-appearance-accent-color');
        error.code = 'draft/invalid-appearance-accent-color';
        throw error;
    }
    return { accentColor: accentColor.toLowerCase() };
}

export function isAppearanceColor(value) {
    return typeof value === 'string' && HEX_COLOR.test(value);
}
