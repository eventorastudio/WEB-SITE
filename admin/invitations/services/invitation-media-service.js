import { INVITATION_MEDIA_UPLOAD_ENABLED } from '../core/feature-flags.js?v=phase48-upload-enabled-20260816';
import {
    MEDIA_MIME_POLICY,
    MEDIA_ROLE_REGISTRY,
    createEmptyInvitationMedia,
    createMediaAsset,
    getAllMediaAssets
} from '../core/media-schema.js';

const SAFE_EVENT_ID = /^[A-Za-z0-9_-]{1,150}$/;
const SAFE_MEDIA_ID = /^MED-LOCAL-\d{3,}$/;
const SAFE_OBJECT_VERSION = /^[a-f0-9]{12}$/;
const SAFE_ROLE = /^(?:cover|gallery|place|dressCode|video|videoPoster|music)$/;
const INVITATION_CONFIG_SCHEMA_VERSION = 5;
const MEDIA_INDEX_SCHEMA_VERSION = 1;
const DEFAULT_UPLOAD_CONCURRENCY = 3;
const RESOLVE_URL_CONCURRENCY = 4;

const MIME_EXTENSIONS = Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg'
});

const MEDIA_INDEX_FIELDS = Object.freeze([
    'schemaVersion', 'coverId', 'galleryIds', 'placeIds', 'dressCodeId', 'videoId', 'posterId', 'audioId'
]);
const LEGACY_MEDIA_INDEX_FIELDS = Object.freeze([
    'schemaVersion', 'coverId', 'galleryIds', 'videoId', 'posterId', 'audioId'
]);

function serviceError(code, cause = null, details = {}) {
    const error = new Error(code);
    error.code = code;
    error.cause = cause ?? undefined;
    error.firebaseCode = cause?.code || code;
    Object.assign(error, details);
    return error;
}

function currentObjectVersion() {
    const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 12);
    if (SAFE_OBJECT_VERSION.test(random ?? '')) return random;
    return Date.now().toString(16).padStart(12, '0').slice(-12).replace(/[^a-f0-9]/g, '0');
}

function assertSafeEventId(eventId) {
    if (!SAFE_EVENT_ID.test(String(eventId ?? ''))) throw new TypeError('storage/invalid-event-id');
    return String(eventId);
}

function assertSafeAsset(asset) {
    if (!asset || !SAFE_MEDIA_ID.test(String(asset.id ?? ''))) throw new TypeError('storage/invalid-media-id');
    if (!SAFE_ROLE.test(String(asset.role ?? ''))) throw new TypeError('storage/invalid-media-role');
    const definition = MEDIA_ROLE_REGISTRY[asset.role];
    if (!definition || definition.kind !== asset.kind) throw new TypeError('storage/media-kind-mismatch');
    if (!MEDIA_MIME_POLICY[definition.kind]?.includes(asset.mimeType)) throw new TypeError('storage/unsupported-media-mime');
    if (!Number.isFinite(asset.size) || asset.size <= 0 || asset.size > definition.maxBytes) throw new TypeError('storage/invalid-media-size');
    return asset;
}

function exactKeys(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === fields.length && fields.every((field, index) => field === keys[index]);
}

function normalizeDocuments(mediaDocuments) {
    if (mediaDocuments instanceof Map) return new Map(mediaDocuments);
    const documents = new Map();
    for (const document of Array.isArray(mediaDocuments) ? mediaDocuments : []) {
        if (document?.id) documents.set(document.id, document);
    }
    return documents;
}

