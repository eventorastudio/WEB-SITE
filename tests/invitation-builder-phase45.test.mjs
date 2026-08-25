import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { createEmptyInvitationMedia, createMediaAsset } from '../admin/invitations/core/media-schema.js';
import { initMediaEditor } from '../admin/invitations/editors/media-editor.js';
import {
    InvitationMediaService,
    assertOwnedInvitationMediaPath,
    buildInvitationMediaStoragePath,
    createInvitationMediaIndex,
    hydrateInvitationMedia,
    parseInvitationMediaStoragePath,
    serializeInvitationMediaDocument
} from '../admin/invitations/services/invitation-media-service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVENT_ID = 'EVT-0001';

function asset(role, id = 'MED-LOCAL-001', overrides = {}) {
    const kinds = { cover: 'image', gallery: 'image', videoPoster: 'image', video: 'video', music: 'audio' };
    const mimes = { cover: 'image/webp', gallery: 'image/webp', videoPoster: 'image/webp', video: 'video/mp4', music: 'audio/mpeg' };
    const extensions = { cover: 'webp', gallery: 'webp', videoPoster: 'webp', video: 'mp4', music: 'mp3' };
    const version = overrides.version ?? 'abcdef123456';
    const storagePath = overrides.storagePath === undefined
        ? buildInvitationMediaStoragePath({ eventId: EVENT_ID, assetId: id, role, mimeType: mimes[role], objectVersion: version })
        : overrides.storagePath;
    return createMediaAsset(id, {
        role,
        kind: kinds[role],
        originalName: `${role}.${extensions[role]}`,
        mimeType: mimes[role],
        size: role === 'video' ? 2_000_000 : 120_000,
        width: kinds[role] === 'image' || role === 'video' ? 1200 : 0,
        height: kinds[role] === 'image' || role === 'video' ? 800 : 0,
        duration: role === 'video' ? 30 : (role === 'music' ? 90 : 0),
        alt: '<img src=x onerror=alert(1)>',
        caption: '<script>alert(1)</script>',
        storagePath,
        downloadUrl: storagePath ? `https://storage.test/${id}?token=secret` : '',
        previewUrl: storagePath ? '' : `blob:https://eventora.local/${id}`,
        status: storagePath ? 'uploaded' : 'ready',
        uploadProgress: storagePath ? 100 : 0,
        focalPoint: { x: 35, y: 65 },
        sortOrder: 0,
        ...overrides
    });
}

function fullMedia({ galleryCount = 6 } = {}) {
    const media = createEmptyInvitationMedia();
    media.cover = asset('cover', 'MED-LOCAL-001');
    media.gallery = Array.from({ length: galleryCount }, (_, index) => asset('gallery', `MED-LOCAL-${String(index + 2).padStart(3, '0')}`, {
        version: `abcde${String(index + 1).padStart(7, '0')}`,
        sortOrder: index,
        alt: `Alt ${index + 1}`,
        caption: `Caption ${index + 1}`
    }));
    const singularStart = Math.max(8, galleryCount + 2);
    media.video = asset('video', `MED-LOCAL-${String(singularStart).padStart(3, '0')}`);
    media.videoPoster = asset('videoPoster', `MED-LOCAL-${String(singularStart + 1).padStart(3, '0')}`);
    media.music = asset('music', `MED-LOCAL-${String(singularStart + 2).padStart(3, '0')}`);
    return media;
}

function persistenceFixture(media) {
    const mediaIndex = createInvitationMediaIndex(media);
    const mediaDocuments = new Map(getAllMediaAssetsForTest(media).map((item) => [item.id, {
        ...serializeInvitationMediaDocument(item, EVENT_ID),
        createdAt: { seconds: 1 },
        updatedAt: { seconds: 2 },
        updatedBy: 'UID-ADMIN-1'
    }]));
    return { mediaIndex, mediaDocuments };
}

function getAllMediaAssetsForTest(media) {
    return [media.cover, ...(media.gallery ?? []), media.video, media.videoPoster, media.music].filter(Boolean);
}

