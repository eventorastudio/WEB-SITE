import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAccommodation } from '../admin/invitations/core/logistics-schema.js';
import { InvitationMediaService, createInvitationMediaIndex, hydrateInvitationMedia, serializeInvitationMediaDocument, buildInvitationMediaStoragePath } from '../admin/invitations/services/invitation-media-service.js';
import { createMediaAsset } from '../admin/invitations/core/media-schema.js';

const EVENT_ID = 'EVT-0001';

function placeAsset(id) {
    return createMediaAsset(id, {
        role: 'place', kind: 'image', originalName: 'place.webp', mimeType: 'image/webp', size: 1000,
        width: 1200, height: 800, storagePath: buildInvitationMediaStoragePath({
            eventId: EVENT_ID, assetId: id, role: 'place', mimeType: 'image/webp', objectVersion: 'abcdef123456'
        })
    });
}

test('accommodation icons preserve current values and legacy absence', () => {
    const legacy = createAccommodation('HOT-LOCAL-001', { name: 'Hotel' });
    assert.equal(Object.hasOwn(legacy, 'categoryIcon'), false);
    assert.equal(Object.hasOwn(legacy, 'venueIcon'), false);
    const current = createAccommodation('HOT-LOCAL-001', { categoryIcon: 'hotel', venueIcon: 'venue' });
    assert.equal(current.categoryIcon, 'hotel');
    assert.equal(current.venueIcon, 'venue');
    const none = createAccommodation('HOT-LOCAL-001', { categoryIcon: '', venueIcon: '' });
    assert.equal(none.categoryIcon, '');
    assert.equal(none.venueIcon, '');
});

test('canonical place media index hydrates every place asset and resolves by role', () => {
    const assets = [placeAsset('MED-LOCAL-001'), placeAsset('MED-LOCAL-002')];
    const index = createInvitationMediaIndex({ place: assets });
    const documents = new Map(assets.map((asset) => [asset.id, serializeInvitationMediaDocument(asset, EVENT_ID)]));
    const hydrated = hydrateInvitationMedia({ mediaIndex: index, mediaDocuments: documents }, EVENT_ID);
    assert.deepEqual(hydrated.inconsistencies, []);
    assert.deepEqual(hydrated.media.place.map(({ id, role, sortOrder }) => ({ id, role, sortOrder })), [
        { id: 'MED-LOCAL-001', role: 'place', sortOrder: 0 },
        { id: 'MED-LOCAL-002', role: 'place', sortOrder: 1 }
    ]);
});

test('reload loader reads config mediaIndex.placeIds and resolves place URLs', async () => {
    const asset = placeAsset('MED-LOCAL-003');
    const document = serializeInvitationMediaDocument(asset, EVENT_ID);
    const calls = { ids: [] };
    const service = new InvitationMediaService({ enabled: true, gateway: {
        readMediaIndex: async () => ({ schemaVersion: 5, mediaIndex: createInvitationMediaIndex({ place: [asset] }) }),
        readMediaDocuments: async (_eventId, ids) => { calls.ids = ids; return new Map([[asset.id, document]]); },
        resolveUrl: async (storagePath) => `https://cdn.test/${encodeURIComponent(storagePath)}`
    } });
    const result = await service.loadMedia(EVENT_ID);
    assert.deepEqual(calls.ids, ['MED-LOCAL-003']);
    assert.equal(result.media.place[0].id, 'MED-LOCAL-003');
    assert.match(result.media.place[0].downloadUrl, /^https:\/\/cdn\.test\//);
});

test('Aloha accommodation icons have explicit compact bounds and the editor uses the shared picker', async () => {
    const css = await readFile(new URL('../admin/invitations/preview/frame.css', import.meta.url), 'utf8');
    const editor = await readFile(new URL('../admin/invitations/editors/accommodation-editor.js', import.meta.url), 'utf8');
    assert.match(css, /\.aloha-place-card--hotel \.aloha-location-icon[^}]*width:\s*clamp\(1\.125rem/);
    assert.match(css, /\.aloha-place-card--hotel \.aloha-location-venue \.aloha-location-icon[^}]*width:\s*clamp\(1\.75rem/);
    assert.match(editor, /iconPickerField\('categoryIcon'/);
    assert.match(editor, /iconPickerField\('venueIcon'/);
});
