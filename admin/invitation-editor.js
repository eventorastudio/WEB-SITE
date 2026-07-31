// admin/invitation-editor.js
/**
 * @fileoverview Módulo Editor de Invitaciones para Eventora Studio (Fase 3.10).
 * 
 * Responsabilidad:
 * - Administrar la interfaz, configuración y previsualización interactiva del diseño de invitaciones.
 * - Operar estrictamente bajo el patrón de Inyección de Dependencias, sin variables globales.
 * - Delegar la persistencia de configuraciones y temas exclusivamente a services.theme.
 * - Canalizar notificaciones visuales mediante ui.js y emitir avisos de guardado con el event-bus.js.
 */

import { EVENT_TYPES } from './core/event-types.js';

/**
 * Referencia interna a las dependencias inyectadas del sistema.
 * @private
 */
let appDeps = null;

/**
 * Estado mutable local específico del editor de invitaciones.
 * @private
 */
let editorState = {
    config: {},
    isDirty: false
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
export function initInvitationEditor(dependencies) {
    if (!dependencies || !dependencies.services || !dependencies.ui) {
        console.error('[Invitation Editor] No se pudieron inicializar las dependencias requeridas.');
        return;
    }

    appDeps = dependencies;
    bindDomAndEvents();
    loadEditorConfig();
}

/**
 * Captura defensiva de elementos del DOM y asociación de escuchas de eventos.
 * @private
 */
function bindDomAndEvents() {
    try {
        const saveBtn = document.getElementById('editor-save-btn');
        const colorPicker = document.getElementById('editor-color-picker');
        const titleInput = document.getElementById('editor-title-input');

        if (saveBtn) {
            saveBtn.addEventListener('click', handleSaveConfiguration);
        }

        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                editorState.config.primaryColor = e.target.value;
                editorState.isDirty = true;
                triggerPreviewUpdate();
            });
        }

        if (titleInput) {
            titleInput.addEventListener('input', (e) => {
                editorState.config.invitationTitle = e.target.value;
                editorState.isDirty = true;
                triggerPreviewUpdate();
            });
        }

    } catch (error) {
        console.warn('[Invitation Editor] Error defensivo al enlazar el DOM:', error);
    }
}

/**
 * Carga la configuración inicial del editor desde el contexto del evento o servicios.
 * @private
 */
function loadEditorConfig() {
    try {
        const { eventContext } = appDeps;
        const currentEventData = eventContext?.eventData || {};

        editorState.config = {
            primaryColor: currentEventData.primaryColor || '#111111',
            invitationTitle: currentEventData.invitationTitle || currentEventData.nombre || 'Nuestra Boda'
        };

        triggerPreviewUpdate();
    } catch (error) {
        console.warn('[Invitation Editor] Error al cargar la configuración inicial:', error);
    }
}

/**
 * Actualiza el componente de previsualización en tiempo real si está disponible.
 * @private
 */
function triggerPreviewUpdate() {
    try {
        // Disparar evento interno o invocar previsualizador si existe en el scope global/módulo
        const previewFrame = document.getElementById('invitation-preview-frame');
        if (previewFrame && typeof previewFrame.contentWindow?.updatePreview === 'function') {
            previewFrame.contentWindow.updatePreview(editorState.config);
        }
    } catch (error) {
        console.warn('[Invitation Editor] No se pudo actualizar la previsualización:', error);
    }
}

/**
 * Maneja el almacenamiento de la configuración actual del editor.
 * @private
 */
async function handleSaveConfiguration() {
    const { ui, services, eventContext, eventBus } = appDeps;

    const eventId = eventContext?.eventId;
    if (!eventId) {
        ui.showError({
            title: 'Error de contexto',
            description: 'No se encontró el identificador del evento activo.',
            code: 'ERR_MISSING_EVENT_ID'
        });
        return;
    }

    ui.showLoader({ text: 'Guardando configuración de la invitación...' });

    try {
        // Toda comunicación con Firestore / persistencia de temas pasa exclusivamente por theme-service.js o event-service.js
        // En este caso utilizaremos services.theme para guardar plantillas/configuraciones asociadas
        await services.theme.saveTheme(eventId, editorState.config);

        ui.hideLoader();
        ui.showToast({
            message: 'Configuración guardada correctamente.',
            type: 'success',
            title: 'Éxito'
        });

        editorState.isDirty = false;

        // Emitir señal oficial a través del Event Bus utilizando constantes tipadas de event-types.js
        eventBus.emit(EVENT_TYPES.THEME_SAVED, {
            eventId,
            config: editorState.config,
            timestamp: Date.now()
        });

    } catch (error) {
        ui.hideLoader();
        console.error('[Invitation Editor] Error guardando configuración:', error);
        ui.showError({
            title: 'Error de guardado',
            description: 'Ocurrió un fallo al guardar la configuración en la base de datos.',
            code: 'ERR_EDITOR_SAVE'
        });
    }
}