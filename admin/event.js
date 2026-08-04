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
import {
    initEventController,
    destroy as destroyEventController
} from './modules/event-controller.js';

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
        console.debug('[TEMP DEBUG][Event Orchestrator] getEventById:start', { eventId });
        const eventData = await eventService.getEventById(eventId);
        console.debug('[TEMP DEBUG][Event Orchestrator] getEventById:end', {
            eventId,
            isValidPojo: Boolean(eventData) && typeof eventData === 'object',
            keys: eventData ? Object.keys(eventData) : []
        });

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
    console.debug('[TEMP DEBUG][Event Orchestrator] state:set:start', { eventId });
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
    console.debug('[TEMP DEBUG][Event Orchestrator] state:set:end', {
        eventId,
        isLoaded: true
    });

    console.debug('[TEMP DEBUG][Event Orchestrator] ui:update:skipped', {
        reason: 'No updateUI/render function is defined or invoked by event.js.'
    });
    console.debug('[TEMP DEBUG][Event Orchestrator] bindEvents:skipped', {
        reason: 'No bindEvents function is defined or invoked by event.js.'
    });

    ui.hideLoader();

    const dependencyContainer = createDependencyContainer(eventId, eventData, currentUser);
    
    console.debug('[TEMP DEBUG][Event Orchestrator] prepareModules:start');
    prepareModules(dependencyContainer);
    console.debug('[TEMP DEBUG][Event Orchestrator] prepareModules:end');
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

        console.info('[Event Orchestrator] Todos los submódulos fueron inicializados correctamente.');
    } catch (error) {
        console.error('[Event Orchestrator] Error al inicializar los submódulos:', error);
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
