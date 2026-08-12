// admin/event.js
import { authService } from './services/auth-service.js';
import { eventService } from './services/event-service.js';
import { guestService } from './services/guest-service.js';
import { themeService } from './services/theme-service.js';
import { state } from './core/state.js';
import { ui } from './core/ui.js';
import { eventBus } from './core/event-bus.js';
import { EVENT_TYPES } from './core/event-types.js';
import { CONFIG } from './config.js';
import { initThemeManager } from './core/theme-manager.js';
import { createAdminAccessError, reportAdminFirebaseError } from './core/firebase-errors.js';
import { hasPermission, PERMISSIONS } from './core/roles.js';

// --- RUTAS CORREGIDAS ---
import { initExcelImport, destroyExcelImport } from './modules/guests/excel-import.js';
import { initInvitationEditor } from './modules/editor/invitation-editor.js';
import { initInvitationPreview, destroy as destroyInvitationPreview } from './modules/editor/invitation-preview.js';
import { initThemes, destroy as destroyThemes } from './modules/themes/themes.js';
import { initThemeBuilder, destroy as destroyThemeBuilder } from './modules/themes/theme-builder.js';
import {
    initEventController,
    destroy as destroyEventController
} from './modules/event-controller.js';
import { initQrManager, destroyQrManager } from './modules/qr/qr-manager.js';

let activeModulesDestroyers = [];

initThemeManager();

document.addEventListener('DOMContentLoaded', async () => {
    await boot();
});

async function boot() {
    try {
        ui.showLoader({ text: 'Preparando entorno de administración...' });

        const eventId = extractEventIdFromUrl();
        if (!eventId) return;

        const session = await authenticateUser();
        if (!session) return;

        await loadEventData(session, eventId);

    } catch (error) {
        ui.hideLoader();
        const detail = reportAdminFirebaseError(error, { operation: 'event/boot', collection: 'eventos' });
        ui.showError({
            title: detail.title,
            description: detail.userMessage,
            code: detail.code
        });
    }
}

function extractEventIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('id');

    if (!eventId) {
        ui.hideLoader();
        ui.showToast({
            message: 'No se especificó un identificador de evento válido.',
            type: 'error',
            title: 'Error de navegación'
        });
        setTimeout(() => {
            window.location.href = CONFIG.LOGIN_REDIRECT || './dashboard.html';
        }, 1500);
        return null;
    }
    return eventId;
}

async function authenticateUser() {
    const user = await new Promise((resolve) => {
        const currentUser = authService.getCurrentUser();
        if (currentUser) {
            resolve(currentUser);
            return;
        }

        authService.onAuthStateChange((user) => {
            if (!user) {
                ui.hideLoader();
                window.location.href = './index.html';
                resolve(null);
            } else {
                resolve(user);
            }
        });
    });
    if (!user) return null;
    const roleContext = await authService.getRoleContext({ forceRefresh: true });
    if (!roleContext.isInternal) {
        throw createAdminAccessError('admin/missing-role-claim', 'La sesión no contiene role ni userRole interno válido.');
    }
    return { user, roleContext };
}

async function loadEventData(session, eventId) {
    try {
        const eventData = await eventService.getEventById(eventId);

        if (!eventData) {
            ui.hideLoader();
            ui.showToast({
                message: 'El evento solicitado no existe o fue eliminado.',
                type: 'error',
                title: 'Evento no encontrado'
            });
            setTimeout(() => {
                window.location.href = './dashboard.html';
            }, 1500);
            return;
        }

        storeStateAndContext(session, eventId, eventData);

    } catch (error) {
        ui.hideLoader();
        const detail = reportAdminFirebaseError(error, { operation: 'getDoc', collection: `eventos/${eventId}` });
        ui.showError({
            title: detail.title,
            description: detail.userMessage,
            code: detail.code
        });
    }
}