function createGateway(overrides = {}) {
    const calls = { uploads: [], commits: [], deletes: [], resolves: [], indexReads: [], documentReads: [] };
    const gateway = {
        calls,
        getCurrentUid: () => 'UID-ADMIN-1',
        serverTimestamp: () => ({ __serverTimestamp: true }),
        readMediaIndex: async (eventId) => { calls.indexReads.push(eventId); return null; },
        readMediaDocuments: async (eventId, mediaIds) => { calls.documentReads.push({ eventId, mediaIds }); return new Map(); },
        commitMediaState: async (eventId, payload) => { calls.commits.push({ eventId, ...payload }); },
        uploadObject({ path: storagePath, file, metadata, onProgress }) {
            calls.uploads.push({ storagePath, file, metadata });
            onProgress?.(25);
            onProgress?.(100);
            return { promise: Promise.resolve({ path: storagePath }), cancel: () => {} };
        },
        resolveUrl: async (storagePath) => { calls.resolves.push(storagePath); return `https://storage.test/${encodeURIComponent(storagePath)}`; },
        deleteObject: async (storagePath) => { calls.deletes.push(storagePath); },
        ...overrides
    };
    return gateway;
}

test('path canónico incluye evento, rol, ID lógico y versión inmutable', () => {
    const storagePath = buildInvitationMediaStoragePath({
        eventId: EVENT_ID,
        assetId: 'MED-LOCAL-003',
        role: 'gallery',
        mimeType: 'image/webp',
        objectVersion: 'abcdef123456'
    });
    assert.equal(storagePath, 'eventos/EVT-0001/invitacion/media/gallery/MED-LOCAL-003-abcdef123456.webp');
    assert.deepEqual(parseInvitationMediaStoragePath(storagePath), {
        eventId: EVENT_ID,
        role: 'gallery',
        assetId: 'MED-LOCAL-003',
        objectVersion: 'abcdef123456',
        extension: 'webp'
    });
    assert.throws(() => buildInvitationMediaStoragePath({ eventId: EVENT_ID, assetId: 'MED-LOCAL-003', role: 'gallery', mimeType: 'image/svg+xml' }), /unsupported-media-mime/);
});

test('ownership rechaza paths de otro evento y IDs lógicos ajenos', () => {
    const storagePath = 'eventos/EVT-0002/invitacion/media/cover/MED-LOCAL-001-abcdef123456.webp';
    assert.throws(() => assertOwnedInvitationMediaPath(storagePath, EVENT_ID), /path-outside-event-scope/);
    assert.throws(() => assertOwnedInvitationMediaPath('eventos/EVT-0001/invitacion/media/cover/MED-LOCAL-002-abcdef123456.webp', EVENT_ID, 'MED-LOCAL-001'), /path-outside-event-scope/);
});

test('serialización Firestore conserva metadata útil y excluye URLs efímeras, File, Blob y Base64', () => {
    const serialized = serializeInvitationMediaDocument(asset('cover'), EVENT_ID);
    assert.deepEqual(Object.keys(serialized), [
        'id', 'role', 'kind', 'originalName', 'mimeType', 'size', 'width', 'height',
        'duration', 'alt', 'caption', 'storagePath', 'focalPoint', 'objectVersion'
    ]);
    assert.equal(serialized.objectVersion, 'abcdef123456');
    const json = JSON.stringify(serialized);
    assert.doesNotMatch(json, /"(?:downloadUrl|previewUrl|uploadProgress|sortOrder|status|error)"\s*:|blob:|data:|base64|token=secret/i);
});

test('mediaIndex es la única fuente persistida del orden y la hidratación conserva metadata', () => {
    const original = fullMedia();
    const fixture = persistenceFixture(original);
    const restored = hydrateInvitationMedia(fixture, EVENT_ID).media;
    assert.deepEqual(restored.gallery.map(({ id, sortOrder, alt, caption }) => ({ id, sortOrder, alt, caption })),
        original.gallery.map(({ id, sortOrder, alt, caption }) => ({ id, sortOrder, alt, caption })));
    assert.deepEqual(restored.cover.focalPoint, { x: 35, y: 65 });
    assert.equal(restored.cover.downloadUrl, '');
    assert.deepEqual(fixture.mediaIndex.galleryIds, original.gallery.map(({ id }) => id));
    assert.equal(JSON.stringify([...fixture.mediaDocuments.values()]).includes('sortOrder'), false);
});

