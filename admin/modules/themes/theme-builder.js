// admin/modules/themes/theme-builder.js
import { EVENT_TYPES } from "../../core/event-types.js";

let appDeps = null;
let unsubscribeList = [];
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

export function initThemeBuilder(dependencies) {
    if (!dependencies || !dependencies.services || !dependencies.ui || !dependencies.eventBus) {
        console.error('[Theme Builder] No se pudieron inicializar las dependencias requeridas.');
        return;
    }

    appDeps = dependencies;
    bindDomAndEvents();
    loadInitialTheme();
}

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

async function fetchThemeDetails(themeId) {
    const { ui, services } = appDeps;
    ui.showLoader({ text: 'Cargando detalles del tema...' });

    try {
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
            title: 'Atención',
            description: 'No pudimos cargar la configuración del tema. Verifica tu conexión e inténtalo nuevamente.',
            code: ''
        });
    }
}

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

async function handleSaveTheme() {
    const { ui, services, eventBus } = appDeps;
    const saveThemeBtn = document.getElementById('theme-builder-save-btn');

    if (saveThemeBtn) {
        saveThemeBtn.disabled = true;
        saveThemeBtn.dataset.originalText = saveThemeBtn.textContent;
        saveThemeBtn.textContent = 'Guardando...';
    }

    try {
        const savedId = await services.theme.saveTheme(builderState.themeId, builderState.currentThemeConfig);
        
        builderState.themeId = savedId;
        builderState.isDirty = false;

        ui.showToast({
            message: 'Plantilla guardada correctamente.',
            type: 'success',
            title: 'Guardado'
        });

        eventBus.emit(EVENT_TYPES.THEME_SAVED, {
            themeId: savedId,
            config: builderState.currentThemeConfig,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('[Theme Builder] Error guardando tema:', error);
        ui.showError({
            title: 'Error de guardado',
            description: 'No pudimos guardar la plantilla. Verifica tu conexión e inténtalo nuevamente.',
            code: ''
        });
    } finally {
        if (saveThemeBtn) {
            saveThemeBtn.disabled = false;
            saveThemeBtn.textContent = saveThemeBtn.dataset.originalText || 'Guardar';
        }
    }
}

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
