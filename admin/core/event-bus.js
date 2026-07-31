// core/event-bus.js
// Infraestructura central de comunicación desacoplada (Pub/Sub) para Eventora Studio

class EventBus {
    constructor() {
        /**
         * Almacena los listeners agrupados por tipo de evento.
         * @private
         * @type {Map<string, Set<Function>>}
         */
        this.listeners = new Map();
    }

    /**
     * Suscribe un callback a un tipo de evento específico.
     * @param {string} eventType - Constante proveniente de EVENT_TYPES.
     * @param {Function} callback - Función a ejecutar cuando se emita el evento.
     * @returns {Function} Función de desuscripción rápida (unsubscribe).
     */
    on(eventType, callback) {
        if (typeof eventType !== 'string' || typeof callback !== 'function') {
            console.warn('[EventBus] Parámetros inválidos en método .on()');
            return () => {};
        }

        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }

        this.listeners.get(eventType).add(callback);

        // Retorna un hook conveniente para desuscribirse limpiamente
        return () => this.off(eventType, callback);
    }

    /**
     * Suscribe un callback que se ejecutará una sola vez y se eliminará automáticamente.
     * @param {string} eventType - Constante proveniente de EVENT_TYPES.
     * @param {Function} callback - Función a ejecutar una vez.
     */
    once(eventType, callback) {
        const wrapper = (data) => {
            this.off(eventType, wrapper);
            callback(data);
        };
        return this.on(eventType, wrapper);
    }

    /**
     * Remueve un callback específico de un tipo de evento.
     * @param {string} eventType - Constante proveniente de EVENT_TYPES.
     * @param {Function} callback - Función previamente suscrita.
     */
    off(eventType, callback) {
        if (!this.listeners.has(eventType)) return;

        const subscripciones = this.listeners.get(eventType);
        subscripciones.delete(callback);

        if (subscripciones.size === 0) {
            this.listeners.delete(eventType);
        }
    }

    /**
     * Emite un evento notificando a todos los suscriptores registrados.
     * Restricción arquitectónica: Solo transporta metadatos o cargas ligeras.
     * @param {string} eventType - Constante proveniente de EVENT_TYPES.
     * @param {any} [payload] - Datos ligeros opcionales a transmitir.
     */
    emit(eventType, payload) {
        if (!this.listeners.has(eventType)) return;

        const subscripciones = this.listeners.get(eventType);
        for (const callback of subscripciones) {
            try {
                callback(payload);
            } catch (error) {
                console.error(`[EventBus] Error ejecutando el callback para el evento "${eventType}":`, error);
            }
        }
    }

    /**
     * Limpia y elimina todos los listeners registrados en el bus (útil para resets globales o tests).
     */
    clear() {
        this.listeners.clear();
    }
}

// Instancia única exportada (Patrón Singleton en memoria)
export const eventBus = new EventBus();