function sameDocument(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function buildInvitationMediaStoragePath({ eventId, assetId, role, mimeType, objectVersion = '' }) {
    const safeEventId = assertSafeEventId(eventId);
    if (!SAFE_MEDIA_ID.test(String(assetId ?? ''))) throw new TypeError('storage/invalid-media-id');
    if (!SAFE_ROLE.test(String(role ?? ''))) throw new TypeError('storage/invalid-media-role');
    const extension = MIME_EXTENSIONS[mimeType];
    if (!extension) throw new TypeError('storage/unsupported-media-mime');
    if (objectVersion && !SAFE_OBJECT_VERSION.test(objectVersion)) throw new TypeError('storage/invalid-object-version');
    const objectId = objectVersion ? `${assetId}-${objectVersion}` : assetId;
    return `eventos/${safeEventId}/invitacion/media/${role}/${objectId}.${extension}`;
}

export function parseInvitationMediaStoragePath(path) {
    const parts = String(path ?? '').split('/');
    if (parts.length !== 6 || parts[0] !== 'eventos' || parts[2] !== 'invitacion' || parts[3] !== 'media') {
        throw new TypeError('storage/invalid-media-path');
    }
    const [, eventId, , , role, fileName] = parts;
    assertSafeEventId(eventId);
    if (!SAFE_ROLE.test(role)) throw new TypeError('storage/invalid-media-role');
    const match = fileName.match(/^(MED-LOCAL-\d{3,})(?:-([a-f0-9]{12}))?\.(jpg|png|webp|mp4|webm|mp3|m4a|aac|ogg)$/);
    if (!match) throw new TypeError('storage/invalid-media-file-name');
    return Object.freeze({ eventId, role, assetId: match[1], objectVersion: match[2] ?? '', extension: match[3] });
}

export function assertOwnedInvitationMediaPath(path, eventId, assetId = '') {
    const parsed = parseInvitationMediaStoragePath(path);
    if (parsed.eventId !== assertSafeEventId(eventId) || (assetId && parsed.assetId !== assetId)) {
        throw new TypeError('storage/path-outside-event-scope');
    }
    return true;
}

export function createEmptyInvitationMediaIndex() {
    return {
        schemaVersion: MEDIA_INDEX_SCHEMA_VERSION,
        coverId: null,
        galleryIds: [],
        placeIds: [],
        dressCodeId: null,
        videoId: null,
        posterId: null,
        audioId: null
    };
}

export function createInvitationMediaIndex(media) {
    const index = createEmptyInvitationMediaIndex();
    index.coverId = media?.cover?.id ?? null;
    index.galleryIds = (Array.isArray(media?.gallery) ? media.gallery : []).map(({ id }) => id);
    index.placeIds = (Array.isArray(media?.place) ? media.place : []).map(({ id }) => id);
    index.dressCodeId = media?.dressCode?.id ?? null;
    index.videoId = media?.video?.id ?? null;
    index.posterId = media?.videoPoster?.id ?? null;
    index.audioId = media?.music?.id ?? null;
    assertInvitationMediaIndex(index);
    return index;
}

export function assertInvitationMediaIndex(index) {
    const isLegacy = exactKeys(index, [...LEGACY_MEDIA_INDEX_FIELDS].sort());
    const isCurrent = exactKeys(index, [...MEDIA_INDEX_FIELDS].sort());
    if ((!isLegacy && !isCurrent) || index.schemaVersion !== MEDIA_INDEX_SCHEMA_VERSION) {
        throw new TypeError('firestore/invalid-media-index');
    }
    if (!Array.isArray(index.galleryIds) || index.galleryIds.length > MEDIA_ROLE_REGISTRY.gallery.technicalMaxItems
        || !Array.isArray(index.placeIds ?? []) || (index.placeIds ?? []).length > MEDIA_ROLE_REGISTRY.place.technicalMaxItems) {
        throw new TypeError('firestore/invalid-media-index');
    }
    const singularIds = [index.coverId, isLegacy ? null : index.dressCodeId, index.videoId, index.posterId, index.audioId];
    if (singularIds.some((id) => id !== null && !SAFE_MEDIA_ID.test(String(id)))) {
        throw new TypeError('firestore/invalid-media-index');
    }
    if (index.galleryIds.some((id) => !SAFE_MEDIA_ID.test(String(id))) || (index.placeIds ?? []).some((id) => !SAFE_MEDIA_ID.test(String(id)))) {
        throw new TypeError('firestore/invalid-media-index');
    }
    const ids = [...singularIds.filter(Boolean), ...index.galleryIds, ...(index.placeIds ?? [])];
    if (new Set(ids).size !== ids.length) throw new TypeError('firestore/duplicate-media-id');
    return index;
}

export function serializeInvitationMediaDocument(asset, eventId) {
    assertSafeAsset(asset);
    if (!asset.storagePath) throw new TypeError('storage/media-path-required');
    assertOwnedInvitationMediaPath(asset.storagePath, eventId, asset.id);
    const parsed = parseInvitationMediaStoragePath(asset.storagePath);
    if (!parsed.objectVersion) throw new TypeError('storage/object-version-required');
    if (parsed.role !== asset.role) throw new TypeError('storage/path-role-mismatch');
    if (MIME_EXTENSIONS[asset.mimeType] !== parsed.extension) throw new TypeError('storage/path-mime-mismatch');
    return {
        id: asset.id,
        role: asset.role,
        kind: asset.kind,
        originalName: String(asset.originalName ?? '').slice(0, 180),
        mimeType: asset.mimeType,
        size: asset.size,
        width: Number(asset.width) || 0,
        height: Number(asset.height) || 0,
        duration: Number(asset.duration) || 0,
        alt: String(asset.alt ?? '').slice(0, 220),
        caption: String(asset.caption ?? '').slice(0, 360),
        storagePath: asset.storagePath,
        focalPoint: {
            x: Math.min(100, Math.max(0, Number(asset.focalPoint?.x) || 0)),
            y: Math.min(100, Math.max(0, Number(asset.focalPoint?.y) || 0))
        },
        objectVersion: parsed.objectVersion
    };
}

function deserializeInvitationMediaDocument(document, eventId, expectedRole) {
    if (!document || document.role !== expectedRole) throw new TypeError('firestore/persisted-role-mismatch');
    assertOwnedInvitationMediaPath(document.storagePath, eventId, document.id);
    const parsed = parseInvitationMediaStoragePath(document.storagePath);
    if (parsed.objectVersion !== document.objectVersion) throw new TypeError('firestore/object-version-mismatch');
    const normalized = createMediaAsset(document.id, {
        ...document,
        role: expectedRole,
        previewUrl: '',
        downloadUrl: '',
        uploadProgress: 100,
        error: '',
        status: 'uploaded'
    });
    assertSafeAsset(normalized);
    return normalized;
}

export function hydrateInvitationMedia({ mediaIndex, mediaDocuments }, eventId) {
    const index = assertInvitationMediaIndex(mediaIndex);
    const documents = normalizeDocuments(mediaDocuments);
    const media = createEmptyInvitationMedia();
    const inconsistencies = [];
    const hydrate = (mediaId, role, sortOrder = 0) => {
        if (!mediaId) return null;
        const document = documents.get(mediaId);
        if (!document) {
            inconsistencies.push({ code: 'media/document-missing', mediaId, role });
            return null;
        }
        try {
            return { ...deserializeInvitationMediaDocument(document, eventId, role), sortOrder };
        } catch (error) {
            inconsistencies.push({ code: 'media/document-invalid', mediaId, role });
            return null;
        }
    };
    media.cover = hydrate(index.coverId, 'cover');
    media.gallery = index.galleryIds.map((mediaId, sortOrder) => hydrate(mediaId, 'gallery', sortOrder)).filter(Boolean);
    media.place = (index.placeIds ?? []).map((mediaId, sortOrder) => hydrate(mediaId, 'place', sortOrder)).filter(Boolean);
    media.dressCode = hydrate(index.dressCodeId, 'dressCode');
    media.video = hydrate(index.videoId, 'video');
    media.videoPoster = hydrate(index.posterId, 'videoPoster');
    media.music = hydrate(index.audioId, 'music');
    return { media, inconsistencies };
}

function findAsset(media, assetId) {
    return getAllMediaAssets(media ?? {}).find(({ id }) => id === assetId) ?? null;
}

function mergeMediaForPersistence(currentMedia, persistedMedia, uploadedAssets = new Map()) {
    const baseline = persistedMedia ?? createEmptyInvitationMedia();
    const next = createEmptyInvitationMedia();
    const choose = (asset) => {
        if (!asset) return null;
        const uploaded = uploadedAssets.get(asset.id);
        if (uploaded) return uploaded;
        if (asset.storagePath) return asset;
        const previous = findAsset(baseline, asset.id);
        return previous ? {
            ...previous,
            alt: asset.alt,
            caption: asset.caption,
            focalPoint: asset.focalPoint,
            sortOrder: asset.sortOrder
        } : null;
    };
    next.cover = choose(currentMedia?.cover);
    next.gallery = (currentMedia?.gallery ?? []).map(choose).filter(Boolean).map((asset, sortOrder) => ({ ...asset, sortOrder }));
    next.place = (currentMedia?.place ?? []).map(choose).filter(Boolean).map((asset, sortOrder) => ({ ...asset, sortOrder }));
    next.dressCode = choose(currentMedia?.dressCode);
    next.video = choose(currentMedia?.video);
    next.videoPoster = choose(currentMedia?.videoPoster);
    next.music = choose(currentMedia?.music);
    return next;
}

function removeAssetFromMedia(media, assetId) {
    const next = { ...media, gallery: [...(media?.gallery ?? [])], place: [...(media?.place ?? [])] };
    next.gallery = next.gallery.filter(({ id }) => id !== assetId).map((asset, sortOrder) => ({ ...asset, sortOrder }));
    next.place = next.place.filter(({ id }) => id !== assetId).map((asset, sortOrder) => ({ ...asset, sortOrder }));
    for (const role of ['cover', 'dressCode', 'video', 'videoPoster', 'music']) {
        if (next[role]?.id === assetId) next[role] = null;
    }
    return next;
}

async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await worker(items[index], index);
        }
    });
    await Promise.all(runners);
    return results;
}

