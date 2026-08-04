// components/admin-shell.js
// Inicializa guardia de autenticación, encabezado y navegación compartida de páginas internas.

import { authService } from '../services/auth-service.js';
import { auth } from '../firebase.js';
import { CONFIG } from '../config.js';
import { hasPermission, PERMISSIONS, USER_ROLES, resolveRoleContext } from '../core/roles.js';
import { destroyProfileMenu, initProfileMenu } from '../core/profile-menu.js';

let cleanups = [];
let isShellBound = false;

/**
 * Arranca una página administrativa bajo el mismo ciclo de sesión y navegación.
 * @param {{requiredPermission: string, onReady: (context: Object) => (void|Promise<void>)}} options
 * @returns {void}
 */
export function initAdminShell({ requiredPermission, onReady }) {
    destroyAdminShell();

    const unsubscribe = authService.onAuthStateChange(async (user) => {
        if (!user) {
            window.location.assign(CONFIG.LOGOUT_REDIRECT);
            return;
        }

        const roleContext = await resolveRoleContext(auth.currentUser ?? user);
        if (!hasPermission(roleContext, requiredPermission)) {
            showAccessDenied();
            return;
        }

        renderShellUser(user, roleContext);
        bindShellEvents();
        revealPage();

        try {
            await onReady({ user, roleContext });
        } catch (error) {
            console.error('[Admin Shell] No se pudo inicializar el módulo de la página.', error);
            showPageError();
        }
    });

    if (typeof unsubscribe === 'function') cleanups.push(unsubscribe);
}

/** Libera listeners propios de la capa compartida. */
export function destroyAdminShell() {
    destroyProfileMenu();
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    isShellBound = false;
}

function renderShellUser(user, roleContext) {
    const name = user.displayName?.trim() || user.email?.split('@')[0] || 'Administrador';
    const initial = name.charAt(0).toUpperCase() || 'A';

    setText('shell-user-name', name);
    setText('shell-user-role', getRoleLabel(roleContext.role));
    setText('shell-user-avatar', initial);

    const systemLink = document.getElementById('shell-nav-system');
    if (systemLink) {
        systemLink.hidden = !hasPermission(roleContext, PERMISSIONS.SYSTEM_STATUS_VIEW);
    }

    document.documentElement.dataset.adminRole = roleContext.role;
}

function bindShellEvents() {
    if (isShellBound) return;
    isShellBound = true;

    const trigger = document.getElementById('shell-user-menu-trigger');
    const logoutButton = document.getElementById('shell-btn-logout');

    initProfileMenu({
        trigger,
        menu: document.getElementById('shell-user-dropdown') ?? trigger?.querySelector('.dropdown-menu')
    });

    listen(logoutButton, 'click', async (event) => {
        event.preventDefault();
        try {
            await authService.logout();
        } catch (error) {
            console.error('[Admin Shell] No se pudo cerrar la sesión.', error);
        }
    });
}

function revealPage() {
    const page = document.getElementById('admin-page-content');
    const guard = document.getElementById('auth-guard');

    page?.classList.add('admin-page-ready');
    if (!guard) return;

    guard.classList.add('auth-guard-leaving');
    window.setTimeout(() => guard.remove(), 280);
}

function showAccessDenied() {
    const guard = document.getElementById('auth-guard');
    if (!guard) return;

    guard.classList.add('auth-guard-message');
    guard.textContent = 'No tienes permisos para acceder a esta herramienta.';
}

function showPageError() {
    const error = document.getElementById('page-error-state');
    if (error) error.hidden = false;
}

function listen(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    cleanups.push(() => target.removeEventListener(eventName, handler));
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function getRoleLabel(role) {
    const labels = {
        [USER_ROLES.CEO]: 'CEO',
        [USER_ROLES.ADMINISTRADOR]: 'Administrador',
        [USER_ROLES.DISENADOR]: 'Diseñador',
        [USER_ROLES.VENTAS]: 'Ventas',
        [USER_ROLES.SOPORTE]: 'Soporte',
        [USER_ROLES.CLIENTE]: 'Cliente'
    };
    return labels[role] ?? 'No disponible';
}
