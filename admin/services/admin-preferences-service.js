// services/admin-preferences-service.js
// Persistencia local y aislada de preferencias no cubiertas por el SDK actual.

const STORAGE_PREFIX = 'eventora-admin:';

const DEFAULT_SETTINGS = Object.freeze({
    language: 'es-MX',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'No disponible',
    dateFormat: 'DD/MM/AAAA',
    timeFormat: '24h',
    animations: true,
    compactView: false,
    sidebarExpanded: true
});

/** @returns {Object} Copia de las preferencias iniciales. */
export function getDefaultSettings() {
    return { ...DEFAULT_SETTINGS };
}

/**
 * Lee preferencias de una clave del usuario actual sin mezclar identidades.
 * @param {string} uid
 * @param {string} namespace
 * @param {Object} defaults
 * @returns {Object}
 */
export function getUserPreferences(uid, namespace, defaults = {}) {
    const stored = readJson(createKey(uid, namespace));
    return { ...defaults, ...(stored ?? {}) };
}

/**
 * Guarda preferencias serializables para el usuario activo.
 * @param {string} uid
 * @param {string} namespace
 * @param {Object} payload
 * @returns {Object}
 */
export function saveUserPreferences(uid, namespace, payload) {
    if (!uid) throw new Error('preferences/uid-required');
    const safePayload = JSON.parse(JSON.stringify(payload ?? {}));
    localStorage.setItem(createKey(uid, namespace), JSON.stringify(safePayload));
    return safePayload;
}

/**
 * Aplica las preferencias visuales que no pertenecen al sistema de temas.
 * Light / Dark / System es responsabilidad exclusiva de core/theme-manager.js.
 * @param {Object} settings
 * @returns {void}
 */
export function applyAdminDisplayPreferences(settings) {
    document.documentElement.classList.toggle('admin-compact', Boolean(settings?.compactView));
    document.documentElement.classList.toggle('admin-reduce-motion', settings?.animations === false);
}

/**
 * Elimina únicamente caches controladas por este módulo; no toca la sesión de Firebase.
 * @returns {Promise<{cacheEntries: number, localEntries: number}>}
 */
export async function clearAdminCache() {
    let cacheEntries = 0;
    let localEntries = 0;

    if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(async (cacheName) => {
            const removed = await caches.delete(cacheName);
            if (removed) cacheEntries += 1;
        }));
    }

    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(STORAGE_PREFIX)) {
            localStorage.removeItem(key);
            localEntries += 1;
        }
    }

    return { cacheEntries, localEntries };
}

function createKey(uid, namespace) {
    return `${STORAGE_PREFIX}${uid || 'anonymous'}:${namespace}`;
}

function readJson(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('[Admin Preferences] No fue posible leer preferencias locales.', error);
        return null;
    }
}