test('deserialización rechaza metadata manipulada con storagePath de otro evento', () => {
    const fixture = persistenceFixture(fullMedia({ galleryCount: 0 }));
    fixture.mediaDocuments.get('MED-LOCAL-001').storagePath = 'eventos/EVT-9999/invitacion/media/cover/MED-LOCAL-001-abcdef123456.webp';
    const result = hydrateInvitationMedia(fixture, EVENT_ID);
    assert.equal(result.media.cover, null);
    assert.deepEqual(result.inconsistencies, [{ code: 'media/document-invalid', mediaId: 'MED-LOCAL-001', role: 'cover' }]);
});

test('persistencia del servicio rechaza un storagePath perteneciente a otro evento', async () => {
    const gateway = createGateway();
    const service = new InvitationMediaService({ enabled: true, gateway });
    const media = createEmptyInvitationMedia();
    media.cover = asset('cover', 'MED-LOCAL-001', {
        storagePath: 'eventos/EVT-0002/invitacion/media/cover/MED-LOCAL-001-abcdef123456.webp'
    });
    await assert.rejects(service.persistMedia({ eventId: EVENT_ID, media }), /path-outside-event-scope/);
    assert.equal(gateway.calls.commits.length, 0);
});

test('upload usa contentType real, metadata de ownership y cache inmutable con path versionado', async () => {
    const gateway = createGateway();
    const service = new InvitationMediaService({ enabled: true, gateway });
    const local = asset('cover', 'MED-LOCAL-001', { storagePath: '', downloadUrl: '', previewUrl: 'blob:test/cover', status: 'ready' });
    const file = { type: local.mimeType, size: local.size, name: 'cover.webp' };
    const uploaded = await service.uploadAsset({ eventId: EVENT_ID, asset: local, file, objectVersion: 'abcdef123456' });
    assert.match(uploaded.storagePath, /MED-LOCAL-001-abcdef123456\.webp$/);
    assert.equal(uploaded.status, 'uploaded');
    assert.deepEqual(gateway.calls.uploads[0].metadata, {
        contentType: 'image/webp',
        cacheControl: 'private,max-age=31536000,immutable',
        customMetadata: { eventId: EVENT_ID, mediaId: local.id, role: 'cover' }
    });
});

test('upload rechaza archivo cuyo MIME o size ya no coincide con el procesado', async () => {
    const service = new InvitationMediaService({ enabled: true, gateway: createGateway() });
    const local = asset('cover', 'MED-LOCAL-001', { storagePath: '', status: 'ready' });
    await assert.rejects(service.uploadAsset({ eventId: EVENT_ID, asset: local, file: { type: 'image/png', size: local.size } }), /file-metadata-mismatch/);
    await assert.rejects(service.uploadAsset({ eventId: EVENT_ID, asset: local, file: { type: local.mimeType, size: local.size + 1 } }), /file-metadata-mismatch/);
});

test('fallo al resolver URL no invalida el upload ni deja el objeto fuera del batch', async () => {
    const gateway = createGateway({ resolveUrl: async () => { throw new Error('temporary-url-failure'); } });
    const service = new InvitationMediaService({ enabled: true, gateway });
    const media = createEmptyInvitationMedia();
    media.cover = asset('cover', 'MED-LOCAL-001', { storagePath: '', status: 'ready' });
    const result = await service.saveMedia({
        eventId: EVENT_ID,
        media,
        files: [{ assetId: media.cover.id, file: { type: media.cover.mimeType, size: media.cover.size } }]
    });
    assert.deepEqual(result.uploadedAssetIds, [media.cover.id]);
    assert.equal(result.uploadErrors.length, 0);
    assert.equal(gateway.calls.commits.length, 1);
    assert.equal(gateway.calls.commits[0].upserts.length, 1);
    assert.equal(result.media.cover.status, 'error');
    assert.equal(gateway.calls.deletes.length, 0);
});

