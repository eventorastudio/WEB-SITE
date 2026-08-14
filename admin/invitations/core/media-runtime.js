export class MediaObjectUrlRegistry {
    constructor({ urlApi = globalThis.URL } = {}) {
        this.urlApi = urlApi;
        this.entries = new Map();
    }

    set(assetId, file) {
        if (!assetId || !file) throw new TypeError('media/runtime-invalid-entry');
        this.revoke(assetId);
        if (typeof this.urlApi?.createObjectURL !== 'function') throw new Error('media/object-url-unavailable');
        const previewUrl = this.urlApi.createObjectURL(file);
        this.entries.set(assetId, { file, previewUrl });
        return previewUrl;
    }

    get(assetId) {
        return this.entries.get(assetId) ?? null;
    }

    revoke(assetId) {
        const current = this.entries.get(assetId);
        if (!current) return false;
        if (typeof this.urlApi?.revokeObjectURL === 'function') this.urlApi.revokeObjectURL(current.previewUrl);
        this.entries.delete(assetId);
        return true;
    }

    revokeAll() {
        [...this.entries.keys()].forEach((assetId) => this.revoke(assetId));
    }
}
