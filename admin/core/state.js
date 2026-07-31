// core/state.js
/**
 * @fileoverview Administrador Central del Estado Global (State Manager) para Eventora Studio.
 * 
 * Responsabilidad:
 * - Centralizar el contexto operativo, efímero y de sesión actual de la aplicación.
 * - Proveer una API robusta, controlada y reactiva (con patrón Observer interno) para lectura y mutación.
 * - Garantizar la inmutabilidad de los datos evitando modificaciones directas externas.
 * 
 * Qué almacena:
 * - auth: Información de sesión del usuario autenticado (uid, email, roles).
 * - event: Contexto del evento activo (id, metadatos esenciales como nombre, fechas).
 * - ui: Indicadores de estado visual global (pestaña activa, estado de carga global).
 * - app: Conectividad y salud del sistema.
 * - settings & permissions: Configuraciones de entorno y privilegios de usuario.
 * 
 * Qué tiene prohibido almacenar:
 * - Listas masivas de invitados o temas completos.
 * - Resultados de consultas pesadas o datos de formularios sin guardar.
 * - Referencias a elementos del DOM, objetos de Firebase, QuerySnapshots, DocumentSnapshots o Listeners.
 * 
 * Cómo debe utilizarse:
 * - Importarse en orquestadores y módulos para consultar el estado actual (state.get('auth.user')) 
 * - Modificarse exclusivamente a través de métodos oficiales (state.setState(), state.updateState()).
 * - Suscribirse a cambios específicos mediante state.subscribe().
 */

class GlobalStateManager {
    constructor() {
        /**
         * Estructura jerárquica inicial y definitiva del estado global.
         * @private
         * @type {Object}
         */
        this._state = {
            auth: {
                user: null,
                isAuthenticated: false,
                role: null
            },
            event: {
                id: null,
                data: null,
                isLoaded: false
            },
            ui: {
                activeTab: 'overview',
                isGlobalLoading: false,
                sidebarOpen: true
            },
            app: {
                isOnline: navigator.onLine,
                version: '2.0.0'
            },
            permissions: {
                canEdit: false,
                canDelete: false,
                canExport: false
            },
            settings: {
                theme: 'light',
                notificationsEnabled: true
            }
        };

        /**
         * Almacena los observadores suscritos por ruta de propiedad o globalmente.
         * @private
         * @type {Map<string, Set<Function>>}
         */
        this._listeners = new Map();

        // Monitoreo automático de conectividad de red
        window.addEventListener('online', () => this.updateState('app', { isOnline: true }));
        window.addEventListener('offline', () => this.updateState('app', { isOnline: false }));
    }

    /**
     * Obtiene una copia profunda (deep clone) de todo el estado o de una propiedad específica usando notación de puntos (ej. 'auth.user').
     * @param {string} [path] - Ruta opcional en dot-notation (ej. 'event.id').
     * @returns {any} Copia inmutable del valor solicitado.
     */
    getState(path) {
        if (!path) {
            return JSON.parse(JSON.stringify(this._state));
        }
        
        const value = path.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), this._state);
        return value !== undefined ? JSON.parse(JSON.stringify(value)) : undefined;
    }

    /**
     * Alias de getState para compatibilidad semántica rápida.
     * @param {string} [path] 
     * @returns {any}
     */
    get(path) {
        return this.getState(path);
    }

    /**
     * Reemplaza por completo una sección principal del estado o todo el árbol, notificando cambios.
     * @param {string} section - Clave de primer nivel (ej. 'auth', 'event', 'ui').
     * @param {Object} newData - Nuevos datos a fusionar o reemplazar.
     */
    setState(section, newData) {
        if (!this._state.hasOwnProperty(section)) {
            console.warn(`[State] La sección "${section}" no existe en el esquema global del State.`);
            return;
        }

        const oldValue = JSON.parse(JSON.stringify(this._state[section]));
        this._state[section] = {
            ...this._state[section],
            ...JSON.parse(JSON.stringify(newData))
        };

        this._notifyListeners(section, this._state[section], oldValue);
    }

    /**
     * Actualiza propiedades específicas de forma granular dentro de una sección mediante dot-notation.
     * @param {string} path - Ruta en dot-notation (ej. 'event.id').
     * @param {any} value - Nuevo valor a asignar.
     */
    updateState(path, value) {
        const keys = path.split('.');
        const section = keys[0];

        if (!this._state.hasOwnProperty(section)) {
            console.warn(`[State] Ruta de actualización inválida: "${path}"`);
            return;
        }

        const oldValue = this.getState(path);
        
        if (keys.length === 1) {
            this.setState(section, value);
            return;
        }

        // Navegación segura y asignación profunda inmutable
        let current = this._state;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }
        
        const lastKey = keys[keys.length - 1];
        current[lastKey] = JSON.parse(JSON.stringify(value));

        this._notifyListeners(path, value, oldValue);
        // Notifica también a la sección contenedora principal
        this._notifyListeners(section, this._state[section], null);
    }

    /**
     * Restablece el estado global a sus valores iniciales por defecto.
     */
    resetState() {
        this._state = {
            auth: { user: null, isAuthenticated: false, role: null },
            event: { id: null, data: null, isLoaded: false },
            ui: { activeTab: 'overview', isGlobalLoading: false, sidebarOpen: true },
            app: { isOnline: navigator.onLine, version: '2.0.0' },
            permissions: { canEdit: false, canDelete: false, canExport: false },
            settings: { theme: 'light', notificationsEnabled: true }
        };
        this._notifyListeners('*', this._state, null);
    }

    /**
     * Suscribe un callback para reaccionar cuando una sección o propiedad específica cambie.
     * @param {string} path - Ruta a observar (ej. 'event.id' o 'ui') o '*' para todo el estado.
     * @param {Function} callback - Función ejecutada con (newValue, oldValue).
     * @returns {Function} Función de desuscripción rápida (unsubscribe).
     */
    subscribe(path, callback) {
        if (typeof path !== 'string' || typeof callback !== 'function') {
            console.warn('[State] Parámetros inválidos en método .subscribe()');
            return () => {};
        }

        if (!this._listeners.has(path)) {
            this._listeners.set(path, new Set());
        }

        this._listeners.get(path).add(callback);

        return () => this.unsubscribe(path, callback);
    }

    /**
     * Remueve un callback de suscripción.
     * @param {string} path 
     * @param {Function} callback 
     */
    unsubscribe(path, callback) {
        if (!this._listeners.has(path)) return;
        const subs = this._listeners.get(path);
        subs.delete(callback);
        if (subs.size === 0) {
            this._listeners.delete(path);
        }
    }

    /**
     * Notifica de forma privada y eficiente a los observadores interesados.
     * @private
     * @param {string} path 
     * @param {any} newValue 
     * @param {any} oldValue 
     */
    _notifyListeners(path, newValue, oldValue) {
        // Notifica observadores específicos de la ruta
        if (this._listeners.has(path)) {
            for (const cb of this._listeners.get(path)) {
                try {
                    cb(newValue, oldValue);
                } catch (err) {
                    console.error(`[State] Error en observador para la ruta "${path}":`, err);
                }
            }
        }

        // Notifica observadores globales '*'
        if (this._listeners.has('*')) {
            for (const cb of this._listeners.get('*')) {
                try {
                    cb(newValue, oldValue, path);
                } catch (err) {
                    console.error(`[State] Error en observador global '*':`, err);
                }
            }
        }
    }
}

// Instancia única exportada (Patrón Singleton global inmutable externamente)
export const state = new GlobalStateManager();