// modules/system/system-diagnostics.js
// Diagnósticos de solo lectura sobre los servicios realmente expuestos por el panel.

import { app, appCheck, auth, db } from '../../firebase.js';
import { CONFIG } from '../../config.js';
import { state } from '../../core/state.js';
import { eventBus } from '../../core/event-bus.js';
import { collection, getDocs, limit, query } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { clearAdminCache } from '../../services/admin-preferences-service.js';

const FIREBASE_SDK_VERSION = '10.12.2';

/** Ejecuta comprobaciones que no alteran datos. @returns {Promise<Object>} */
export async function collectSystemSnapshot() {
    const firestore = await checkFirestore();
    const cache = await getCacheInfo();
    const memory = getMemoryInfo();

    return {
        checkedAt: new Date(),
        services: [
            serviceResult('Firebase', Boolean(app?.options?.projectId), app?.options?.projectId || 'No disponible'),
            serviceResult('Firebase Authentication', Boolean(auth), auth?.currentUser ? 'Sesión autenticada' : 'Sin sesión activa'),
            firestore,
            unavailableResult('Storage', 'No inicializado en firebase.js'),
            unavailableResult('Hosting', 'No existe API de estado de Hosting en el navegador'),
            getAppCheckStatus(),
            unavailableResult('Analytics', 'No inicializado en esta aplicación')
        ],
        system: {
            panelVersion: CONFIG.VERSION,
            frontendVersion: CONFIG.VERSION,
            firebaseSdkVersion: FIREBASE_SDK_VERSION,
            environment: getEnvironment(),
            domain: window.location.host || 'No disponible',
            serverTime: 'No disponible',
            localTime: formatDateTime(new Date())
        },
        health: {
            stateManager: state && typeof state.getState === 'function' ? 'Disponible' : 'No disponible',
            eventBus: eventBus && typeof eventBus.on === 'function' ? 'Disponible' : 'No disponible',
            eventListeners: getEventBusListenerCount(),
            stateListeners: getStateListenerCount(),
            modulesLoaded: 'No disponible',
            memory,
            cache
        }
    };
}

/** Ejecuta el conjunto de diagnóstico y genera resultados individuales. @returns {Promise<Array<Object>>} */
export async function runFullDiagnostic(roleContext) {
    const results = [];
    const add = (name, available, detail) => results.push({ name, status: available ? 'ok' : 'unavailable', detail });

    add('Firebase', Boolean(app?.options?.projectId), app?.options?.projectId || 'No disponible');
    add('Authentication', Boolean(auth), auth?.currentUser ? 'Usuario autenticado' : 'Sin sesión activa');

    const firestore = await checkFirestore();
    add('Firestore', firestore.status === 'Conectado', firestore.detail);
    const appCheckStatus = getAppCheckStatus();
    add('App Check', appCheckStatus.status === 'Activo', appCheckStatus.detail);
    add('Storage', false, 'No disponible: Storage no está inicializado.');
    add('Estado del usuario', Boolean(auth?.currentUser), auth?.currentUser?.uid || 'Sin usuario activo');
    add('State Manager', state && typeof state.getState === 'function', getStateListenerCount() === 'No disponible' ? 'Disponible' : `${getStateListenerCount()} listeners`);
    add('Event Bus', eventBus && typeof eventBus.on === 'function', `${getEventBusListenerCount()} listeners`);
    add('Permisos', roleContext?.permissions?.includes('system-status:view'), roleContext?.role || 'No disponible');

    return results;
}

/** Limpia únicamente caches del panel administradas por el nuevo servicio. */
export async function clearSystemCache() {
    const result = await clearAdminCache();
    return { ...result, cache: await getCacheInfo() };
}

/** No hay registro real de módulos, por lo que nunca simula una reinicialización. */
export function getModuleRestartCapability() {
    return { available: false, detail: 'No disponible: no existe un registro global de módulos reiniciables.' };
}

async function checkFirestore() {
    if (!db) return unavailableResult('Firestore', 'No inicializado en firebase.js');

    const start = performance.now();
    try {
        await getDocs(query(collection(db, 'eventos'), limit(1)));
        const elapsed = Math.round(performance.now() - start);
        return { name: 'Firestore', status: 'Conectado', detail: 'Lectura de comprobación completada', responseTime: `${elapsed} ms` };
    } catch (error) {
        return { name: 'Firestore', status: 'No disponible', detail: error?.code || 'No fue posible completar la comprobación', responseTime: 'No disponible' };
    }
}

function serviceResult(name, available, detail) {
    return { name, status: available ? 'Disponible' : 'No disponible', detail, responseTime: 'No disponible' };
}

function getAppCheckStatus() {
    if (!appCheck) return unavailableResult('App Check', 'No inicializado en firebase.js');

    return {
        name: 'App Check',
        status: 'Activo',
        detail: 'Proveedor: reCAPTCHA v3 · Renovación automática: Activada · Aplicación obligatoria: No verificable desde el cliente',
        responseTime: 'No verificable desde el cliente'
    };
}

function unavailableResult(name, detail) {
    return { name, status: 'No disponible', detail, responseTime: 'No disponible' };
}

async function getCacheInfo() {
    if (!('caches' in window)) return 'No disponible';
    const cacheNames = await caches.keys();
    return `${cacheNames.length} cache${cacheNames.length === 1 ? '' : 's'} detectado${cacheNames.length === 1 ? '' : 's'}`;
}

function getMemoryInfo() {
    const memory = performance.memory;
    if (!memory?.usedJSHeapSize) return 'No disponible';
    return `${formatBytes(memory.usedJSHeapSize)} de ${formatBytes(memory.jsHeapSizeLimit)}`;
}

function getEventBusListenerCount() {
    if (!(eventBus?.listeners instanceof Map)) return 0;
    return [...eventBus.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
}

function getStateListenerCount() {
    if (!(state?._listeners instanceof Map)) return 'No disponible';
    return [...state._listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
}

function getEnvironment() {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' ? 'Desarrollo' : 'Producción';
}

function formatDateTime(value) {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'medium' }).format(value);
}

function formatBytes(value) {
    if (!Number.isFinite(value)) return 'No disponible';
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
