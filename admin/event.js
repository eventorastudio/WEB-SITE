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

// --- RUTAS CORREGIDAS ---
import { initExcelImport } from './modules/guests/excel-import.js';
import { initInvitationEditor } from './modules/editor/invitation-editor.js';
import { initInvitationPreview, destroy as destroyInvitationPreview } from './modules/editor/invitation-preview.js';
import { initThemes, destroy as destroyThemes } from './modules/themes/themes.js';
import { initThemeBuilder, destroy as destroyThemeBuilder } from './modules/themes/theme-builder.js';

let activeModulesDestroyers = [];

document.addEventListener('DOMContentLoaded', async () => {
    await boot();
});

async function boot() {
    try {
        ui.showLoader({ text: 'Preparando entorno de administración...' });

        const eventId = extractEventIdFromUrl();
        if (!eventId) return;

        const currentUser = await authenticateUser();
        if (!currentUser) return;

        await loadEventData(currentUser, eventId);

    } catch (error) {
        ui.hideLoader();
        console.error('[Event Orchestrator] Error crítico en el boot:', error);
        ui.showError({
            title: 'Error de sistema',
            description: 'Ocurrió un fallo inesperado al inicializar el panel.',
            code: 'ERR_ORCHESTRATOR_BOOT'
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
    return new Promise((resolve) => {
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
}

async function loadEventData(currentUser, eventId) {
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

        storeStateAndContext(currentUser, eventId, eventData);

    } catch (error) {
        ui.hideLoader();
        console.error('[Event Orchestrator] Error obteniendo documento del evento:', error);
        ui.showError({
            title: 'Error de conexión',
            description: 'No fue posible comunicarse con la base de datos.',
            code: 'ERR_EVENT_LOAD'
        });
    }
}

function storeStateAndContext(currentUser, eventId, eventData) {
    state.setState('auth', {
        user: currentUser,
        isAuthenticated: true,
        role: 'admin'
    });

    state.setState('event', {
        id: eventId,
        data: eventData,
        isLoaded: true
    });

    ui.hideLoader();

    const dependencyContainer = createDependencyContainer(eventId, eventData, currentUser);
    
    prepareModules(dependencyContainer);
    registerLifecycleCleanup();
    ready(dependencyContainer);
}

function createDependencyContainer(eventId, eventData, currentUser) {
    const services = {
        auth: authService,
        event: eventService,
        guest: guestService,
        theme: themeService
    };

    const eventContext = {
        eventId,
        eventData,
        currentUser,
        permissions: { canEdit: true, canDelete: true, canExport: true },
        settings: { currency: 'MXN', timezone: 'America/Monterrey' }
    };

    return { state, ui, eventBus, services, eventContext };
}

function prepareModules(container) {
    try {
        if (typeof initExcelImport === 'function') {
            initExcelImport(container);
        }

        if (typeof initInvitationEditor === 'function') {
            initInvitationEditor(container);
        }

        if (typeof initInvitationPreview === 'function') {
            initInvitationPreview(container);
            if (typeof destroyInvitationPreview === 'function') {
                activeModulesDestroyers.push(destroyInvitationPreview);
            }
        }

        if (typeof initThemes === 'function') {
            initThemes(container);
            if (typeof destroyThemes === 'function') {
                activeModulesDestroyers.push(destroyThemes);
            }
        }

        if (typeof initThemeBuilder === 'function') {
            initThemeBuilder(container);
            if (typeof destroyThemeBuilder === 'function') {
                activeModulesDestroyers.push(destroyThemeBuilder);
            }
        }

        console.info('[Event Orchestrator] Todos los submódulos fueron inicializados correctamente.');
    } catch (error) {
        console.error('[Event Orchestrator] Error al inicializar los submódulos:', error);
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
        nombre: container.eventContext.eventData.nombre || 'Evento',
        timestamp: Date.now() 
    });
    console.info('[Event Orchestrator] Sistema en estado READY.');
}