async function createFirebaseMediaGateway() {
    const [{ auth, db, storage }, firestoreApi, storageApi] = await Promise.all([
        import('../../firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js')
    ]);
    const configRef = (eventId) => firestoreApi.doc(db, 'eventos', eventId, 'invitacion', 'config');
    const mediaRef = (eventId, mediaId) => firestoreApi.doc(db, 'eventos', eventId, 'invitacion', 'config', 'media', mediaId);
    return {
        getCurrentUid: () => auth.currentUser?.uid ?? '',
        serverTimestamp: () => firestoreApi.serverTimestamp(),
        async readMediaIndex(eventId) {
            const snapshot = await firestoreApi.getDoc(configRef(eventId));
            return snapshot.exists() ? snapshot.data() : null;
        },
        async readMediaDocuments(eventId, mediaIds) {
            const entries = await Promise.all(mediaIds.map(async (mediaId) => {
                const snapshot = await firestoreApi.getDoc(mediaRef(eventId, mediaId));
                return snapshot.exists() ? [mediaId, snapshot.data()] : null;
            }));
            return new Map(entries.filter(Boolean));
        },
        async commitMediaState(eventId, { config, upserts, deleteIds }) {
            const batch = firestoreApi.writeBatch(db);
            batch.set(configRef(eventId), config);
            for (const operation of upserts) {
                const reference = mediaRef(eventId, operation.id);
                if (operation.isCreate) batch.set(reference, operation.data);
                else batch.update(reference, operation.data);
            }
            for (const mediaId of deleteIds) batch.delete(mediaRef(eventId, mediaId));
            await batch.commit();
        },
        uploadObject({ path, file, metadata, onProgress }) {
            const task = storageApi.uploadBytesResumable(storageApi.ref(storage, path), file, metadata);
            const promise = new Promise((resolve, reject) => {
                task.on('state_changed', (snapshot) => {
                    const progress = snapshot.totalBytes ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 : 0;
                    onProgress?.(progress, snapshot);
                }, reject, () => resolve(task.snapshot));
            });
            return { promise, cancel: () => task.cancel() };
        },
        resolveUrl: (path) => storageApi.getDownloadURL(storageApi.ref(storage, path)),
        deleteObject: (path) => storageApi.deleteObject(storageApi.ref(storage, path))
    };
}

