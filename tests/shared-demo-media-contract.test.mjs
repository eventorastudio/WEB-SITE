import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createMediaAsset } from '../admin/invitations/core/media-schema.js';
import {
    InvitationMediaService,
    buildInvitationMediaStoragePath
} from '../admin/invitations/services/invitation-media-service.js';

const sharedId = 'DML-abcdefghijklmnopqrst';
const sharedPath = `demo-library/${sharedId}-abcdef123456.webp`;

function sharedAsset(id = 'MED-LOCAL-901') {
    return createMediaAsset(id, {
        role: 'gallery', kind: 'image', originalName: 'shared.webp', mimeType: 'image/webp',
        size: 4, width: 1200, height: 800, storagePath: sharedPath,
        downloadUrl: 'https://firebasestorage.googleapis.com/shared-token', status: 'uploaded',
        uploadProgress: 100, sharedDemoAssetId: sharedId
    });
}

function gateway({ onUpload = () => { }, onDelete = () => { } } = {}) {
    return {
        getCurrentUid: () => 'UID-EDITOR',
        serverTimestamp: () => ({ __serverTimestamp: true }),
        mediaDocumentExists: async () => false,
        commitMediaState: async () => {},
        deleteMediaDocument: async () => {},
        resolveUrl: async (path) => path,
        uploadObject: (...args) => { onUpload(...args); throw new Error('shared import must not upload'); },
        deleteObject: async (path) => onDelete(path)
    };
}

test('shared import reuses exactamente el path y no sube bytes', async () => {
    let uploads = 0;
    const service = new InvitationMediaService({ enabled: true, gateway: gateway({ onUpload: () => { uploads += 1; } }) });
    const shared = { ...sharedAsset('MED-LOCAL-001'), id: sharedId, kind: 'image', downloadUrl: 'https://example.test/shared.webp' };
    const a = await service.importDemoMedia({ eventId: 'EVT-DEMO-A', sharedAsset: shared, role: 'gallery' });
    const b = await service.importDemoMedia({ eventId: 'EVT-DEMO-B', sharedAsset: shared, role: 'place' });
    assert.equal(a.asset.storagePath, sharedPath);
    assert.equal(b.asset.storagePath, sharedPath);
    assert.equal(a.asset.sharedDemoAssetId, sharedId);
    assert.equal(b.asset.sharedDemoAssetId, sharedId);
    assert.equal(uploads, 0);
});

test('eliminar referencia local no llama deleteObject sobre demo-library', async () => {
    const deleted = [];
    const service = new InvitationMediaService({ enabled: true, gateway: gateway({ onDelete: (path) => deleted.push(path) }) });
    const asset = sharedAsset();
    const media = { gallery: [asset] };
    await service.deleteAsset({ eventId: 'EVT-DEMO-A', asset, media, persistedMedia: media });
    assert.deepEqual(deleted, []);
});

test('promover imagen existente descarga y sube exactamente una copia compartida', async () => {
    const uploads = [];
    const service = new InvitationMediaService({
        enabled: true,
        gateway: {
            ...gateway(),
            resolveUrl: async (path) => `https://example.test/${path}`,
            uploadObject: ({ path, file, onProgress }) => {
                uploads.push({ path, file });
                onProgress?.(100);
                return { promise: Promise.resolve(), cancel() {} };
            }
        }
    });
    const eventId = 'EVT-DEMO-PROMOTE';
    const asset = createMediaAsset('MED-LOCAL-902', {
        role: 'gallery', kind: 'image', originalName: 'aloha.webp', mimeType: 'image/webp',
        size: 4, width: 1200, height: 800,
        storagePath: buildInvitationMediaStoragePath({
            eventId, assetId: 'MED-LOCAL-902', role: 'gallery', mimeType: 'image/webp', objectVersion: 'abcdef123456'
        }),
        downloadUrl: 'https://example.test/source.webp', status: 'uploaded', uploadProgress: 100
    });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' })
    });
    try {
        const promoted = await service.promoteDemoMedia({ eventId, asset, demoMode: true });
        assert.equal(uploads.length, 1);
        assert.match(uploads[0].path, /^demo-library\/DML-[A-Za-z0-9_-]{8,80}-[a-f0-9]{12}\.webp$/);
        assert.equal(promoted.sharedDemoAssetId.startsWith('DML-'), true);
        assert.equal(promoted.storagePath, uploads[0].path);
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test('fallo al descargar o preparar la copia no altera la referencia original ni sube bytes', async () => {
    let uploads = 0;
    const service = new InvitationMediaService({
        enabled: true,
        gateway: {
            ...gateway(),
            uploadObject: () => { uploads += 1; throw new Error('must not upload'); }
        }
    });
    const eventId = 'EVT-DEMO-PROMOTE-FAIL';
    const originalPath = buildInvitationMediaStoragePath({
        eventId, assetId: 'MED-LOCAL-903', role: 'gallery', mimeType: 'image/png', objectVersion: 'abcdef123456'
    });
    const asset = createMediaAsset('MED-LOCAL-903', {
        role: 'gallery', kind: 'image', originalName: 'aloha.png', mimeType: 'image/png', size: 4,
        width: 800, height: 600, storagePath: originalPath, downloadUrl: 'https://example.test/source.png',
        status: 'uploaded', uploadProgress: 100
    });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    });
    try {
        await assert.rejects(() => service.promoteDemoMedia({ eventId, asset, demoMode: true }), /source-size-mismatch/);
        assert.equal(uploads, 0);
        assert.equal(asset.storagePath, originalPath);
        assert.equal(asset.sharedDemoAssetId, undefined);
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test('promoción fuera de DEMO se rechaza antes de descargar o subir', async () => {
    let downloads = 0;
    const service = new InvitationMediaService({
        enabled: true,
        gateway: { ...gateway(), resolveUrl: async () => { downloads += 1; return 'https://example.test/source.webp'; } }
    });
    const asset = createMediaAsset('MED-LOCAL-904', {
        role: 'gallery', kind: 'image', originalName: 'normal.webp', mimeType: 'image/webp', size: 4,
        width: 800, height: 600,
        storagePath: buildInvitationMediaStoragePath({
            eventId: 'EVT-NORMAL-PROMOTE', assetId: 'MED-LOCAL-904', role: 'gallery', mimeType: 'image/webp', objectVersion: 'abcdef123456'
        }), status: 'uploaded', uploadProgress: 100
    });
    await assert.rejects(() => service.promoteDemoMedia({ eventId: 'EVT-NORMAL-PROMOTE', asset, demoMode: false }), /demo-mode-required/);
    assert.equal(downloads, 0);
});

test('la acción UI queda limitada a DEMO y a imágenes elegibles', async () => {
    const source = await readFile(new URL('../admin/invitations/editors/media-editor.js', import.meta.url), 'utf8');
    assert.match(source, /demoMode: snapshot\.draft\.settings\?\.demoMode === true/);
    assert.match(source, /if \(demoMode && promotableImage\)/);
    assert.match(source, /\['image\/jpeg', 'image\/png', 'image\/webp'\]\.includes\(asset\.mimeType\)/);
    assert.match(source, /button\('Compartir con DEMOS', 'promote-demo-asset'/);
});
