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
    PROFILE_VIEW: 'profile:view',
    PROFILE_EDIT: 'profile:edit',
    SETTINGS_VIEW: 'settings:view',
    SETTINGS_EDIT: 'settings:edit',
    SYSTEM_STATUS_VIEW: 'system-status:view',
    DEVELOPER_TOOLS: 'developer:tools'
});

const ROLE_PERMISSIONS = Object.freeze({
    [USER_ROLES.CEO]: Object.values(PERMISSIONS),
    [USER_ROLES.ADMINISTRADOR]: [PERMISSIONS.PROFILE_VIEW, PERMISSIONS.PROFILE_EDIT, PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT],
    [USER_ROLES.DISENADOR]: [PERMISSIONS.PROFILE_VIEW, PERMISSIONS.PROFILE_EDIT, PERMISSIONS.SETTINGS_VIEW],
    [USER_ROLES.VENTAS]: [PERMISSIONS.PROFILE_VIEW, PERMISSIONS.PROFILE_EDIT],
    [USER_ROLES.SOPORTE]: [PERMISSIONS.PROFILE_VIEW, PERMISSIONS.PROFILE_EDIT],
    [USER_ROLES.CLIENTE]: []
});

/**
 * Resuelve el rol desde custom claims cuando existan. Mientras el panel tenga
 * exclusivamente al CEO, el rol inicial documentado por producto es CEO.
 * @param {import('firebase/auth').User|null} user
 * @returns {Promise<{role: string, permissions: string[], source: string}>}
 */
export async function resolveRoleContext(user) {
    let claimedRole = null;

    try {
        const tokenResult = await user?.getIdTokenResult?.();
        claimedRole = tokenResult?.claims?.role ?? tokenResult?.claims?.userRole ?? null;
    } catch (error) {
        console.warn('[Roles] No fue posible leer los custom claims del usuario.', error);
    }

    const normalizedRole = normalizeRole(claimedRole);
    const role = normalizedRole ?? USER_ROLES.CEO;

    return {
        role,
        permissions: [...(ROLE_PERMISSIONS[role] ?? [])],
        source: normalizedRole ? 'custom-claim' : 'current-ceo-bootstrap'
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
function normalizeRole(value) {
    if (typeof value !== 'string') return null;

    const candidate = value.trim().toUpperCase().replace(/[ÁÀÄ]/g, 'A').replace(/Ñ/g, 'N').replace(/[ÉÈË]/g, 'E').replace(/[ÍÌÏ]/g, 'I').replace(/[ÓÒÖ]/g, 'O').replace(/[ÚÙÜ]/g, 'U');
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