export class InvitationMediaService {
    constructor({ enabled = false, gateway = null, gatewayFactory = createFirebaseMediaGateway } = {}) {
        this.enabled = Boolean(enabled);
        this.gateway = gateway;
        this.gatewayFactory = gatewayFactory;
        this.gatewayPromise = null;
        this.activeUploads = new Map();
        this.retryRequests = new Map();
    }

    setEnabled(enabled) { this.enabled = Boolean(enabled); }

    getStatus() {
        return Object.freeze(this.enabled ? {
            mode: 'enabled', canUpload: true, canDelete: true, code: 'storage/ready',
            message: 'Almacenamiento en la nube disponible. Revisa tus archivos y usa Guardar multimedia para persistirlos.'
        } : {
            mode: 'blocked', canUpload: false, canDelete: false, code: 'storage/not-integrated',
            message: 'Almacenamiento en la nube pendiente de configuración. La preview local sigue disponible.'
        });
    }

    async getGateway() {
        if (this.gateway) return this.gateway;
        if (!this.gatewayPromise) this.gatewayPromise = this.gatewayFactory();
        this.gateway = await this.gatewayPromise;
        return this.gateway;
    }

    assertEnabled() {
        if (!this.enabled) throw serviceError(this.getStatus().code, null, { retryable: false });
    }

