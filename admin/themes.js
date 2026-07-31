// admin/themes.js
/**
 * @fileoverview Módulo de Administración y Galería de Temas para Eventora Studio (Fase 3.12).
 * 
 * Responsabilidad:
 * - Administrar la interfaz, galería y operaciones CRUD/duplicación sobre los temas visuales.
 * - Operar estrictamente bajo el patrón de Inyección de Dependencias, sin variables globales.
 * - Delegar todas las consultas y persistencia exclusivamente a services.theme.
 * - Canalizar notificaciones visuales mediante ui.js y emitir avisos de selección o cambio mediante el event-bus.js.
 * - Proveer soporte de ciclo de vida completo mediante initThemes() y destroy() para prevenir fugas de memoria.
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
 * Estado local mutable específico del módulo de temas.
 * @private
 */
let themesState = {
    themesList: [],
    selectedThemeId: null,
    isLoading: false
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
export function initThemes(dependencies) {
    if (!dependencies || !dependencies.services || !dependencies.ui || !dependencies.eventBus) {
        console.error('[Themes Module] No se pudieron inicializar las dependencias requeridas.');
        return;
    }

    appDeps = dependencies;
    bindDomAndEvents();
    loadThemes();
    registerEventBusListeners();
}

/**
 * Captura defensiva de elementos del DOM y asociación de escuchas de eventos.
 * @private
 */
function bindDomAndEvents() {
    try {
        const themeContainer = document.getElementById('themes-gallery-container');
        if (themeContainer) {
            // Delegación de eventos para acciones en tarjetas de temas (aplicar, duplicar, eliminar)
            themeContainer.addEventListener('click', handleThemeActionClick);
        }
    } catch (error) {
        console.warn('[Themes Module] Error defensivo al enlazar el DOM:', error);
    }
}

/**
 * Registra las escuchas necesarias en el Event Bus de manera desacoplada.
 * @private
 */
function registerEventBusListeners() {
    const { eventBus } = appDeps;

    // Escuchar cuando se guarde o cree un tema desde otros componentes (ej. theme-builder)
    const unsubThemeSaved = eventBus.on(EVENT_TYPES.THEME_SAVED, () => {
        loadThemes();
    });

    if (typeof unsubThemeSaved === 'function') {
        unsubscribeList.push(unsubThemeSaved);
    }
}

/**
 * Carga la lista de temas disponibles utilizando exclusivamente services.theme.
 * @private
 */
async function loadThemes() {
    const { ui, services } = appDeps;
    themesState.isLoading = true;
    ui.showLoader({ text: 'Cargando galería de temas...' });

    try {
        // Toda comunicación con Firestore pasa exclusivamente por theme-service.js
        const themes = await services.theme.getAllThemes();
        themesState.themesList = themes || [];
        themesState.isLoading = false;
        ui.hideLoader();

        renderThemes();
    } catch (error) {
        themesState.isLoading = false;
        ui.hideLoader();
        console.error('[Themes Module] Error obteniendo temas:', error);
        ui.showError({
            title: 'Error de carga',
            description: 'No se pudo obtener la galería de temas desde la base de datos.',
            code: 'ERR_THEMES_FETCH'
        });
    }
}

/**
 * Renderiza la galería de temas en el DOM de forma defensiva.
 * @private
 */
function renderThemes() {
    try {
        const container = document.getElementById('themes-gallery-container');
        if (!container) return;

        if (themesState.themesList.length === 0) {
            const { ui } = appDeps;
            ui.showEmptyState({
                containerId: 'themes-gallery-container',
                title: 'No hay temas disponibles',
                description: 'Aún no se han registrado plantillas maestras en la plataforma.'
            });
            return;
        }

        // Construcción segura del marcado visual de la galería
        let htmlContent = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:20px;">';
        
        themesState.themesList.forEach(theme => {
            htmlContent.umnos || (htmlContent += `
                <div class="theme-card" data-theme-id="${theme.id}" style="border:1px solid #E5E7EB; border-radius:10px; padding:16px; background:#fff; display:flex; flex-direction:column; gap:12px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                    <div style="font-weight:600; font-size:16px; color:#111;">${theme.nombre || 'Tema sin título'}</div>
                    <div style="font-size:13px; color:#6B7280; line-height:1.4;">${theme.descripcion || 'Sin descripción adicional.'}</div>
                    <div style="display:flex; gap:8px; margin-top:auto; justify-content:flex-end;">
                        <button data-action="apply" data-id="${theme.id}" style="padding:6px 12px; background:#111; color:#fff; border:none; border-radius:6px; font-size:12px; cursor:pointer;">Aplicar</button>
                        <button data-action="duplicate" data-id="${theme.id}" style="padding:6px 12px; background:#F3F4F6; color:#374151; border:1px solid #D1D5DB; border-radius:6px; font-size:12px; cursor:pointer;">Duplicar</button>
                    </div>
                </div>
            `);
        });

        htmlContent += '</div>';
        container.innerHTML = htmlContent;

    } catch (error) {
        console.warn('[Themes Module] Error al renderizar la galería:', error);
    }
}

/**
 * Maneja las acciones de clic delegadas en las tarjetas de temas.
 * @private
 * @param {MouseEvent} event 
 */
async function handleThemeActionClick(event) {
    const target = event.target;
    if (!target || !target.dataset || !target.dataset.action) return;

    const action = target.dataset.action;
    const themeId = target.dataset.id;

    if (action === 'apply') {
        applyTheme(themeId);
    } else if (action === 'duplicate') {
        duplicateTheme(themeId);
    }
}

/**
 * Aplica un tema seleccionado al evento activo.
 * @private
 * @param {string} themeId 
 */
async function applyTheme(themeId) {
    const { ui, services, eventContext, eventBus } = appDeps;
    const eventId = eventContext?.eventId;

    if (!eventId) {
        ui.showToast({ message: 'No hay un evento activo seleccionado.', type: 'error', title: 'Error' });
        return;
    }

    const targetTheme = themesState.themesList.find(t => t.id === themeId);
    if (!targetTheme) return;

    const confirmed = await ui.confirm({
        title: 'Aplicar tema',
        message: `¿Deseas aplicar el tema "${targetTheme.nombre}" a tu invitación?`,
        confirmText: 'Aplicar'
    });

    if (!confirmed) return;

    ui.showLoader({ text: 'Aplicando tema...' });

    try {
        // Actualizar el tema mediante la capa de servicios del evento o de temas
        await services.event.updateEvent(eventId, { themeId: themeId, themeConfig: targetTheme });

        ui.hideLoader();
        ui.showToast({
            message: '¡Tema aplicado correctamente!',
            type: 'success',
            title: 'Actualizado'
        });

        // Emitir evento oficial a través del Event Bus
        eventBus.emit(EVENT_TYPES.THEME_APPLIED, {
            eventId,
            themeId,
            timestamp: Date.now()
        });

    } catch (error) {
        ui.hideLoader();
        console.error('[Themes Module] Error aplicando tema:', error);
        ui.showError({
            title: 'Error',
            description: 'No se pudo aplicar el tema seleccionado.',
            code: 'ERR_THEME_APPLY'
        });
    }
}

/**
 * Duplica un tema existente en la base de datos.
 * @private
 * @param {string} themeId 
 */
async function duplicateTheme(themeId) {
    const { ui, services } = appDeps;
    const targetTheme = themesState.themesList.find(t => t.id === themeId);
    if (!targetTheme) return;

    ui.showLoader({ text: 'Duplicando tema...' });

    try {
        // Toda operación de base de datos pasa exclusivamente por theme-service.js
        await services.theme.duplicateTheme(targetTheme);

        ui.hideLoader();
        ui.showToast({
            message: 'Tema duplicado con éxito.',
            type: 'success',
            title: 'Duplicado'
        });

        loadThemes(); // Recargar galería
    } catch (error) {
        ui.hideLoader();
        console.error('[Themes Module] Error duplicando tema:', error);
        ui.showError({
            title: 'Error',
            description: 'No se pudo duplicar el tema.',
            code: 'ERR_THEME_DUPLICATE'
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
        appDeps = null;
    } catch (error) {
        console.warn('[Themes Module] Error defensivo durante destroy():', error);
    }
}