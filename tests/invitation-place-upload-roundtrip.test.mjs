import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEmptyInvitationMedia, createMediaAsset } from '../admin/invitations/core/media-schema.js';
import { InvitationMediaService, hydrateInvitationMedia } from '../admin/invitations/services/invitation-media-service.js';

const EVENT_ID = 'EVT-0001';
const file = (name = 'place.webp') => ({ name, type: 'image/webp', size: 1000 });
function local(id) {
    return createMediaAsset(id, { role: 'place', kind: 'image', originalName: 'place.webp', mimeType: 'image/webp', size: 1000, width: 1200, height: 800, status: 'ready' });
}

function gateway() {
    const state = { config: null, documents: new Map(), paths: new Set(), commits: [] };
    return {
        state,
        getCurrentUid: () => 'UID-ADMIN-1',
        serverTimestamp: () => ({ seconds: 1 }),
        mediaDocumentExists: async (_event, mediaId) => state.documents.has(mediaId),
        uploadObject({ path }) { state.paths.add(path); return { promise: Promise.resolve(), cancel() {} }; },
        resolveUrl: async (path) => `https://cdn.test/${encodeURIComponent(path)}`,
        deleteObject: async (path) => { state.paths.delete(path); },
        commitMediaState: async (_event, payload) => {
            state.config = payload.config;
            for (const item of payload.upserts) state.documents.set(item.id, item.data);
            for (const id of payload.deleteIds) state.documents.delete(id);
            state.commits.push(payload);
        }
    };
}

test('allocator omite IDs Firestore ocupados y nunca reutiliza huecos', async () => {
    const gw = gateway();
    for (let sequence = 1; sequence <= 6; sequence += 1) gw.state.documents.set(`MED-LOCAL-${String(sequence).padStart(3, '0')}`, {});
    const service = new InvitationMediaService({ enabled: true, gateway: gw });
    assert.equal(await service.allocateMediaId(EVENT_ID, ['MED-LOCAL-001']), 'MED-LOCAL-007');
    gw.state.documents.set('MED-LOCAL-007', {});
    assert.equal(await service.allocateMediaId(EVENT_ID, ['MED-LOCAL-007']), 'MED-LOCAL-008');
    const holeGateway = gateway();
    for (const sequence of [1, 2, 4, 6]) holeGateway.state.documents.set(`MED-LOCAL-${String(sequence).padStart(3, '0')}`, {});
    const holeService = new InvitationMediaService({ enabled: true, gateway: holeGateway });
    assert.equal(await holeService.allocateMediaId(EVENT_ID, ['MED-LOCAL-002']), 'MED-LOCAL-007');
});

test('save aborta antes de Storage si un ID nuevo ya existe en Firestore', async () => {
    const gw = gateway();
    gw.state.documents.set('MED-LOCAL-007', {});
    const service = new InvitationMediaService({ enabled: true, gateway: gw });
    const media = createEmptyInvitationMedia();
    media.place = [local('MED-LOCAL-007')];
    await assert.rejects(
        service.saveMedia({ eventId: EVENT_ID, media, files: [{ assetId: 'MED-LOCAL-007', file: file() }] }),
        /firestore\/media-id-collision/
    );
    assert.equal(gw.state.paths.size, 0);
});

test('place upload persists index/document/storage and reload hydrates it', async () => {
    const gw = gateway();
    const service = new InvitationMediaService({ enabled: true, gateway: gw });
    const media = createEmptyInvitationMedia();
    media.place = [local('MED-LOCAL-001')];
    const first = await service.saveMedia({ eventId: EVENT_ID, media, files: [{ assetId: 'MED-LOCAL-001', file: file() }] });
    assert.deepEqual(first.mediaIndex.placeIds, ['MED-LOCAL-001']);
    assert.equal(gw.state.documents.get('MED-LOCAL-001').role, 'place');
    assert.match(gw.state.documents.get('MED-LOCAL-001').storagePath, /invitacion\/media\/place\/MED-LOCAL-001-/);
    const hydrated = hydrateInvitationMedia({ mediaIndex: first.mediaIndex, mediaDocuments: gw.state.documents }, EVENT_ID).media;
    assert.equal(hydrated.place.length, 1);
    assert.equal(hydrated.place[0].id, 'MED-LOCAL-001');
});

test('two place uploads, replacement and delete keep index integrity', async () => {
    const gw = gateway();
    const service = new InvitationMediaService({ enabled: true, gateway: gw });
    const media = createEmptyInvitationMedia();
    media.place = [local('MED-LOCAL-001'), local('MED-LOCAL-002')];
    const saved = await service.saveMedia({ eventId: EVENT_ID, media, files: media.place.map((asset) => ({ assetId: asset.id, file: file(asset.id) })) });
    assert.deepEqual(saved.mediaIndex.placeIds, ['MED-LOCAL-001', 'MED-LOCAL-002']);
    const before = saved.media;
    const replaced = await service.saveMedia({ eventId: EVENT_ID, media: { ...media, place: [local('MED-LOCAL-001'), before.place[1]] }, persistedMedia: before, files: [{ assetId: 'MED-LOCAL-001', file: file('replacement.webp') }] });
    assert.deepEqual(replaced.mediaIndex.placeIds, ['MED-LOCAL-001', 'MED-LOCAL-002']);
    const deleted = await service.deleteAsset({ eventId: EVENT_ID, asset: replaced.media.place[1], media: replaced.media, persistedMedia: replaced.media });
    assert.deepEqual(gw.state.config.mediaIndex.placeIds, ['MED-LOCAL-001']);
    assert.equal(deleted.media.place.length, 1);
});

test('place editor auto-persists after processing and selectors exclude local-only assets', async () => {
    const source = await readFile(new URL('../admin/invitations/editors/media-editor.js', import.meta.url), 'utf8');
    const locationEditor = await readFile(new URL('../admin/invitations/editors/location-editor.js', import.meta.url), 'utf8');
    const accommodationEditor = await readFile(new URL('../admin/invitations/editors/accommodation-editor.js', import.meta.url), 'utf8');
    assert.match(source, /role === 'place' && storageStatus\.canUpload\) await saveMedia\(\[assetId\]\)/);
    assert.match(locationEditor, /storagePath && asset\.status === 'uploaded'/);
    assert.match(accommodationEditor, /storagePath && asset\.status === 'uploaded'/);
});