    validateOwnership(path, eventId, assetId = '') { return assertOwnedInvitationMediaPath(path, eventId, assetId); }
    buildStoragePath(input) { return buildInvitationMediaStoragePath(input); }

    async loadMediaIndex(eventId) {
        this.assertEnabled();
        assertSafeEventId(eventId);
        return (await this.getGateway()).readMediaIndex(eventId);
    }

    async loadMediaDocuments(eventId, mediaIds) {
        this.assertEnabled();
        assertSafeEventId(eventId);
        const ids = [...new Set(mediaIds ?? [])];
        ids.forEach((mediaId) => {
            if (!SAFE_MEDIA_ID.test(String(mediaId))) throw new TypeError('firestore/invalid-media-id');
        });
        return (await this.getGateway()).readMediaDocuments(eventId, ids);
    }

    async resolveAssetUrl({ eventId, asset }) {
        this.assertEnabled();
        assertOwnedInvitationMediaPath(asset?.storagePath, eventId, asset?.id);
        return (await this.getGateway()).resolveUrl(asset.storagePath);
    }

    async loadMedia(eventId) {
        this.assertEnabled();
        const config = await this.loadMediaIndex(eventId);
        if (!config) {
            return {
                exists: false,
                media: createEmptyInvitationMedia(),
                mediaIndex: createEmptyInvitationMediaIndex(),
                inconsistencies: [],
                schemaVersion: null,
                updatedAt: null
            };
        }
        const index = assertInvitationMediaIndex(config.mediaIndex);
        const ids = [index.coverId, ...index.galleryIds, ...(index.placeIds ?? []), index.dressCodeId, index.videoId, index.posterId, index.audioId].filter(Boolean);
        const documents = await this.loadMediaDocuments(eventId, ids);
        const hydrated = hydrateInvitationMedia({ mediaIndex: index, mediaDocuments: documents }, eventId);
        await mapWithConcurrency(getAllMediaAssets(hydrated.media), RESOLVE_URL_CONCURRENCY, async (asset) => {
            try {
                asset.downloadUrl = await (await this.getGateway()).resolveUrl(asset.storagePath);
                asset.status = 'uploaded';
            } catch (error) {
                asset.downloadUrl = '';
                asset.status = 'error';
                asset.error = 'No fue posible resolver la vista en la nube.';
            }
        });
        return {
            exists: true,
            media: hydrated.media,
            mediaIndex: index,
            inconsistencies: hydrated.inconsistencies,
            schemaVersion: config.schemaVersion ?? null,
            updatedAt: config.updatedAt ?? null
        };
    }

