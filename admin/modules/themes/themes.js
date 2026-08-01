// admin/modules/themes/themes.js
import { EVENT_TYPES } from "../../core/event-types.js";

let appDeps = null;
let unsubscribeList = [];
let themesState = {
    themesList: [],
    selectedThemeId: null,
    isLoading: false
};

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

function bindDomAndEvents() {
    try {
        const themeContainer = document.getElementById('themes-gallery-container');
        if (themeContainer) {
            themeContainer.addEventListener('click', handleThemeActionClick);
        }
    } catch (error) {
        console.warn('[Themes Module] Error defensivo al enlazar el DOM:', error);
    }
}

function registerEventBusListeners() {
    const { eventBus } = appDeps;

    const unsubThemeSaved = eventBus.on(EVENT_TYPES.THEME_SAVED, () => {
        loadThemes();
    });

    if (typeof unsubThemeSaved === 'function') {
        unsubscribeList.push(unsubThemeSaved);
    }
}

async function loadThemes() {
    const { ui, services } = appDeps;
    themesState.isLoading = true;
    ui.showLoader({ text: 'Cargando galería de temas...' });

    try {
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
            title: 'Atención',
            description: 'No pudimos obtener la galería de temas. Verifica tu conexión e inténtalo nuevamente.',
            code: ''
        });
    }
}

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

        let htmlContent = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:20px;">';
        
        themesState.themesList.forEach(theme => {
            htmlContent += `
                <div class="theme-card" data-theme-id="${theme.id}" style="border:1px solid #E5E7EB; border-radius:10px; padding:16px; background:#fff; display:flex; flex-direction:column; gap:12px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                    <div style="font-weight:600; font-size:16px; color:#111;">${theme.nombre || 'Tema sin título'}</div>
                    <div style="font-size:13px; color:#6B7280; line-height:1.4;">${theme.descripcion || 'Sin descripción adicional.'}</div>
                    <div style="display:flex; gap:8px; margin-top:auto; justify-content:flex-end;">
                        <button data-action="apply" data-id="${theme.id}" style="padding:6px 12px; background:#111; color:#fff; border:none; border-radius:6px; font-size:12px; cursor:pointer;">Aplicar</button>
                        <button data-action="duplicate" data-id="${theme.id}" style="padding:6px 12px; background:#FFFFFF; color:#374151; border:1px solid #9CA3AF; border-radius:6px; font-size:12px; cursor:pointer;">Duplicar</button>
                    </div>
                </div>
            `;
        });

        htmlContent += '</div>';
        container.innerHTML = htmlContent;

    } catch (error) {
        console.warn('[Themes Module] Error al renderizar la galería:', error);
    }
}

async function handleThemeActionClick(event) {
    const target = event.target;
    if (!target || !target.dataset || !target.dataset.action) return;

    const action = target.dataset.action;
    const themeId = target.dataset.id;

    if (action === 'apply') {
        applyTheme(themeId, target);
    } else if (action === 'duplicate') {
        duplicateTheme(themeId, target);
    }
}

async function applyTheme(themeId, buttonEl) {
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

    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.dataset.originalText = buttonEl.textContent;
        buttonEl.textContent = 'Aplicando...';
    }

    try {
        await services.event.updateEvent(eventId, { themeId: themeId, themeConfig: targetTheme });

        ui.showToast({
            message: '¡Tema aplicado correctamente!',
            type: 'success',
            title: 'Actualizado'
        });

        eventBus.emit(EVENT_TYPES.THEME_APPLIED, {
            eventId,
            themeId,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('[Themes Module] Error aplicando tema:', error);
        ui.showError({
            title: 'Atención',
            description: 'No pudimos aplicar el tema seleccionado. Verifica tu conexión e inténtalo nuevamente.',
            code: ''
        });
    } finally {
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.textContent = buttonEl.dataset.originalText || 'Aplicar';
        }
    }
}

async function duplicateTheme(themeId, buttonEl) {
    const { ui, services } = appDeps;
    const targetTheme = themesState.themesList.find(t => t.id === themeId);
    if (!targetTheme) return;

    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.dataset.originalText = buttonEl.textContent;
        buttonEl.textContent = 'Duplicando...';
    }

    try {
        await services.theme.duplicateTheme(targetTheme);

        ui.showToast({
            message: 'Tema duplicado con éxito.',
            type: 'success',
            title: 'Duplicado'
        });

        loadThemes();
    } catch (error) {
        console.error('[Themes Module] Error duplicando tema:', error);
        ui.showError({
            title: 'Atención',
            description: 'No pudimos duplicar el tema. Verifica tu conexión e inténtalo nuevamente.',
            code: ''
        });
    } finally {
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.textContent = buttonEl.dataset.originalText || 'Duplicar';
        }
    }
}

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
