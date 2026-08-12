// core/roles.js
// Catálogo y resolución de permisos para las vistas internas de Eventora Studio.

export const USER_ROLES = Object.freeze({
    CEO: 'CEO',
    ADMINISTRADOR: 'ADMINISTRADOR',
    DISENADOR: 'DISENADOR',
    VENTAS: 'VENTAS',
    SOPORTE: 'SOPORTE',
    CLIENTE: 'CLIENTE'
});

export const PERMISSIONS = Object.freeze({
    EVENTS_VIEW: 'events:view',
    EVENTS_EDIT: 'events:edit',
    GUESTS_VIEW: 'guests:view',
    GUESTS_EDIT: 'guests:edit',
    QR_EXPORT: 'qr:export',
    PROFILE_VIEW: 'profile:view',
    PROFILE_EDIT: 'profile:edit',
    SETTINGS_VIEW: 'settings:view',
    SETTINGS_EDIT: 'settings:edit',
    SYSTEM_STATUS_VIEW: 'system-status:view',
    DEVELOPER_TOOLS: 'developer:tools'
});

const ROLE_PERMISSIONS = Object.freeze({
    [USER_ROLES.CEO]: Object.values(PERMISSIONS),
    [USER_ROLES.ADMINISTRADOR]: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.EVENTS_EDIT, PERMISSIONS.GUESTS_VIEW, PERMISSIONS.GUESTS_EDIT, PERMISSIONS.PROFILE_VIEW, PERMISSIONS.PROFILE_EDIT, PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT],
    [USER_ROLES.DISENADOR]: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.PROFILE_VIEW, PERMISSIONS.PROFILE_EDIT, PERMISSIONS.SETTINGS_VIEW],
    [USER_ROLES.VENTAS]: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.GUESTS_VIEW, PERMISSIONS.PROFILE_VIEW, PERMISSIONS.PROFILE_EDIT],
    [USER_ROLES.SOPORTE]: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.PROFILE_VIEW, PERMISSIONS.PROFILE_EDIT],
    [USER_ROLES.CLIENTE]: []
});

/**
 * Resuelve el rol exclusivamente desde custom claims firmados por Firebase.
 * Nunca eleva a CEO por ausencia de claim ni por datos aportados por la UI.
 * @param {import('firebase/auth').User|null} user
 * @returns {Promise<{role: string, permissions: string[], source: string}>}
 */
export async function resolveRoleContext(user, { forceRefresh = false } = {}) {
    let claimedRole = null;

    try {
        const tokenResult = await user?.getIdTokenResult?.(forceRefresh);
        claimedRole = tokenResult?.claims?.role ?? tokenResult?.claims?.userRole ?? null;
    } catch (error) {
        const wrapped = new Error(error?.message || 'No fue posible leer los custom claims.');
        wrapped.code = error?.code || 'admin/claims-unavailable';
        wrapped.cause = error;
        throw wrapped;
    }

    const normalizedRole = normalizeRole(claimedRole);
    const role = normalizedRole;

    return {
        role,
        permissions: [...(ROLE_PERMISSIONS[role] ?? [])],
        source: normalizedRole ? 'custom-claim' : 'missing-claim',
        isInternal: Boolean(normalizedRole && normalizedRole !== USER_ROLES.CLIENTE),
        isCeo: normalizedRole === USER_ROLES.CEO
    };
}

/**
 * Comprueba un permiso sin exponer detalles de la implementación de roles.
 * @param {{permissions?: string[]}|null} roleContext
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(roleContext, permission) {
    return Boolean(roleContext?.permissions?.includes(permission));
}

/**
 * Convierte una etiqueta externa al catálogo interno sin asumir valores nuevos.
 * @param {*} value
 * @returns {string|null}
 */
export function normalizeRole(value) {
    if (typeof value !== 'string') return null;

    const candidate = value.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const aliases = {
        CEO: USER_ROLES.CEO,
        ADMIN: USER_ROLES.ADMINISTRADOR,
        ADMINISTRADOR: USER_ROLES.ADMINISTRADOR,
        DISENADOR: USER_ROLES.DISENADOR,
        VENTAS: USER_ROLES.VENTAS,
        SOPORTE: USER_ROLES.SOPORTE,
        CLIENTE: USER_ROLES.CLIENTE
    };

    return aliases[candidate] ?? null;
}