    async uploadAsset({ eventId, asset, file, objectVersion = currentObjectVersion(), onProgress = null }) {
        this.assertEnabled();
        assertSafeEventId(eventId);
        assertSafeAsset(asset);
        if (!file || file.type !== asset.mimeType || file.size !== asset.size) throw serviceError('storage/file-metadata-mismatch');
        const path = buildInvitationMediaStoragePath({ eventId, assetId: asset.id, role: asset.role, mimeType: asset.mimeType, objectVersion });
        this.retryRequests.set(asset.id, { eventId, asset, file, objectVersion, onProgress });
        const gateway = await this.getGateway();
        const controller = gateway.uploadObject({
            path,
            file,
            metadata: {
                contentType: asset.mimeType,
                cacheControl: 'private,max-age=31536000,immutable',
                customMetadata: { eventId, mediaId: asset.id, role: asset.role }
            },
            onProgress
        });
        this.activeUploads.set(asset.id, controller);
        try {
            await controller.promise;
            let downloadUrl = '';
            try {
                downloadUrl = await gateway.resolveUrl(path);
            } catch (error) {
                // La URL es efímera y no forma parte del éxito del upload. Se
                // vuelve a resolver después del batch o durante hidratación.
            }
            return createMediaAsset(asset.id, {
                ...asset,
                storagePath: path,
                downloadUrl,
                previewUrl: asset.previewUrl,
                status: 'uploaded',
                uploadProgress: 100,
                error: ''
            });
        } catch (error) {
            const cancelled = error?.code === 'storage/canceled' || error?.code === 'storage/cancelled';
            throw serviceError(cancelled ? 'storage/upload-cancelled' : (error?.code || 'storage/upload-failed'), error, { retryable: !cancelled, stage: 'storage-upload' });
        } finally {
            this.activeUploads.delete(asset.id);
        }
    }

    cancelUpload(assetId) {
        const active = this.activeUploads.get(assetId);
        if (!active) return false;
        active.cancel();
        return true;
    }

    retryUpload(assetId, overrides = {}) {
        const request = this.retryRequests.get(assetId);
        if (!request) throw serviceError('storage/no-retry-request', null, { retryable: false });
        return this.uploadAsset({ ...request, ...overrides, objectVersion: currentObjectVersion() });
    }

    async persistMedia({ eventId, media, persistedMedia = null, schemaVersion = INVITATION_CONFIG_SCHEMA_VERSION, removedMediaIds = [] }) {
        this.assertEnabled();
        assertSafeEventId(eventId);
        const gateway = await this.getGateway();
        const uid = gateway.getCurrentUid?.();
        if (!uid) throw serviceError('storage/unauthenticated', null, { retryable: false });
        const timestamp = gateway.serverTimestamp();
        const mediaIndex = createInvitationMediaIndex(media);
        const previousDocuments = new Map();
        for (const asset of getAllMediaAssets(persistedMedia ?? {})) {
            previousDocuments.set(asset.id, serializeInvitationMediaDocument(asset, eventId));
        }
        const upserts = [];
        const mediaDocuments = [];
        for (const asset of getAllMediaAssets(media)) {
            const document = serializeInvitationMediaDocument(asset, eventId);
            mediaDocuments.push(document);
            const previous = previousDocuments.get(asset.id);
            if (!previous || !sameDocument(previous, document)) {
                upserts.push({
                    id: asset.id,
                    isCreate: !previous,
                    data: {
                        ...document,
                        ...(!previous ? { createdAt: timestamp } : {}),
                        updatedAt: timestamp,
                        updatedBy: uid
                    }
                });
            }
        }
        const deleteIds = [...new Set(removedMediaIds)].filter((mediaId) => previousDocuments.has(mediaId));
        await gateway.commitMediaState(eventId, {
            config: { schemaVersion, mediaIndex, updatedAt: timestamp, updatedBy: uid },
            upserts,
            deleteIds
        });
        const hydrated = hydrateInvitationMedia({ mediaIndex, mediaDocuments }, eventId);
        return { media: hydrated.media, mediaIndex, upserts, deleteIds };
    }

