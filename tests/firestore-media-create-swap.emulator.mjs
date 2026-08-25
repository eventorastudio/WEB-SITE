import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { createMediaAsset } from '../admin/invitations/core/media-schema.js';
import { buildInvitationMediaStoragePath, createInvitationMediaIndex, serializeInvitationMediaDocument } from '../admin/invitations/services/invitation-media-service.js';

const PROJECT_ID = 'demo-eventorastudio-phase136';
const EVENT_ID = 'EVT-MEDIA-SWAP';
const UID = 'UID-MEDIA-SWAP';
let env;

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT_ID }); });
after(async () => { await env?.cleanup(); });

function editor() { return env.authenticatedContext(UID, { role: 'ADMIN' }); }
function guest() { return env.authenticatedContext('UID-GUEST', { role: 'VENTAS' }); }
function mediaRef(db, id) { return doc(db, `eventos/${EVENT_ID}/invitacion/config/media/${id}`); }
function configRef(db) { return doc(db, `eventos/${EVENT_ID}/invitacion/config`); }
function media(id, role = 'cover') {
    const asset = createMediaAsset(id, {
        role, kind: 'image', originalName: `${role}.webp`, mimeType: 'image/webp', size: 1000,
        width: 1200, height: 800, duration: 0, alt: role, caption: '',
        storagePath: buildInvitationMediaStoragePath({ eventId: EVENT_ID, assetId: id, role, mimeType: 'image/webp', objectVersion: 'abcdef123456' }),
        focalPoint: { x: 50, y: 50 }
    });
    return { ...serializeInvitationMediaDocument(asset, EVENT_ID), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: UID };
}
function config(index) {
    return { schemaVersion: 5, mediaIndex: index, updatedAt: serverTimestamp(), updatedBy: UID };
}
function index({ coverId = null, galleryIds = [], placeIds = [] } = {}) {
    return { schemaVersion: 1, coverId, galleryIds, placeIds, dressCodeId: null, videoId: null, posterId: null, audioId: null };
}

test('create nuevo media document cover pasa', async () => {
    await assertSucceeds(setDoc(mediaRef(editor().firestore(), 'MED-LOCAL-101'), media('MED-LOCAL-101')));
});

test('actualizar mediaIndex coverId pasa', async () => {
    const db = editor().firestore();
    await assertSucceeds(setDoc(configRef(db), config(index({ coverId: 'MED-LOCAL-101' }))));
    await assertSucceeds(updateDoc(configRef(db), { mediaIndex: index({ coverId: 'MED-LOCAL-101' }), updatedAt: serverTimestamp(), updatedBy: UID }));
});

test('create + swap coverId en batch pasa sin actualizar media viejo', async () => {
    const db = editor().firestore();
    const batch = writeBatch(db);
    batch.set(mediaRef(db, 'MED-LOCAL-102'), media('MED-LOCAL-102'));
    batch.set(configRef(db), config(index({ coverId: 'MED-LOCAL-102' })));
    await assertSucceeds(batch.commit());
});

test('create nuevo place y placeIds pasa', async () => {
    const db = editor().firestore();
    const batch = writeBatch(db);
    batch.set(mediaRef(db, 'MED-LOCAL-103'), media('MED-LOCAL-103', 'place'));
    batch.set(configRef(db), config(index({ placeIds: ['MED-LOCAL-103'] })));
    await assertSucceeds(batch.commit());
});

test('agregar placeId al índice existente pasa', async () => {
    const db = editor().firestore();
    await assertSucceeds(setDoc(configRef(db), config(index({ placeIds: [] }))));
    await assertSucceeds(updateDoc(configRef(db), { mediaIndex: index({ placeIds: ['MED-LOCAL-108'] }), updatedAt: serverTimestamp(), updatedBy: UID }));
});

test('replace gallery item con ID nuevo pasa sin tocar el documento viejo', async () => {
    const db = editor().firestore();
    await assertSucceeds(setDoc(mediaRef(db, 'MED-LOCAL-106'), media('MED-LOCAL-106', 'gallery')));
    await assertSucceeds(setDoc(configRef(db), config(index({ galleryIds: ['MED-LOCAL-106'] }))));
    const batch = writeBatch(db);
    batch.set(mediaRef(db, 'MED-LOCAL-107'), media('MED-LOCAL-107', 'gallery'));
    batch.update(configRef(db), { mediaIndex: index({ galleryIds: ['MED-LOCAL-107'] }), updatedAt: serverTimestamp(), updatedBy: UID });
    await assertSucceeds(batch.commit());
});

test('claims insuficientes son rechazados', async () => {
    await assertFails(setDoc(mediaRef(guest().firestore(), 'MED-LOCAL-104'), media('MED-LOCAL-104')));
});

test('payload media con campo extra es rechazado', async () => {
    await assertFails(setDoc(mediaRef(editor().firestore(), 'MED-LOCAL-105'), { ...media('MED-LOCAL-105'), unexpected: true }));
});
