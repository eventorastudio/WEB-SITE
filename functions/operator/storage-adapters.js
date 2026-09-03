import { GoogleAuth } from 'google-auth-library';

export const EXPECTED_PROJECT_ID = 'eventorastudio-d6d95';
export const EXPECTED_BUCKET_NAME = 'eventorastudio-d6d95.firebasestorage.app';
const STORAGE_API_ORIGIN = 'https://storage.googleapis.com';
const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';
const REQUEST_TIMEOUT_MS = 10_000;

export function configuredProjectId(environment = process.env) {
    const explicit = String(environment.GOOGLE_CLOUD_PROJECT ?? '').trim();
    const legacy = String(environment.GCLOUD_PROJECT ?? '').trim();
    if (explicit && legacy && explicit !== legacy) throw storageError('BACKEND_PROJECT_MISMATCH');
    if (explicit) return explicit;
    if (environment.FIRESTORE_EMULATOR_HOST && legacy) return legacy;
    return '';
}

function storageError(code, details = {}) {
    const error = new Error(code);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function assertGeneration(value) {
    const generation = String(value ?? '').trim();
    if (!/^\d+$/.test(generation)) throw storageError('STORAGE_GENERATION_MISSING');
    return generation;
}

function assertObjectName(value) {
    const objectName = String(value ?? '');
    if (!objectName || objectName.includes('\\') || objectName.includes('..')
        || objectName.startsWith('/') || objectName.length > 1024) {
        throw storageError('STORAGE_PATH_OUTSIDE_EVENT_PREFIX');
    }
    return objectName;
}

function mapHttpError(status) {
    if (status === 401 || status === 403) return storageError('STORAGE_AUTHORIZATION_ERROR');
    if (status === 404) return storageError('NOT_FOUND');
    if (status === 412) return storageError('GENERATION_MISMATCH');
    if (status === 429) return storageError('STORAGE_UPSTREAM_RETRYABLE', { retryable: true });
    if (status >= 500) return storageError('STORAGE_UPSTREAM_RETRYABLE', { retryable: true });
    return storageError('STORAGE_API_ERROR', { httpStatus: status });
}

function validateObject(item) {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.name) {
        throw storageError('STORAGE_API_INVALID_RESPONSE');
    }
    const generation = String(item.generation ?? '').trim();
    if (!/^\d+$/.test(generation)) throw storageError('STORAGE_API_INVALID_RESPONSE');
    return { name: item.name, generation };
}

export class ProductionStorageAdapter {
    constructor({ auth = new GoogleAuth({ scopes: [STORAGE_SCOPE] }), fetchImpl = fetch } = {}) {
        this.name = EXPECTED_BUCKET_NAME;
        this.__eventoraStorageProductionAdapter = true;
        this.auth = auth;
        this.fetchImpl = fetchImpl;
    }