test('saveMedia persiste sólo después de terminar Storage y usa server timestamp + UID', async () => {
    const order = [];
    const gateway = createGateway({
        uploadObject({ path: storagePath }) {
            order.push('upload-start');
            return { promise: Promise.resolve().then(() => order.push('upload-finish')), cancel: () => {} };
        },
        resolveUrl: async (storagePath) => `https://storage.test/${storagePath}`,
        commitMediaState: async (eventId, payload) => { order.push('firestore-batch'); gateway.calls.commits.push({ eventId, ...payload }); }
    });
    const service = new InvitationMediaService({ enabled: true, gateway });
    const media = createEmptyInvitationMedia();
    media.cover = asset('cover', 'MED-LOCAL-001', { storagePath: '', downloadUrl: '', previewUrl: 'blob:test/cover', status: 'ready' });
    const result = await service.saveMedia({
        eventId: EVENT_ID,
        media,
        files: [{ assetId: media.cover.id, file: { type: media.cover.mimeType, size: media.cover.size } }]
    });
    assert.deepEqual(order.slice(0, 3), ['upload-start', 'upload-finish', 'firestore-batch']);
    assert.equal(gateway.calls.commits[0].config.updatedBy, 'UID-ADMIN-1');
    assert.deepEqual(gateway.calls.commits[0].config.updatedAt, { __serverTimestamp: true });
    assert.equal(gateway.calls.commits[0].upserts.length, 1);
    assert.equal(gateway.calls.commits[0].upserts[0].data.createdAt.__serverTimestamp, true);
    assert.deepEqual(gateway.calls.commits[0].config.mediaIndex, {
        schemaVersion: 1,
        coverId: 'MED-LOCAL-001',
        galleryIds: [],
        placeIds: [],
        dressCodeId: null,
        videoId: null,
        posterId: null,
        audioId: null
    });
    assert.equal(result.uploadedAssetIds.length, 1);
});

test('galería limita uploads simultáneos a tres', async () => {
    let active = 0;
    let maximum = 0;
    const gateway = createGateway({
        uploadObject() {
            active += 1;
            maximum = Math.max(maximum, active);
            return {
                promise: new Promise((resolve) => setTimeout(() => { active -= 1; resolve(); }, 5)),
                cancel: () => {}
            };
        },
        resolveUrl: async (storagePath) => `https://storage.test/${storagePath}`
    });
    const service = new InvitationMediaService({ enabled: true, gateway });
    const media = createEmptyInvitationMedia();
    media.gallery = Array.from({ length: 6 }, (_, index) => asset('gallery', `MED-LOCAL-${String(index + 1).padStart(3, '0')}`, {
        storagePath: '', downloadUrl: '', previewUrl: `blob:test/${index}`, status: 'ready', sortOrder: index
    }));
    await service.saveMedia({
        eventId: EVENT_ID,
        media,
        files: media.gallery.map((item) => ({ assetId: item.id, file: { type: item.mimeType, size: item.size } })),
        concurrency: 20
    });
    assert.equal(maximum, 3);
});

test('fallo del batch Firestore compensa borrando cada objeto recién subido', async () => {
    const gateway = createGateway({ commitMediaState: async () => { throw Object.assign(new Error('permission'), { code: 'firestore/permission-denied' }); } });
    const service = new InvitationMediaService({ enabled: true, gateway });
    const media = createEmptyInvitationMedia();
    media.cover = asset('cover', 'MED-LOCAL-001', { storagePath: '', status: 'ready' });
    await assert.rejects(service.saveMedia({
        eventId: EVENT_ID,
        media,
        files: [{ assetId: media.cover.id, file: { type: media.cover.mimeType, size: media.cover.size } }]
    }), (error) => error.compensationAttempted === 1 && error.compensationFailures === 0);
    assert.equal(gateway.calls.deletes.length, 1);
});

test('reemplazo conserva binario anterior si upload falla', async () => {
    const gateway = createGateway({
        uploadObject() { return { promise: Promise.reject(Object.assign(new Error('network'), { code: 'storage/retry-limit-exceeded' })), cancel: () => {} }; }
    });
    const service = new InvitationMediaService({ enabled: true, gateway });
    const persisted = createEmptyInvitationMedia();
    persisted.cover = asset('cover');
    const current = createEmptyInvitationMedia();
    current.cover = asset('cover', 'MED-LOCAL-001', { storagePath: '', downloadUrl: '', previewUrl: 'blob:test/new', status: 'ready', originalName: 'new.webp' });
    const result = await service.saveMedia({
        eventId: EVENT_ID,
        media: current,
        persistedMedia: persisted,
        files: [{ assetId: current.cover.id, file: { type: current.cover.mimeType, size: current.cover.size } }]
    });
    assert.equal(result.uploadErrors.length, 1);
    assert.equal(result.uploadErrors[0].stage, 'storage-upload');
    assert.equal(result.uploadErrors[0].firebaseCode, 'storage/retry-limit-exceeded');
    assert.equal(gateway.calls.commits.length, 0);
    assert.equal(gateway.calls.deletes.length, 0);
});

