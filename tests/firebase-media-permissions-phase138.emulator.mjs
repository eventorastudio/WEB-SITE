import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'demo-eventorastudio-phase138';
const UID = 'UID-PHASE138';
let env;

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT_ID }); });
after(async () => { await env?.cleanup(); });

function context(uid, claims) { return env.authenticatedContext(uid, claims); }
function editor() { return env.authenticatedContext(UID, { role: 'ADMIN' }); }
function noClaims() { return env.authenticatedContext('UID-NO-CLAIMS', {}); }
function unauthenticated() { return env.unauthenticatedContext(); }
function configRef(db, eventId) { return doc(db, `eventos/${eventId}/invitacion/config`); }
function mediaRef(db, eventId, mediaId) { return doc(db, `eventos/${eventId}/invitacion/config/media/${mediaId}`); }
function index(overrides = {}) {
    return { schemaVersion: 1, coverId: null, galleryIds: [], placeIds: [], dressCodeId: null, videoId: null, posterId: null, audioId: null, ...overrides };
}
function config(mediaIndex, uid = UID) { return { schemaVersion: 5, mediaIndex, updatedAt: serverTimestamp(), updatedBy: uid }; }
function media(eventId, mediaId, role = 'cover', uid = UID) {
    const version = 'abcdef123456';
    return {
        id: mediaId, role, kind: 'image', originalName: `${role}.webp`, mimeType: 'image/webp', size: 1000,
        width: 1200, height: 800, duration: 0, alt: '', caption: '',
        storagePath: `eventos/${eventId}/invitacion/media/${role}/${mediaId}-${version}.webp`,
        focalPoint: { x: 50, y: 50 }, objectVersion: version,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: uid
    };
}
function storagePath(eventId, role, mediaId) { return `eventos/${eventId}/invitacion/media/${role}/${mediaId}-abcdef123456.webp`; }
function storageMeta(eventId, role, mediaId, contentType = 'image/webp') { return { contentType, customMetadata: { eventId, role, mediaId } }; }

test('A/B/C: media create, config update y batch create+swap pasan', async () => {
    const db = editor().firestore();
    await assertSucceeds(setDoc(mediaRef(db, 'EVT-A', 'MED-LOCAL-301'), media('EVT-A', 'MED-LOCAL-301')));
    await assertSucceeds(setDoc(configRef(db, 'EVT-B'), config(index())));
    const batch = writeBatch(db);
    batch.set(mediaRef(db, 'EVT-C', 'MED-LOCAL-302'), media('EVT-C', 'MED-LOCAL-302'));
    batch.set(configRef(db, 'EVT-C'), config(index({ coverId: 'MED-LOCAL-302' })));
    await assertSucceeds(batch.commit());
    const update = writeBatch(db);
    update.set(configRef(db, 'EVT-B'), config(index({ coverId: 'MED-LOCAL-303' })));
    await assertSucceeds(update.commit());
});

test('D: media document existente puede eliminarse con claim editor', async () => {
    const db = editor().firestore();
    await assertSucceeds(setDoc(mediaRef(db, 'EVT-D', 'MED-LOCAL-304'), media('EVT-D', 'MED-LOCAL-304')));
    await assertSucceeds(deleteDoc(mediaRef(db, 'EVT-D', 'MED-LOCAL-304')));
});

test('E/F/G/H: cover, placeIds y replacement mantienen el índice único', async () => {
    const db = editor().firestore();
    await assertSucceeds(setDoc(configRef(db, 'EVT-E'), config(index({ coverId: 'MED-LOCAL-305' }))));
    await assertSucceeds(setDoc(configRef(db, 'EVT-F'), config(index({ placeIds: ['MED-LOCAL-306'] }))));
    await assertSucceeds(setDoc(configRef(db, 'EVT-G'), config(index({ placeIds: [] }))));
    await assertSucceeds(setDoc(configRef(db, 'EVT-H'), config(index({ coverId: 'MED-LOCAL-307' }))));
    await assertSucceeds(setDoc(configRef(db, 'EVT-H'), config(index({ coverId: 'MED-LOCAL-308' }))));
});

test('I/J: usuario sin auth o sin claims es rechazado', async () => {
    await assertFails(setDoc(configRef(unauthenticated().firestore(), 'EVT-I'), config(index(), '')));
    await assertFails(setDoc(configRef(noClaims().firestore(), 'EVT-J'), config(index(), 'UID-NO-CLAIMS')));
});

test('K/L: claims reales equivalentes y claims esperados pasan', async () => {
    const roleClaim = context('UID-ROLE', { role: 'ADMIN' });
    const userRoleClaim = context('UID-USER-ROLE', { userRole: 'ADMIN' });
    await assertSucceeds(setDoc(configRef(roleClaim.firestore(), 'EVT-K'), config(index(), 'UID-ROLE')));
    await assertSucceeds(setDoc(configRef(userRoleClaim.firestore(), 'EVT-L'), config(index(), 'UID-USER-ROLE')));
});

test('Storage: cover/place WebP válido pasa y role/MIME inválidos se rechazan', async () => {
    const contextEditor = editor();
    await assertSucceeds(uploadBytes(ref(contextEditor.storage(), storagePath('EVT-S-COVER', 'cover', 'MED-LOCAL-309')), new Uint8Array([1]), storageMeta('EVT-S-COVER', 'cover', 'MED-LOCAL-309')));
    await assertSucceeds(uploadBytes(ref(contextEditor.storage(), storagePath('EVT-S-PLACE', 'place', 'MED-LOCAL-310')), new Uint8Array([1]), storageMeta('EVT-S-PLACE', 'place', 'MED-LOCAL-310')));
    await assertFails(uploadBytes(ref(contextEditor.storage(), storagePath('EVT-S-ROLE', 'unknown', 'MED-LOCAL-311')), new Uint8Array([1]), storageMeta('EVT-S-ROLE', 'unknown', 'MED-LOCAL-311')));
    await assertFails(uploadBytes(ref(contextEditor.storage(), storagePath('EVT-S-MIME', 'cover', 'MED-LOCAL-312')), new Uint8Array([1]), storageMeta('EVT-S-MIME', 'cover', 'MED-LOCAL-312', 'image/png')));
    await assertSucceeds(deleteObject(ref(contextEditor.storage(), storagePath('EVT-S-COVER', 'cover', 'MED-LOCAL-309'))));
    await assertSucceeds(deleteObject(ref(contextEditor.storage(), storagePath('EVT-S-PLACE', 'place', 'MED-LOCAL-310'))));
});
