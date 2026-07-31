// admin/invitation-preview.js
/**
 * @fileoverview Módulo de Previsualización de Invitaciones para Eventora Studio (Fase 3.11).
 * 
 * Responsabilidad:
 * - Renderizar y actualizar en tiempo real la vista previa visual de la invitación.
 * - Operar estrictamente bajo el patrón de Inyección de Dependencias, sin variables globales.
 * - Escuchar los cambios provenientes de otros módulos (como el editor) exclusivamente a través del Event Bus.
 * - Proveer soporte de ciclo de vida completo mediante init() y destroy() para prevenir fugas de memoria.
 */

import { EVENT_TYPES } from './core/event-types.js';

/**
 * Referencia interna a las dependencias inyectadas del sistema.
 * @private
 */
let appDeps = null;

/**
 * Almacena las referencias a las funciones de desuscripción de eventos para el ciclo de vida.
 * @private
 * @type {Array<Function>}
 */
let unsubscribeList = [];

/**
 * Estado local mutable específico de la previsualización.
 * @private
 */
let previewState = {
    currentConfig: {}
};

/**
 * Función pública de inicialización del módulo (Entry Point).
 * @param {Object} dependencies - Contenedor estándar de inyección.
 * @param {Object} dependencies.state 
 * @param {Object} dependencies.ui 
 * @param {Object} dependencies.eventBus 
 * @param {Object} dependencies.services 
 * @param {Object} dependencies.eventContext 
 */
export function initInvitationPreview(dependencies) {
    if (!dependencies || !dependencies.ui || !dependencies.eventBus) {
        console.error('[Invitation Preview] No se pudieron inicializar las dependencias requeridas.');
        return;
    }

    appDeps = dependencies;
    bindDom();
    registerEventBusListeners();
    loadInitialPreview();
}

/**
 * Captura defensiva de elementos del DOM locales.
 * @private
 */
function bindDom() {
    try {
        const previewContainer = document.getElementById('preview-container');
        if (previewContainer) {
            // Preparar contenedor visual base si es necesario
        }
    } catch (error) {
        console.warn('[Invitation Preview] Error defensivo al enlazar el DOM:', error);
    }
}

/**
 * Registra las escuchas necesarias en el Event Bus de manera desacoplada.
 * @private
 */
function registerEventBusListeners() {
    const { eventBus } = appDeps;

    // Escuchar cambios de guardado o actualización de temas/configuración emitidos por el editor u otros módulos
    const unsubThemeSaved = eventBus.on(EVENT_TYPES.THEME_SAVED, (payload) => {
        if (payload && payload.config) {
            updatePreview(payload.config);
        }
    });

    if (typeof unsubThemeSaved === 'function') {
        unsubscribeList.push(unsubThemeSaved);
    }
}

/**
 * Carga la configuración inicial para renderizar la previsualización basada en el State o Contexto.
 * @private
 */
function loadInitialPreview() {
    try {
        const { eventContext } = appDeps;
        const eventData = eventContext?.eventData || {};

        const initialConfig = {
            primaryColor: eventData.primaryColor || '#111111',
            invitationTitle: eventData.invitationTitle || eventData.nombre || 'Nuestra Boda'
        };

        renderPreview(initialConfig);
    } catch (error) {
        console.warn('[Invitation Preview] Error al cargar la previsualización inicial:', error);
    }
}

/**
 * Renderiza o actualiza la vista previa en pantalla aplicando la configuración visual.
 * @private
 * @param {Object} config 
 */
function renderPreview(config) {
    if (!config) return;
    previewState.currentConfig = { ...config };

    try {
        // Actualización defensiva de elementos visuales de la vista previa
        const titleEl = document.getElementById('preview-invitation-title');
        if (titleEl) {
            titleEl.textContent = config.invitationTitle || 'Evento';
        }

        const accentElements = document.querySelectorAll('.preview-accent-target');
        accentElements.forEach(el => {
            el.style.color = config.primaryColor || '#111111';
        });

    } catch (error) {
        console.warn('[Invitation Preview] Error al renderizar la vista previa:', error);
    }
}

/**
 * Método público expuesto para actualizar la vista previa de manera directa si se requiere.
 * @param {Object} config 
 */
export function updatePreview(config) {
    renderPreview(config);
}

/**
 * Método del ciclo de vida para destruir el módulo y liberar recursos (Memory Leaks prevention).
 */
export function destroy() {
    try {
        // Ejecutar todas las funciones de desuscripción registradas
        unsubscribeList.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        unsubscribeList = [];
        appDeps = null;
    } catch (error) {
        console.warn('[Invitation Preview] Error defensivo durante destroy():', error);
    }
}