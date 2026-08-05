// modules/system/system-status-module.js
// Presentación de monitoreo interno y acciones diagnósticas de solo lectura.

import { ui } from '../../core/ui.js';
import {
    clearSystemCache,
    collectSystemSnapshot,
    getModuleRestartCapability,
    runFullDiagnostic
} from './system-diagnostics.js';
import { createSystemLog } from './system-log.js';

let activeContext = null;
let systemLog = null;
let cleanups = [];
let clockTimer = null;

/** @param {{user: Object, roleContext: Object}} context */
export async function initSystemStatusModule(context) {
    destroySystemStatusModule();
    activeContext = context;
    systemLog = createSystemLog(renderLogs);
    systemLog.record('Sesión autenticada detectada', 'success');
    bindSystemStatusEvents();
    startLocalClock();
    await refreshSnapshot();
}

export function destroySystemStatusModule() {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    systemLog?.destroy();
    systemLog = null;
    activeContext = null;
    if (clockTimer) window.clearInterval(clockTimer);
    clockTimer = null;
}

async function refreshSnapshot() {
    setLoading(true);
    try {
        const snapshot = await collectSystemSnapshot();
        renderSnapshot(snapshot);
        setText('system-last-check', `Última comprobación: ${formatTime(snapshot.checkedAt)}`);
    } catch (error) {
        console.error('[System Status] No se pudo obtener el estado.', error);
        ui.showError({ title: 'No se pudo actualizar el estado', description: 'La comprobación no pudo completarse.', code: 'ERR_SYSTEM_STATUS' });
    } finally {
        setLoading(false);
    }
}

function bindSystemStatusEvents() {
    listen(document.getElementById('btn-run-diagnostic'), 'click', runDiagnostic);
    listen(document.getElementById('btn-clear-cache'), 'click', clearCache);
    listen(document.getElementById('btn-restart-modules'), 'click', showModuleRestartCapability);
    listen(document.getElementById('btn-reload-system-config'), 'click', refreshSnapshot);
}

async function runDiagnostic() {
    const button = document.getElementById('btn-run-diagnostic');
    setButtonBusy(button, true);
    try {
        const results = await runFullDiagnostic(activeContext?.roleContext);
        renderDiagnosticResults(results);
        const unavailable = results.filter((result) => result.status !== 'ok').length;
        systemLog?.record(`Diagnóstico ejecutado: ${results.length - unavailable} comprobaciones correctas`, unavailable ? 'warning' : 'success');
        ui.showToast({ title: 'Diagnóstico completado', message: unavailable ? `${unavailable} componentes requieren atención.` : 'Todos los componentes disponibles respondieron correctamente.', type: unavailable ? 'warning' : 'success' });
    } catch (error) {
        console.error('[System Status] Diagnóstico fallido.', error);
        ui.showError({ title: 'Diagnóstico incompleto', description: 'No fue posible finalizar todas las comprobaciones.', code: 'ERR_DIAGNOSTIC' });
    } finally {
        setButtonBusy(button, false);
    }
}

async function clearCache() {
    const button = document.getElementById('btn-clear-cache');
    setButtonBusy(button, true);
    try {
        const result = await clearSystemCache();
        systemLog?.record(`Cache del panel limpiado (${result.cacheEntries} Cache Storage, ${result.localEntries} preferencias)`, 'success');
        ui.showToast({ title: 'Cache limpiado', message: 'La sesión de Firebase se conservó.', type: 'success' });
        await refreshSnapshot();
    } catch (error) {
        console.error('[System Status] No se pudo limpiar el cache.', error);
        ui.showError({ title: 'No se pudo limpiar el cache', description: 'Inténtalo nuevamente.', code: 'ERR_CLEAR_CACHE' });
    } finally {
        setButtonBusy(button, false);
    }
}

function showModuleRestartCapability() {
    const capability = getModuleRestartCapability();
    ui.showToast({ title: 'Reinicio de módulos', message: capability.detail, type: 'info', duration: 6000 });
}

function renderSnapshot(snapshot) {
    snapshot.services.forEach((service) => {
        const card = document.querySelector(`[data-service="${service.name}"]`);
        if (!card) return;
        setCardStatus(card, service.status);
        setTextWithin(card, '[data-status]', service.status);
        setTextWithin(card, '[data-detail]', service.detail);
        setTextWithin(card, '[data-response-time]', service.responseTime);
    });

    setText('system-panel-version', snapshot.system.panelVersion);
    setText('system-frontend-version', snapshot.system.frontendVersion);
    setText('system-firebase-sdk', snapshot.system.firebaseSdkVersion);
    setText('system-environment', snapshot.system.environment);
    setText('system-domain', snapshot.system.domain);
    setText('system-server-time', snapshot.system.serverTime);
    setText('system-local-time', snapshot.system.localTime);

    setText('health-state-manager', snapshot.health.stateManager);
    setText('health-event-bus', snapshot.health.eventBus);
    setText('health-event-listeners', String(snapshot.health.eventListeners));
    setText('health-state-listeners', String(snapshot.health.stateListeners));
    setText('health-modules-loaded', snapshot.health.modulesLoaded);
    setText('health-memory', snapshot.health.memory);
    setText('health-cache', snapshot.health.cache);
}

function renderLogs(entries) {
    const list = document.getElementById('system-log-list');
    const empty = document.getElementById('system-log-empty');
    if (!list || !empty) return;

    list.replaceChildren();
    empty.hidden = entries.length > 0;
    entries.forEach((entry) => {
        const item = document.createElement('li');
        item.className = `system-log-item system-log-item--${entry.type}`;
        const message = document.createElement('span');
        const time = document.createElement('time');
        message.textContent = entry.message;
        time.textContent = formatTime(entry.timestamp);
        item.append(message, time);
        list.appendChild(item);
    });
}

function renderDiagnosticResults(results) {
    const panel = document.getElementById('diagnostic-results');
    const list = document.getElementById('diagnostic-results-list');
    const summary = document.getElementById('diagnostic-summary');
    if (!panel || !list || !summary) return;

    list.replaceChildren();
    const successful = results.filter((result) => result.status === 'ok').length;
    summary.textContent = `${successful} de ${results.length} comprobaciones disponibles respondieron correctamente.`;

    results.forEach((result) => {
        const item = document.createElement('li');
        item.className = `diagnostic-result diagnostic-result--${result.status}`;
        const name = document.createElement('strong');
        const detail = document.createElement('span');
        name.textContent = result.name;
        detail.textContent = result.detail;
        item.append(name, detail);
        list.appendChild(item);
    });

    panel.hidden = false;
}

function startLocalClock() {
    const renderClock = () => setText('system-local-time', new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date()));
    renderClock();
    clockTimer = window.setInterval(renderClock, 1000);
}

function setCardStatus(card, status) {
    card.dataset.status = status === 'Conectado' || status === 'Disponible' || status === 'Activo' ? 'available' : 'unavailable';
}

function setTextWithin(element, selector, value) {
    const target = element.querySelector(selector);
    if (target) target.textContent = value;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function setLoading(isLoading) {
    const button = document.getElementById('btn-reload-system-config');
    if (button) button.disabled = isLoading;
}

function setButtonBusy(button, isBusy) {
    if (!button) return;
    button.disabled = isBusy;
    button.setAttribute('aria-busy', String(isBusy));
}

function formatTime(value) {
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(value);
}

function listen(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    cleanups.push(() => target.removeEventListener(eventName, handler));
}
