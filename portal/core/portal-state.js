const INITIAL_STATE = Object.freeze({
    auth: { user: null, profile: null, authenticated: false },
    event: { id: null, data: null },
    permissions: { portal: false, checkInQR: false, seguimientoEnVivo: false, historialAccesos: false },
    connectivity: { online: typeof navigator === 'undefined' ? true : navigator.onLine, syncing: false },
    ui: { page: null, ready: false }
});

class PortalState {
    constructor() {
        this.value = clone(INITIAL_STATE);
        this.listeners = new Map();
    }

    get(path) {
        if (!path) return clone(this.value);
        const result = path.split('.').reduce((current, key) => current?.[key], this.value);
        return result === undefined ? undefined : clone(result);
    }

    set(section, value) {
        if (!(section in this.value)) throw new Error(`portal-state/unknown-section:${section}`);
        const previous = this.get(section);
        this.value[section] = { ...this.value[section], ...clone(value) };
        this.notify(section, this.get(section), previous);
    }

    update(path, value) {
        const keys = path.split('.');
        if (!keys[0] || !(keys[0] in this.value)) throw new Error(`portal-state/unknown-path:${path}`);
        const previous = this.get(path);
        let target = this.value;
        keys.slice(0, -1).forEach((key) => { target = target[key]; });
        target[keys.at(-1)] = clone(value);
        this.notify(path, this.get(path), previous);
        this.notify(keys[0], this.get(keys[0]), null);
    }

    subscribe(path, callback) {
        if (typeof callback !== 'function') return () => {};
        if (!this.listeners.has(path)) this.listeners.set(path, new Set());
        this.listeners.get(path).add(callback);
        return () => this.listeners.get(path)?.delete(callback);
    }

    reset() {
        this.value = clone(INITIAL_STATE);
        this.notify('*', this.get(), null);
    }

    notify(path, value, previous) {
        this.listeners.get(path)?.forEach((listener) => {
            try { listener(value, previous); } catch (error) { console.error('[Portal State] Listener error', error); }
        });
        this.listeners.get('*')?.forEach((listener) => {
            try { listener(value, previous, path); } catch (error) { console.error('[Portal State] Listener error', error); }
        });
    }
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export const portalState = new PortalState();
