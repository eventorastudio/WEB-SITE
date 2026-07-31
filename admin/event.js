// admin/event.js
/**
 * @fileoverview Orquestador Principal del Panel Administrativo de Eventora Studio (Fase 4.1 - Integración Total).
 * 
 * Responsabilidad:
 * - Coordinar el ciclo de vida completo de la vista de administración del evento.
 * - Autenticar, cargar el contexto, estructurar el Dependency Container y entregarlo a todos los módulos.
 * - Registrar la invocación de inicialización (init) y destrucción (destroy) para garantizar cero fugas de memoria.
 */

import { authService } from './services/auth-service.js';
import { eventService } from './services/event-service.js';
import { guestService } from './services/guest-service.js';
import { themeService } from './services/theme-service.js';
import { state } from './core/state.js';
import { ui } from './core/ui.js';
import { eventBus } from './core/event-bus.js';
import { EVENT_TYPES } from './core/event-types.js';
import { CONFIG } from './config.js';

// Importación de los puntos de entrada oficiales de los submódulos refactorizados
import { initExcelImport } from './excel-import.js';
import { initInvitationEditor } from './invitation-editor.js';
import { initInvitationPreview } from './invitation-preview.js';
import { initThemes } from './themes.js';
import { initThemeBuilder } from './theme-builder.js';

/**
 * Almacena referencias a las funciones de destrucción activas para la limpieza de recursos.
 * @private
 * @type {Array<Function>}
 */
let activeModulesDestroyers = [];

/**
 * Punto de entrada principal (Boot).
 */
document.addEventListener('DOMContentLoaded', async () => {
    await boot();
});

/**
 * Secuencia principal de arranque del orquestador.
 * @private
 */
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

/**
 * Extrae y valida el ID del evento desde los parámetros de la URL.
 * @private
 * @returns {string|null}
 */
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

/**
 * Valida la sesión del usuario utilizando auth-service.
 * @private
 * @returns {Promise<Object|null>}
 */
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

/**
 * Carga los datos del evento y activa el flujo posterior de preparación.
 * @private
 * @param {Object} currentUser 
 * @param {string} eventId 
 */
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

/**
 * Almacena la información en el State Manager y procede a crear el paquete de dependencias.
 * @private
 * @param {Object} currentUser 
 * @param {string} eventId 
 * @param {Object} eventData 
 */
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

    // Crear el paquete centralizado de dependencias y contexto
    const dependencyContainer = createDependencyContainer(eventId, eventData, currentUser);
    
    // Inicializar y conectar todos los submódulos de la arquitectura
    prepareModules(dependencyContainer);

    // Registrar eventos del ciclo de vida para limpieza (Destroy)
    registerLifecycleCleanup();

    // Señal final de preparación lista
    ready(dependencyContainer);
}

/**
 * Agrupa todos los servicios en un único objeto y construye el contenedor de inyección.
 * @private
 * @param {string} eventId 
 * @param {Object} eventData 
 * @param {Object} currentUser 
 * @returns {Object} Contenedor estándar de inyección de dependencias.
 */
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
        permissions: {
            canEdit: true,
            canDelete: true,
            canExport: true
        },
        settings: {
            currency: 'MXN',
            timezone: 'America/Monterrey'
        }
    };

    return {
        state,
        ui,
        eventBus,
        services,
        eventContext
    };
}

/**
 * Inicializa formalmente cada submódulo inyectándoles el Dependency Container unificado.
 * @private
 * @param {Object} container 
 */
function prepareModules(container) {
    try {
        // 1. Inicializar Módulo de Importación Excel
        if (typeof initExcelImport === 'function') {
            initExcelImport(container);
        }

        // 2. Inicializar Editor de Invitaciones
        if (typeof initInvitationEditor === 'function') {
            initInvitationEditor(container);
        }

        // 3. Inicializar Previsualizador de Invitaciones (capturando su destructor si existe)
        if (typeof initInvitationPreview === 'function') {
            initInvitationPreview(container);
            // invitation-preview exporta destroy()
            import('./invitation-preview.js').then(mod => {
                if (mod && typeof mod.destroy === 'function') {
                    activeModulesDestroyers.push(mod.destroy);
                }
            }).catch(() => {});
        }

        // 4. Inicializar Galería de Temas
        if (typeof initThemes === 'function') {
            initThemes(container);
            import('./themes.js').then(mod => {
                if (mod && typeof mod.destroy === 'function') {
                    activeModulesDestroyers.push(mod.destroy);
                }
            }).catch(() => {});
        }

        // 5. Inicializar Constructor de Temas
        if (typeof initThemeBuilder === 'function') {
            initThemeBuilder(container);
            import('./theme-builder.js').then(mod => {
                if (mod && typeof mod.destroy === 'function') {
                    activeModulesDestroyers.push(mod.destroy);
                }
            }).catch(() => {});
        }

        console.info('[Event Orchestrator] Todos los submódulos fueron inicializados correctamente mediante Dependency Injection.');
    } catch (error) {
        console.error('[Event Orchestrator] Error al inicializar los submódulos:', error);
    }
}

/**
 * Registra los listeners de limpieza ante la salida o recarga de la página (Previene Memory Leaks).
 * @private
 */
function registerLifecycleCleanup() {
    window.addEventListener('beforeunload', () => {
        activeModulesDestroyers.forEach(destroyFn => {
            try {
                destroyFn();
            } catch (e) {
                console.warn('[Event Orchestrator] Error ejecutando destroy de un módulo:', e);
            }
        });
        eventBus.clear();
    });
}

/**
 * Acción final del ciclo de arranque del orquestador.
 * @private
 * @param {Object} container 
 */
function ready(container) {
    eventBus.emit(EVENT_TYPES.EVENT_LOADED, { 
        eventId: container.eventContext.eventId, 
        nombre: container.eventContext.eventData.nombre || 'Evento',
        timestamp: Date.now() 
    });

    console.info('[Event Orchestrator] Sistema en estado READY. Integración total completada.');
}