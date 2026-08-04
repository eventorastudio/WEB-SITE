// core/theme-manager.js
// Punto único de verdad para la apariencia Light / Dark / System del panel Admin.

const THEME_STORAGE_KEY = 'eventora-admin:theme-preference';
const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';
const VALID_PREFERENCES = new Set(['light', 'dark', 'system']);

let systemMediaQuery = null;
let systemListenerBound = false;

/**
 * Inicializa el tema de la página actual y mantiene sincronizado el modo Sistema.
 * Es seguro invocarlo más de una vez en una misma página.
 * @returns {{ preference: 'light'|'dark'|'system', theme: 'light'|'dark' }}
 */
export function initThemeManager() {
    if (typeof document === 'undefined') return { preference: 'system', theme: 'light' };

    systemMediaQuery ??= window.matchMedia?.(SYSTEM_THEME_QUERY) ?? null;
    bindSystemListener();
    return applyThemePreference(getThemePreference());
}

/** @returns {'light'|'dark'|'system'} */
export function getThemePreference() {
    try {
        const storedPreference = localStorage.getItem(THEME_STORAGE_KEY);
        return VALID_PREFERENCES.has(storedPreference) ? storedPreference : 'system';
    } catch (error) {
        console.warn('[Theme Manager] No fue posible leer la preferencia de tema.', error);
        return 'system';
    }
}

/**
 * Guarda y aplica una nueva preferencia. Ninguna página debe manipular el tema directamente.
 * @param {'light'|'dark'|'system'} preference
 * @returns {{ preference: 'light'|'dark'|'system', theme: 'light'|'dark' }}
 */
export function setThemePreference(preference) {
    if (!VALID_PREFERENCES.has(preference)) {
        throw new Error(`theme-manager/invalid-preference:${preference}`);
    }

    try {
        localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch (error) {
        console.warn('[Theme Manager] No fue posible guardar la preferencia de tema.', error);
    }

    return applyThemePreference(preference);
}

/** @returns {'light'|'dark'} */
export function getResolvedTheme(preference = getThemePreference()) {
    if (preference === 'light' || preference === 'dark') return preference;
    return systemMediaQuery?.matches ? 'dark' : 'light';
}

function applyThemePreference(preference) {
    const theme = getResolvedTheme(preference);
    const root = document.documentElement;

    root.dataset.theme = theme;
    root.dataset.themePreference = preference;
    root.style.colorScheme = theme;
    document.dispatchEvent(new CustomEvent('eventora:theme-change', {
        detail: { preference, theme }
    }));

    return { preference, theme };
}

function bindSystemListener() {
    if (!systemMediaQuery || systemListenerBound) return;

    systemMediaQuery.addEventListener('change', () => {
        if (getThemePreference() === 'system') {
            applyThemePreference('system');
        }
    });
    systemListenerBound = true;
}