    buildUrl(path, query = {}) {
        const url = new URL(`${STORAGE_API_ORIGIN}/storage/v1/b/${encodeURIComponent(EXPECTED_BUCKET_NAME)}/o${path}`);
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
        }
        return url;
    }

    async request(url, { method = 'GET' } = {}) {
        let headers;
        try {
            const client = await this.auth.getClient();
            headers = await client.getRequestHeaders(url.toString());
        } catch (error) {
            throw storageError('STORAGE_AUTHORIZATION_ERROR', { cause: error });
        }
        let response;
        try {
            response = await this.fetchImpl(url, {
                method,
                headers: { authorization: headers.authorization ?? headers.Authorization ?? '' },
                redirect: 'error',
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });
        } catch (error) {
            throw storageError(error?.name === 'TimeoutError' ? 'STORAGE_UPSTREAM_TIMEOUT' : 'STORAGE_UPSTREAM_RETRYABLE', { cause: error });
        }
        if (!response.ok) throw mapHttpError(response.status);
        if (response.status === 204) return null;
        let body;
        try { body = await response.json(); } catch (error) {
            throw storageError('STORAGE_API_INVALID_RESPONSE', { cause: error });
        }
        return body;
    }

    async listObjects({ prefix } = {}) {
        const safePrefix = String(prefix ?? '');
        const items = [];
        const seenTokens = new Set();
        let pageToken = null;
        do {
            if (pageToken && seenTokens.has(pageToken)) throw storageError('STORAGE_API_INVALID_RESPONSE');
            if (pageToken) seenTokens.add(pageToken);
            const url = this.buildUrl('', {
                prefix: safePrefix,
                pageToken,
                maxResults: 1000,
                fields: 'items(name,generation),nextPageToken'
            });
            const body = await this.request(url);
            if (!body || (body.items !== undefined && !Array.isArray(body.items))
                || (body.nextPageToken !== undefined && typeof body.nextPageToken !== 'string')) {
                throw storageError('STORAGE_API_INVALID_RESPONSE');
            }
            items.push(...(body.items ?? []).map(validateObject));
            pageToken = body.nextPageToken ?? null;
        } while (pageToken);
        return { items };
    }

    async getObjectMetadata(objectName) {
        const object = assertObjectName(objectName);
        return validateObject(await this.request(this.buildUrl(`/${encodeURIComponent(object)}`)));
    }

    async deleteObjectIfGenerationMatch(objectName, expectedGeneration) {
        const object = assertObjectName(objectName);
        const generation = assertGeneration(expectedGeneration);
        await this.request(this.buildUrl(`/${encodeURIComponent(object)}`, { ifGenerationMatch: generation }), { method: 'DELETE' });
    }
}

export class EmulatorStorageAdapter {
    constructor({ bucket } = {}) {
        if (!bucket || typeof bucket.getFiles !== 'function' || typeof bucket.file !== 'function') {
            throw storageError('EMULATOR_STORAGE_ADAPTER_REQUIRED');
        }
        this.bucket = bucket;
        this.name = bucket.name ?? EXPECTED_BUCKET_NAME;
        this.__eventoraStorageEmulatorMock = true;
    }

    async listObjects({ prefix } = {}) {
        const [files] = await this.bucket.getFiles({ prefix });
        return {
            items: (files ?? []).map((file) => ({
                name: String(file.name ?? ''),
                generation: String(file.metadata?.generation ?? file.generation ?? '')
            })),
            nextPageToken: null
        };
    }

    async getObjectMetadata(objectName) {
        const file = this.bucket.file(objectName);
        if (typeof file.getMetadata === 'function') {
            const [metadata] = await file.getMetadata();
            return { name: objectName, generation: String(metadata?.generation ?? file.generation ?? '') };
        }
        if (typeof file.exists === 'function') {
            const [exists] = await file.exists();
            if (!exists) throw storageError('NOT_FOUND');
            return { name: objectName, generation: String(file.metadata?.generation ?? file.generation ?? '') };
        }
        throw storageError('STORAGE_API_INVALID_RESPONSE');
    }

    async deleteObjectIfGenerationMatch(objectName, expectedGeneration) {
        const generation = assertGeneration(expectedGeneration);
        try {
            await this.bucket.file(objectName).delete({ ifGenerationMatch: generation });
        } catch (error) {
            if (String(error?.code) === '404' || String(error?.code) === 'not-found') throw storageError('NOT_FOUND');
            if (String(error?.code) === '412' || String(error?.code) === 'precondition-failed') throw storageError('GENERATION_MISMATCH');
            throw error;
        }
    }
}

export function createStorageAdapter({ bucket = null, environment = process.env } = {}) {
    if (bucket?.listObjects && bucket?.getObjectMetadata && bucket?.deleteObjectIfGenerationMatch) return bucket;
    if (bucket) return new EmulatorStorageAdapter({ bucket });
    const emulator = Boolean(environment.FIREBASE_STORAGE_EMULATOR_HOST || environment.STORAGE_EMULATOR_HOST);
    if (emulator) return new EmulatorStorageAdapter({ bucket });
    if (configuredProjectId(environment) === EXPECTED_PROJECT_ID || environment.NODE_ENV === 'production') {
        return new ProductionStorageAdapter();
    }
    throw storageError('STORAGE_ENVIRONMENT_UNKNOWN');
}