test('reemplazo exitoso publica metadata nueva antes de limpiar el objeto anterior', async () => {
    const order = [];
    const gateway = createGateway({
        commitMediaState: async (eventId, payload) => { order.push('firestore-batch'); gateway.calls.commits.push({ eventId, ...payload }); },
        deleteObject: async (storagePath) => { order.push('delete-old'); gateway.calls.deletes.push(storagePath); }
    });
    const service = new InvitationMediaService({ enabled: true, gateway });
    const persisted = createEmptyInvitationMedia();
    persisted.cover = asset('cover');
    const current = createEmptyInvitationMedia();
    current.cover = asset('cover', 'MED-LOCAL-001', { storagePath: '', status: 'ready', originalName: 'new.webp' });
    await service.saveMedia({
        eventId: EVENT_ID,
        media: current,
        persistedMedia: persisted,
        files: [{ assetId: current.cover.id, file: { type: current.cover.mimeType, size: current.cover.size } }]
    });
    assert.deepEqual(order, ['firestore-batch', 'delete-old']);
    assert.equal(gateway.calls.commits[0].upserts.length, 1);
    assert.equal(gateway.calls.commits[0].upserts[0].isCreate, false);
    assert.equal(gateway.calls.deletes[0], persisted.cover.storagePath);
});

test('reemplazo de media document conserva createdAt exigido por Rules', async () => {
    const gateway = createGateway();
    const service = new InvitationMediaService({ enabled: true, gateway });
    const createdAt = { seconds: 1700000000 };
    const persisted = createEmptyInvitationMedia();
    persisted.cover = asset('cover', 'MED-LOCAL-001', { createdAt });
    const current = createEmptyInvitationMedia();
    current.cover = asset('cover', 'MED-LOCAL-001', { storagePath: '', status: 'ready' });
    await service.saveMedia({
        eventId: EVENT_ID,
        media: current,
        persistedMedia: persisted,
        files: [{ assetId: current.cover.id, file: { type: current.cover.mimeType, size: current.cover.size } }]
    });
    const operation = gateway.calls.commits[0].upserts[0];
    assert.equal(operation.isCreate, false);
    assert.deepEqual(operation.data.createdAt, createdAt);
});

test('builder state conserva auditoría al hidratar media existente', () => {
    const state = new InvitationBuilderState();
    state.initialize(EVENT_ID, {});
    const createdAt = { seconds: 1700000000 };
    const updatedAt = { seconds: 1700000100 };
    state.hydrateMedia({ cover: asset('cover', 'MED-LOCAL-001', { createdAt, updatedAt, updatedBy: 'UID-ADMIN-1' }) });
    const hydrated = state.getSnapshot().draft.media.cover;
    assert.deepEqual(hydrated.createdAt, createdAt);
    assert.deepEqual(hydrated.updatedAt, updatedAt);
    assert.equal(hydrated.updatedBy, 'UID-ADMIN-1');
});

test('delete retira mediaIndex y media document atómicamente antes de limpiar Storage', async () => {
    const order = [];
    const gateway = createGateway({
        deleteObject: async () => { order.push('storage-delete'); },
        commitMediaState: async (eventId, payload) => { order.push('firestore-batch'); gateway.calls.commits.push({ eventId, ...payload }); }
    });
    const service = new InvitationMediaService({ enabled: true, gateway });
    const media = fullMedia({ galleryCount: 1 });
    const result = await service.deleteAsset({ eventId: EVENT_ID, asset: media.cover, media, persistedMedia: media });
    assert.deepEqual(order, ['firestore-batch', 'storage-delete']);
    assert.deepEqual(gateway.calls.commits[0].deleteIds, [media.cover.id]);
    assert.equal(gateway.calls.commits[0].config.mediaIndex.coverId, null);
    assert.equal(result.media.cover, null);
});