    async saveMedia({ eventId, media, persistedMedia = null, files = [], schemaVersion = INVITATION_CONFIG_SCHEMA_VERSION, concurrency = DEFAULT_UPLOAD_CONCURRENCY, onProgress = null }) {
        this.assertEnabled();
        const fileEntries = files instanceof Map ? [...files].map(([assetId, file]) => ({ assetId, file })) : [...files];
        const uploadedAssets = new Map();
        const uploadErrors = [];
        let completed = 0;
        await mapWithConcurrency(fileEntries, Math.min(DEFAULT_UPLOAD_CONCURRENCY, Math.max(1, concurrency)), async ({ assetId, file }) => {
            const asset = findAsset(media, assetId);
            if (!asset) {
                uploadErrors.push({ assetId, code: 'builder/media-not-found' });
                completed += 1;
                onProgress?.({ assetId, assetProgress: 0, completed, total: fileEntries.length, state: 'error' });
                return;
            }
            try {
                const uploaded = await this.uploadAsset({
                    eventId,
                    asset,
                    file,
                    onProgress: (assetProgress) => onProgress?.({ assetId, assetProgress, completed, total: fileEntries.length, state: 'uploading' })
                });
                uploadedAssets.set(assetId, uploaded);
                completed += 1;
                onProgress?.({ assetId, assetProgress: 100, completed, total: fileEntries.length, state: 'uploaded' });
            } catch (error) {
                uploadErrors.push({
                    assetId,
                    code: error?.code || 'storage/upload-failed',
                    firebaseCode: error?.code || 'storage/upload-failed',
                    stage: 'storage-upload',
                    error
                });
                completed += 1;
                onProgress?.({ assetId, assetProgress: 0, completed, total: fileEntries.length, state: 'error' });
            }
        });
        if (uploadErrors.length) {
            const stableMedia = structuredClone(persistedMedia ?? createEmptyInvitationMedia());
            return {
                media: stableMedia,
                mediaIndex: createInvitationMediaIndex(stableMedia),
                firestoreUpsertCount: 0,
                uploadedAssetIds: [],
                uploadErrors,
                replacementCleanupFailures: 0,
                persistenceStage: 'storage-upload'
            };
        }
        const nextMedia = mergeMediaForPersistence(media, persistedMedia, uploadedAssets);
        const nextIds = new Set(getAllMediaAssets(nextMedia).map(({ id }) => id));
        const removedAssets = getAllMediaAssets(persistedMedia ?? {}).filter(({ id }) => !nextIds.has(id));
        let persisted;
        try {
            persisted = await this.persistMedia({
                eventId,
                media: nextMedia,
                persistedMedia,
                schemaVersion,
                removedMediaIds: removedAssets.map(({ id }) => id)
            });
        } catch (error) {
            const compensation = await Promise.allSettled([...uploadedAssets.values()].map((asset) => gatewayDeleteOwned(this, eventId, asset.storagePath)));
            throw serviceError(error?.code || 'storage/metadata-write-failed', error, {
                stage: 'media-document-index',
                uploadedAssetIds: [...uploadedAssets.keys()],
                compensationAttempted: uploadedAssets.size,
                compensationFailures: compensation.filter(({ status }) => status === 'rejected').length
            });
        }
        const cleanupPaths = [];
        for (const uploaded of uploadedAssets.values()) {
            const previous = findAsset(persistedMedia, uploaded.id);
            if (previous?.storagePath && previous.storagePath !== uploaded.storagePath) cleanupPaths.push(previous.storagePath);
        }
        cleanupPaths.push(...removedAssets.map(({ storagePath }) => storagePath).filter(Boolean));
        const cleanup = await Promise.allSettled(cleanupPaths.map((path) => gatewayDeleteOwned(this, eventId, path)));
        const runtimeMedia = persisted.media;
        await mapWithConcurrency(getAllMediaAssets(runtimeMedia), RESOLVE_URL_CONCURRENCY, async (asset) => {
            const uploaded = uploadedAssets.get(asset.id);
            if (uploaded?.storagePath === asset.storagePath && uploaded.downloadUrl) {
                asset.downloadUrl = uploaded.downloadUrl;
                return;
            }
            try {
                asset.downloadUrl = await (await this.getGateway()).resolveUrl(asset.storagePath);
            } catch (error) {
                asset.status = 'error';
                asset.error = 'El archivo se guardó, pero su vista no pudo resolverse.';
            }
        });
        return {
            media: runtimeMedia,
            mediaIndex: persisted.mediaIndex,
            firestoreUpsertCount: persisted.upserts.length,
            uploadedAssetIds: [...uploadedAssets.keys()],
            uploadErrors,
            replacementCleanupFailures: cleanup.filter(({ status }) => status === 'rejected').length
        };
    }

