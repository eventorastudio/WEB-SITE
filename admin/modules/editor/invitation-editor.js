// LEGACY / DEPRECATED: editor anterior al Invitation Builder.
// Se conserva por compatibilidad con event.html; no usar para nuevos flujos.
// admin/modules/editor/invitation-editor.js
import { EVENT_TYPES } from "../../core/event-types.js";

let appDeps = null;
let editorState = {
    config: {},
    isDirty: false
};

export function initInvitationEditor(dependencies) {
    if (!dependencies || !dependencies.services || !dependencies.ui) {
        console.error('[Invitation Editor] No se pudieron inicializar las dependencias requeridas.');
        return;
    }

    appDeps = dependencies;
    bindDomAndEvents();
    loadEditorConfig();
}

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

function triggerPreviewUpdate() {
    try {
        const previewFrame = document.getElementById('invitation-preview-frame');
        if (previewFrame && typeof previewFrame.contentWindow?.updatePreview === 'function') {
            previewFrame.contentWindow.updatePreview(editorState.config);
        }
    } catch (error) {
        console.warn('[Invitation Editor] No se pudo actualizar la previsualización:', error);
    }
}

async function handleSaveConfiguration() {
    const { ui, services, eventContext, eventBus } = appDeps;
    const saveBtn = document.getElementById('editor-save-btn');

    const eventId = eventContext?.eventId;
    if (!eventId) {
        ui.showError({
            title: 'Atención',
            description: 'No se encontró el identificador del evento activo.',
            code: ''
        });
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.dataset.originalText = saveBtn.textContent;
        saveBtn.textContent = 'Guardando...';
    }

    try {
        await services.theme.saveTheme(eventId, editorState.config);

        ui.showToast({
            message: 'Configuración guardada correctamente.',
            type: 'success',
            title: 'Éxito'
        });

        editorState.isDirty = false;

        eventBus.emit(EVENT_TYPES.THEME_SAVED, {
            eventId,
            config: editorState.config,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('[Invitation Editor] Error guardando configuración:', error);
        ui.showError({
            title: 'Error de guardado',
            description: 'No pudimos guardar los cambios. Verifica tu conexión e inténtalo nuevamente.',
            code: ''
        });
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = saveBtn.dataset.originalText || 'Guardar';
        }
    }
}