test('delete conserva referencia si Firestore falla y reporta huérfano si Storage falla después', async () => {
    const media = fullMedia({ galleryCount: 0 });
    const storageFailure = createGateway({ deleteObject: async () => { throw Object.assign(new Error('denied'), { code: 'storage/unauthorized' }); } });
    const serviceA = new InvitationMediaService({ enabled: true, gateway: storageFailure });
    await assert.rejects(serviceA.deleteAsset({ eventId: EVENT_ID, asset: media.cover, media, persistedMedia: media }),
        (error) => error.metadataDeleted === true && error.storageDeleted === false && error.orphanedStoragePath === media.cover.storagePath);
    assert.equal(storageFailure.calls.commits.length, 1);

    const metadataFailure = createGateway({ commitMediaState: async () => { throw new Error('offline'); } });
    const serviceB = new InvitationMediaService({ enabled: true, gateway: metadataFailure });
    await assert.rejects(serviceB.deleteAsset({ eventId: EVENT_ID, asset: media.cover, media, persistedMedia: media }),
        (error) => error.metadataDeleted === false && error.storageDeleted === false);
    assert.equal(metadataFailure.calls.deletes.length, 0);
});

test('cancel cancela sólo el asset activo y retry crea una solicitud nueva', async () => {
    let rejectUpload;
    let starts = 0;
    const gateway = createGateway({
        uploadObject() {
            starts += 1;
            return {
                promise: new Promise((resolve, reject) => { rejectUpload = reject; }),
                cancel: () => rejectUpload(Object.assign(new Error('cancel'), { code: 'storage/canceled' }))
            };
        }
    });
    const service = new InvitationMediaService({ enabled: true, gateway });
    const local = asset('cover', 'MED-LOCAL-001', { storagePath: '', status: 'ready' });
    const request = service.uploadAsset({ eventId: EVENT_ID, asset: local, file: { type: local.mimeType, size: local.size } });
    await Promise.resolve();
    assert.equal(service.cancelUpload(local.id), true);
    await assert.rejects(request, /upload-cancelled/);
    const retry = service.retryUpload(local.id);
    await Promise.resolve();
    assert.equal(starts, 2);
    assert.equal(service.cancelUpload(local.id), true);
    await assert.rejects(retry, /upload-cancelled/);
});

test('loadMedia rehidrata cover, seis gallery, video, poster y audio resolviendo URLs por asset', async () => {
    const persisted = persistenceFixture(fullMedia());
    const gateway = createGateway({
        readMediaIndex: async () => ({ schemaVersion: 5, mediaIndex: persisted.mediaIndex }),
        readMediaDocuments: async () => persisted.mediaDocuments
    });
    const service = new InvitationMediaService({ enabled: true, gateway });
    const loaded = await service.loadMedia(EVENT_ID);
    assert.equal(loaded.exists, true);
    assert.equal(loaded.media.gallery.length, 6);
    assert.ok(loaded.media.cover.downloadUrl.startsWith('https://storage.test/'));
    assert.equal(loaded.media.video.status, 'uploaded');
    assert.equal(loaded.media.videoPoster.status, 'uploaded');
    assert.equal(loaded.media.music.status, 'uploaded');
    assert.equal(gateway.calls.resolves.length, 10);
});

test('un error de URL cloud queda aislado al asset y no rompe la galería', async () => {
    const persisted = persistenceFixture(fullMedia());
    const badPath = persisted.mediaDocuments.get(persisted.mediaIndex.galleryIds[2]).storagePath;
    const gateway = createGateway({
        readMediaIndex: async () => ({ schemaVersion: 5, mediaIndex: persisted.mediaIndex }),
        readMediaDocuments: async () => persisted.mediaDocuments,
        resolveUrl: async (storagePath) => {
            if (storagePath === badPath) throw new Error('404');
            return `https://storage.test/${storagePath}`;
        }
    });
    const loaded = await new InvitationMediaService({ enabled: true, gateway }).loadMedia(EVENT_ID);
    assert.equal(loaded.media.gallery.length, 6);
    assert.equal(loaded.media.gallery[2].status, 'error');
    assert.equal(loaded.media.gallery.filter(({ status }) => status === 'uploaded').length, 5);
});

test('documento media faltante se reporta sin caer y documento huérfano no se muestra', async () => {
    const persisted = persistenceFixture(fullMedia());
    const missingId = persisted.mediaIndex.galleryIds[2];
    persisted.mediaDocuments.delete(missingId);
    persisted.mediaDocuments.set('MED-LOCAL-099', {
        ...serializeInvitationMediaDocument(asset('gallery', 'MED-LOCAL-099'), EVENT_ID),
        createdAt: { seconds: 1 }, updatedAt: { seconds: 2 }, updatedBy: 'UID-ADMIN-1'
    });
    const gateway = createGateway({
        readMediaIndex: async () => ({ schemaVersion: 5, mediaIndex: persisted.mediaIndex }),
        readMediaDocuments: async () => persisted.mediaDocuments
    });
    const loaded = await new InvitationMediaService({ enabled: true, gateway }).loadMedia(EVENT_ID);
    assert.equal(loaded.media.gallery.length, 5);
    assert.deepEqual(loaded.inconsistencies, [{ code: 'media/document-missing', mediaId: missingId, role: 'gallery' }]);
    assert.equal(getAllMediaAssetsForTest(loaded.media).some(({ id }) => id === 'MED-LOCAL-099'), false);
});

