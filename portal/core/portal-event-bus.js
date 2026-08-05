class PortalEventBus {
    constructor() { this.listeners = new Map(); }

    on(type, callback) {
        if (typeof callback !== 'function') return () => {};
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(callback);
        return () => this.listeners.get(type)?.delete(callback);
    }

    emit(type, payload) {
        this.listeners.get(type)?.forEach((callback) => {
            try { callback(payload); } catch (error) { console.error('[Portal Bus] Listener error', error); }
        });
    }

    clear() { this.listeners.clear(); }
}

export const portalEventBus = new PortalEventBus();
