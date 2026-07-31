// admin/theme-builder.js
/**
 * @fileoverview Módulo Constructor de Temas (Theme Builder) para Eventora Studio (Fase 3.13).
 * 
 * Responsabilidad:
 * - Administrar la interfaz, edición de componentes y estado local temporal del constructor visual de plantillas.
 * - Operar estrictamente bajo el patrón de Inyección de Dependencias, sin variables globales.
 * - Delegar todas las operaciones de persistencia exclusivamente a services.theme.
 * - Canalizar notificaciones visuales mediante ui.js y reportar cambios emitiendo eventos oficiales a través del event-bus.js.
 * - Proveer soporte de ciclo de vida completo mediante initThemeBuilder() y destroy() para prevenir fugas de memoria.
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
 * Estado local mutable específico y privado del constructor (no se almacena en state.js global).
 * @private
 */
let builderState = {
    themeId: null,
    currentThemeConfig: {
        nombre: 'Nuevo Tema',
        descripcion: '',
        primaryColor: '#111111',
        components: []
    },
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
export function initThemeBuilder(dependencies) {
    if (!dependencies || !dependencies.services || !dependencies.ui || !dependencies.eventBus) {
        console.error('[Theme Builder] No se pudieron inicializar las dependencias requeridas.');
        return;
    }

    appDeps = dependencies;
    bindDomAndEvents();
    loadInitialTheme();
}

/**
 * Captura defensiva de elementos del DOM y asociación de escuchas de eventos.
 * @private
 */
function bindDomAndEvents() {
    try {
        const saveThemeBtn = document.getElementById('theme-builder-save-btn');
        const nameInput = document.getElementById('theme-builder-name-input');
        const colorInput = document.getElementById('theme-builder-color-input');

        if (saveThemeBtn) {
            saveThemeBtn.addEventListener('click', handleSaveTheme);
        }

        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                builderState.currentThemeConfig.nombre = e.target.value;
                builderState.isDirty = true;
            });
        }

        if (colorInput) {
            colorInput.addEventListener('input', (e) => {
                builderState.currentThemeConfig.primaryColor = e.target.value;
                builderState.isDirty = true;
            });
        }
    } catch (error) {
        console.warn('[Theme Builder] Error defensivo al enlazar el DOM:', error);
    }
}

/**
 * Carga inicial opcional de datos para el constructor (si se recibe un ID en la URL o contexto).
 * @private
 */
function loadInitialTheme() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const themeId = urlParams.get('themeId');

        if (themeId) {
            builderState.themeId = themeId;
            fetchThemeDetails(themeId);
        }
    } catch (error) {
        console.warn('[Theme Builder] Error al verificar parámetros iniciales del tema:', error);
    }
}

/**
 * Obtiene los detalles de un tema existente mediante services.theme (sin acceso directo a Firestore).
 * @private
 * @param {string} themeId 
 */
async function fetchThemeDetails(themeId) {
    const { ui, services } = appDeps;
    ui.showLoader({ text: 'Cargando detalles del tema...' });

    try {
        // Toda comunicación con Firestore pasa exclusivamente por theme-service.js
        const themeData = await services.theme.getThemeById(themeId);
        ui.hideLoader();

        if (themeData) {
            builderState.currentThemeConfig = { ...themeData };
            populateFormFields();
        } else {
            ui.showToast({
                message: 'El tema especificado no existe.',
                type: 'warning',
                title: 'No encontrado'
            });
        }
    } catch (error) {
        ui.hideLoader();
        console.error('[Theme Builder] Error obteniendo detalles del tema:', error);
        ui.showError({
            title: 'Error',
            description: 'No se pudo cargar la configuración del tema.',
            code: 'ERR_THEME_BUILDER_LOAD'
        });
    }
}

/**
 * Rellena los campos del formulario con el estado local del constructor.
 * @private
 */
function populateFormFields() {
    try {
        const nameInput = document.getElementById('theme-builder-name-input');
        const colorInput = document.getElementById('theme-builder-color-input');

        if (nameInput) nameInput.value = builderState.currentThemeConfig.nombre || '';
        if (colorInput) colorInput.value = builderState.currentThemeConfig.primaryColor || '#111111';
    } catch (error) {
        console.warn('[Theme Builder] Error poblando campos del formulario:', error);
    }
}

/**
 * Maneja la persistencia de la configuración del tema actual.
 * @private
 */
async function handleSaveTheme() {
    const { ui, services, eventBus } = appDeps;

    ui.showLoader({ text: 'Guardando plantilla maestra...' });

    try {
        // Toda persistencia se realiza exclusivamente a través de services.theme
        const savedId = await services.theme.saveTheme(builderState.themeId, builderState.currentThemeConfig);
        
        builderState.themeId = savedId;
        builderState.isDirty = false;

        ui.hideLoader();
        ui.showToast({
            message: 'Plantilla guardada correctamente.',
            type: 'success',
            title: 'Guardado'
        });

        // Emitir evento oficial a través del Event Bus utilizando constantes tipadas de event-types.js
        eventBus.emit(EVENT_TYPES.THEME_SAVED, {
            themeId: savedId,
            config: builderState.currentThemeConfig,
            timestamp: Date.now()
        });

    } catch (error) {
        ui.hideLoader();
        console.error('[Theme Builder] Error guardando tema:', error);
        ui.showError({
            title: 'Error de guardado',
            description: 'No se pudo guardar la plantilla en la base de datos.',
            code: 'ERR_THEME_BUILDER_SAVE'
        });
    }
}

/**
 * Método del ciclo de vida para destruir el módulo y liberar recursos (Memory Leaks prevention).
 */
export function destroy() {
    try {
        unsubscribeList.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        unsubscribeList = [];
        builderState = {
            themeId: null,
            currentThemeConfig: { nombre: '', descripcion: '', primaryColor: '#111111', components: [] },
            isDirty: false
        };
        appDeps = null;
    } catch (error) {
        console.warn('[Theme Builder] Error defensivo durante destroy():', error);
    }
}