test('reordenar 20 imágenes persiste sólo mediaIndex y rehidrata el orden nuevo', async () => {
    const persisted = fullMedia({ galleryCount: 20 });
    const current = structuredClone(persisted);
    const moved = current.gallery.pop();
    current.gallery.unshift(moved);
    current.gallery = current.gallery.map((item, sortOrder) => ({ ...item, sortOrder }));
    const gateway = createGateway();
    const result = await new InvitationMediaService({ enabled: true, gateway }).saveMedia({
        eventId: EVENT_ID,
        media: current,
        persistedMedia: persisted,
        files: []
    });
    assert.equal(gateway.calls.commits.length, 1);
    assert.equal(gateway.calls.commits[0].upserts.length, 0);
    assert.deepEqual(gateway.calls.commits[0].deleteIds, []);
    assert.equal(gateway.calls.commits[0].config.mediaIndex.galleryIds[0], moved.id);
    assert.deepEqual(result.media.gallery.map(({ id }) => id), current.gallery.map(({ id }) => id));
});

test('state distingue media dirty de cambios generales y conserva IDs tras rehidratación', () => {
    const state = new InvitationBuilderState();
    state.initialize(EVENT_ID, { nombreEvento: 'Evento', fecha: '2027-11-15', packageId: 'premium' });
    state.hydrateMedia(fullMedia(), { persisted: true });
    assert.equal(state.getSnapshot().ui.mediaDirty, false);
    assert.equal(state.getSnapshot().draft.meta.entitySequences.media, 10);
    state.setTheme('champagne');
    state.updateMediaAsset('MED-LOCAL-001', { alt: 'Nueva portada' });
    assert.equal(state.getSnapshot().ui.draftDirty, true);
    assert.equal(state.getSnapshot().ui.mediaDirty, true);
    state.markMediaPersisted();
    assert.equal(state.getSnapshot().ui.mediaDirty, false);
    assert.equal(state.getSnapshot().ui.isDirty, true);
});

test('downgrade y toggle no borran metadata cloud persistida', () => {
    const state = new InvitationBuilderState();
    state.initialize(EVENT_ID, { nombreEvento: 'Evento', fecha: '2027-11-15' });
    state.setPackage('premium');
    state.toggleSection('gallery', true);
    state.hydrateMedia(fullMedia(), { persisted: true });
    state.toggleSection('gallery', false);
    state.setPackage('esencial');
    assert.equal(state.getSnapshot().draft.media.gallery.length, 6);
    assert.equal(createInvitationMediaIndex(state.getSnapshot().draft.media).galleryIds.length, 6);
});

test('Media Manager habilitado muestra Guardar multimedia y persiste metadata sin activar Guardar borrador', async () => {
    const dom = new JSDOM('<main id="builder-editor"><div id="media"></div></main>', { pretendToBeVisual: true, url: 'https://eventora.local/' });
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    try {
        const state = new InvitationBuilderState();
        state.initialize(EVENT_ID, { nombreEvento: 'Evento', fecha: '2027-11-15', packageId: 'premium' });
        const media = createEmptyInvitationMedia();
        media.cover = asset('cover');
        state.hydrateMedia(media, { persisted: true });
        state.updateMediaAsset(media.cover.id, { alt: '<script>alert(1)</script>' });
        let saves = 0;
        const mockService = {
            getStatus: () => ({ canUpload: true, canDelete: true, message: 'Cloud disponible.' }),
            saveMedia: async ({ media: current }) => {
                saves += 1;
                return { media: current, uploadedAssetIds: [], uploadErrors: [], replacementCleanupFailures: 0 };
            },
            cancelUpload: () => false
        };
        const container = dom.window.document.getElementById('media');
        const cleanup = initMediaEditor({ container, state, mediaService: mockService });
        const save = container.querySelector('[data-media-action="save-media"]');
        assert.ok(save);
        assert.equal(save.disabled, false);
        assert.match(container.textContent, /Persistencia multimedia/);
        assert.equal(container.querySelectorAll('script').length, 0);
        assert.equal(container.querySelector('[data-media-field="alt"]').value, '<script>alert(1)</script>');
        save.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(saves, 1);
        assert.equal(state.getSnapshot().ui.mediaDirty, false);
        assert.equal(container.querySelector('[data-media-action="save-media"]').disabled, true);
        cleanup();
    } finally {
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
        dom.window.close();
    }
});