    async deleteAsset({ eventId, asset, media, persistedMedia = null, schemaVersion = INVITATION_CONFIG_SCHEMA_VERSION }) {
        this.assertEnabled();
        assertOwnedInvitationMediaPath(asset?.storagePath, eventId, asset?.id);
        const nextMedia = removeAssetFromMedia(mergeMediaForPersistence(media, persistedMedia), asset.id);
        try {
            await this.persistMedia({
                eventId,
                media: nextMedia,
                persistedMedia,
                schemaVersion,
                removedMediaIds: [asset.id]
            });
        } catch (error) {
            throw serviceError(error?.code || 'firestore/delete-media-failed', error, {
                metadataDeleted: false,
                storageDeleted: false
            });
        }
        try {
            await gatewayDeleteOwned(this, eventId, asset.storagePath);
        } catch (error) {
            throw serviceError(error?.code || 'storage/delete-failed', error, {
                metadataDeleted: true,
                storageDeleted: false,
                orphanedStoragePath: asset.storagePath
            });
        }
        return { media: nextMedia, deletedPath: asset.storagePath, metadataDeleted: true, storageDeleted: true };
    }
}

async function gatewayDeleteOwned(service, eventId, storagePath) {
    assertOwnedInvitationMediaPath(storagePath, eventId);
    return (await service.getGateway()).deleteObject(storagePath);
}

export const invitationMediaService = new InvitationMediaService({ enabled: INVITATION_MEDIA_UPLOAD_ENABLED });
export function getInvitationMediaStorageStatus() { return invitationMediaService.getStatus(); }
export function configureInvitationMediaPersistence({ enabled }) { invitationMediaService.setEnabled(enabled); return invitationMediaService.getStatus(); }
export function startInvitationMediaUpload(input) { invitationMediaService.assertEnabled(); return invitationMediaService.uploadAsset(input); }
export function cancelInvitationMediaUpload(assetId) { return invitationMediaService.cancelUpload(assetId); }
export function retryInvitationMediaUpload(assetId, overrides) { return invitationMediaService.retryUpload(assetId, overrides); }
export function resolveInvitationMediaUrl(input) { return invitationMediaService.resolveAssetUrl(input); }
export function deleteInvitationMediaObject(input) { return invitationMediaService.deleteAsset(input); }