function storeStateAndContext(session, eventId, eventData) {
    state.setState('auth', {
        user: session.user,
        isAuthenticated: true,
        role: session.roleContext.role
    });

    state.setState('event', {
        id: eventId,
        data: eventData,
        isLoaded: true
    });
    const dependencyContainer = createDependencyContainer(eventId, eventData, session);
    prepareModules(dependencyContainer);

    completeEventBoot();
    registerLifecycleCleanup();
    ready(dependencyContainer);
}

function completeEventBoot() {
    ui.hideLoader();
    removeAuthGuard();
    showEventView();
}

function removeAuthGuard() {
    const authGuard = document.getElementById('auth-guard');
    if (authGuard) {
        authGuard.remove();
    }

    if (document.getElementById('auth-guard')) {
        const error = new Error('[Event Orchestrator] No se pudo eliminar auth-guard al finalizar el boot.');
        console.error(error);
        throw error;
    }
}

function showEventView() {
    const loadingView = document.getElementById('loading-view');
    const mainView = document.getElementById('main-view');

    if (!loadingView || !mainView) {
        const missingIds = [
            !loadingView ? 'loading-view' : null,
            !mainView ? 'main-view' : null
        ].filter(Boolean);
        const error = new Error(`[Event Orchestrator] No se encontraron vistas requeridas: ${missingIds.join(', ')}`);
        console.error(error);
        throw error;
    }

    loadingView.style.display = 'none';
    mainView.style.display = 'block';
    mainView.style.opacity = '1';
}

function createDependencyContainer(eventId, eventData, session) {
    const services = {
        auth: authService,
        event: eventService,
        guest: guestService,
        theme: themeService
    };

    const eventContext = {
        eventId,
        eventData,
        currentUser: session.user,
        roleContext: session.roleContext,
        permissions: {
            canEdit: hasPermission(session.roleContext, PERMISSIONS.EVENTS_EDIT),
            canDelete: hasPermission(session.roleContext, PERMISSIONS.EVENTS_EDIT),
            canExport: hasPermission(session.roleContext, PERMISSIONS.QR_EXPORT)
        },
        settings: { currency: 'MXN', timezone: 'America/Monterrey' }
    };

    return { state, ui, eventBus, services, eventContext };
}

function prepareModules(container) {

    try {
        if (typeof initExcelImport === 'function') {
            initExcelImport(container);
            registerModuleDestroyer(destroyExcelImport);
        }

        if (typeof initInvitationEditor === 'function') {
            initInvitationEditor(container);
        }

        if (typeof initInvitationPreview === 'function') {
            initInvitationPreview(container);
            registerModuleDestroyer(destroyInvitationPreview);
        }

        if (typeof initThemes === 'function') {
            initThemes(container);
            registerModuleDestroyer(destroyThemes);
        }

        if (typeof initThemeBuilder === 'function') {
            initThemeBuilder(container);
            registerModuleDestroyer(destroyThemeBuilder);
        }

        if (typeof initEventController === 'function') {
            initEventController(container);
            registerModuleDestroyer(destroyEventController);
        }

        if (typeof initQrManager === 'function') {
            initQrManager(container);
            registerModuleDestroyer(destroyQrManager);
        }

        console.info('[Event Orchestrator] Todos los submódulos fueron inicializados correctamente.');
    } catch (error) {
        console.error('[Event Orchestrator] Error al inicializar los submódulos:', error);
        throw error;
    }
}

function registerModuleDestroyer(destroyFn) {
    if (typeof destroyFn === 'function' && !activeModulesDestroyers.includes(destroyFn)) {
        activeModulesDestroyers.push(destroyFn);
    }
}

function registerLifecycleCleanup() {
    window.addEventListener('beforeunload', () => {
        activeModulesDestroyers.forEach(destroyFn => {
            try { destroyFn(); } catch (e) { console.warn(e); }
        });
        eventBus.clear();
    });
}

function ready(container) {

    eventBus.emit(EVENT_TYPES.EVENT_LOADED, {
        eventId: container.eventContext.eventId,
        nombre: container.eventContext.eventData.nombreEvento || 'Evento',
        timestamp: Date.now()
    });

    console.info('[Event Orchestrator] Sistema en estado READY.');

}