test('feature flag de producción habilita uploads y el editor mantiene Firebase Storage centralizado', async () => {
    const [flags, editor, firebase] = await Promise.all([
        readFile(path.join(ROOT, 'admin/invitations/core/feature-flags.js'), 'utf8'),
        readFile(path.join(ROOT, 'admin/invitations/editors/media-editor.js'), 'utf8'),
        readFile(path.join(ROOT, 'admin/firebase.js'), 'utf8')
    ]);

    assert.match(flags, /INVITATION_MEDIA_UPLOAD_ENABLED\s*=\s*true/);
    assert.doesNotMatch(editor, /firebase-storage|getStorage|uploadBytes|deleteObject\(/);
    assert.match(firebase, /getStorage\(app\)/);
    assert.equal((firebase.match(/initializeApp\(/g) ?? []).length, 1);
    assert.match(firebase, /initializeAppCheck\(app/);
});

test('Rules canónicas usan claims reales, límites sincronizados y default deny sin abrir Portal', async () => {
    const [storageRules, firestoreRules, storageProposal, firestoreProposal] = await Promise.all([
        readFile(path.join(ROOT, 'storage.rules'), 'utf8'),
        readFile(path.join(ROOT, 'firestore.rules'), 'utf8'),
        readFile(path.join(ROOT, 'storage.rules.proposed'), 'utf8'),
        readFile(path.join(ROOT, 'firestore.rules.proposed'), 'utf8')
    ]);
    assert.equal(storageRules, storageProposal);
    assert.equal(firestoreRules, firestoreProposal);
    for (const role of ['CEO', 'ADMINISTRADOR', 'DISENADOR']) assert.match(storageRules, new RegExp(role));
    assert.match(storageRules, /allow update: if false/);
    assert.match(storageRules, /20 \* 1024 \* 1024/);
    assert.match(storageRules, /80 \* 1024 \* 1024/);
    assert.match(storageRules, /image\/\(jpeg\|png\|webp\)/);
    assert.doesNotMatch(storageRules, /svg/);
    assert.match(storageRules, /match \/\{allPaths=\*\*\}[\s\S]*allow read, write: if false/);
    assert.match(firestoreRules, /match \/invitacion\/\{documentId\}/);
    assert.match(firestoreRules, /match \/invitacion\/config\/media\/\{mediaId\}/);
    assert.match(firestoreRules, /documentId == 'config' && isThemeEditor/);
    assert.match(firestoreRules, /galleryIds\.size\(\) <= 20/);
    assert.match(firestoreRules, /galleryIds\.toSet\(\)\.size\(\) == galleryIds\.size\(\)/);
    assert.doesNotMatch(firestoreRules, /validInvitationGallery|data\.media\b/);
    assert.match(firestoreRules, /data\.updatedBy == request\.auth\.uid/);
    assert.match(firestoreRules, /data\.updatedAt == request\.time/);
    assert.doesNotMatch(firestoreRules, /portalEnabled\(eventId\)[^\n]*invitacion/);
});

test('Firebase CLI queda configurado sin comandos de deploy ni estado desplegado falso', async () => {
    const [firebaseConfig, projectConfig, packageJson] = await Promise.all([
        readFile(path.join(ROOT, 'firebase.json'), 'utf8'),
        readFile(path.join(ROOT, '.firebaserc'), 'utf8'),
        readFile(path.join(ROOT, 'package.json'), 'utf8')
    ]);
    assert.equal(JSON.parse(projectConfig).projects.default, 'eventorastudio-d6d95');
    assert.equal(JSON.parse(firebaseConfig).storage.rules, 'storage.rules');
    assert.equal(JSON.parse(firebaseConfig).firestore.rules, 'firestore.rules');
    assert.doesNotMatch(packageJson, /firebase deploy/);
});
