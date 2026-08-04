// modules/settings/settings-module.js
// Gestiona preferencias locales del panel sin mutar el State global.

import { ui } from '../../core/ui.js';
import { getThemePreference, setThemePreference } from '../../core/theme-manager.js';
import {
    applyAdminDisplayPreferences,
    getDefaultSettings,
    getUserPreferences,
    saveUserPreferences
} from '../../services/admin-preferences-service.js';

let currentUserId = null;
let cleanups = [];

/**
 * Inicializa las preferencias de configuración del administrador.
 * @param {{user: Object, roleContext: Object}} context
 * @returns {void}
 */
export function initSettingsModule({ user, roleContext }) {
    destroySettingsModule();
    currentUserId = user.uid;

    const settings = getUserPreferences(currentUserId, 'settings', getDefaultSettings());
    populateSettings(settings);
    applyAdminDisplayPreferences(settings);
    document.getElementById('developer-settings-section').hidden = roleContext.role !== 'CEO';
    bindSettingsEvents();
}

/** Libera listeners propios. */
export function destroySettingsModule() {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    currentUserId = null;
}

function populateSettings(settings) {
    setValue('setting-language', settings.language);
    setValue('setting-timezone', settings.timezone);
    setValue('setting-date-format', settings.dateFormat);
    setValue('setting-time-format', settings.timeFormat);
    setValue('setting-theme', getThemePreference());
    setChecked('setting-animations', settings.animations);
    setChecked('setting-compact-view', settings.compactView);
    setChecked('setting-sidebar-expanded', settings.sidebarExpanded);
}

function bindSettingsEvents() {
    listen(document.getElementById('settings-form'), 'submit', handleSettingsSubmit);
    listen(document.getElementById('setting-theme'), 'change', handleThemePreferenceChange);
    listen(document.getElementById('setting-compact-view'), 'change', () => applyPreview());
    listen(document.getElementById('setting-animations'), 'change', () => applyPreview());
    listen(document.getElementById('btn-open-system-status'), 'click', () => window.location.assign('./system-status.html'));
}

function handleSettingsSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const { theme, ...settings } = collectSettings();
    saveUserPreferences(currentUserId, 'settings', settings);
    applyAdminDisplayPreferences(settings);
    setThemePreference(theme);
    ui.showToast({ title: 'Configuración guardada', message: 'Tus preferencias del panel fueron actualizadas.', type: 'success' });
}

function handleThemePreferenceChange(event) {
    setThemePreference(event.currentTarget.value);
}

function applyPreview() {
    applyAdminDisplayPreferences({
        compactView: getChecked('setting-compact-view'),
        animations: getChecked('setting-animations')
    });
}

function collectSettings() {
    return {
        language: getValue('setting-language'),
        timezone: getValue('setting-timezone'),
        dateFormat: getValue('setting-date-format'),
        timeFormat: getValue('setting-time-format'),
        theme: getValue('setting-theme'),
        animations: getChecked('setting-animations'),
        compactView: getChecked('setting-compact-view'),
        sidebarExpanded: getChecked('setting-sidebar-expanded')
    };
}

function getValue(id) {
    return String(document.getElementById(id)?.value ?? '');
}

function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? '';
}

function getChecked(id) {
    return Boolean(document.getElementById(id)?.checked);
}

function setChecked(id, value) {
    const element = document.getElementById(id);
    if (element) element.checked = Boolean(value);
}

function listen(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    cleanups.push(() => target.removeEventListener(eventName, handler));
}
