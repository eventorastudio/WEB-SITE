import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';

const PROJECT_ID = 'demo-eventorastudio-phase137';
const EVENT_ID = 'EVT-MEDIA-INDEX';
const UID = 'UID-MEDIA-INDEX';
let env;

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT_ID }); });
after(async () => { await env?.cleanup(); });

function editor() { return env.authenticatedContext(UID, { role: 'ADMIN' }); }
function guest() { return env.authenticatedContext('UID-GUEST', { role: 'VENTAS' }); }
function configRef(db) { return doc(db, `eventos/${EVENT_ID}/invitacion/config`); }
function mediaRef(db, id) { return doc(db, `eventos/${EVENT_ID}/invitacion/config/media/${id}`); }
function mediaIndex(overrides = {}) {
    return {
        schemaVersion: 1,
        coverId: null,
        galleryIds: [],
        placeIds: [],
        dressCodeId: null,
        videoId: null,
        posterId: null,
        audioId: null,
        ...overrides
    };
}
function config(index = mediaIndex(), uid = UID) {
    return { schemaVersion: 5, mediaIndex: index, updatedAt: serverTimestamp(), updatedBy: uid };
}

test('config canónico + coverId nuevo pasa con batch.set completo', async () => {
    const db = editor().firestore();
    await assertSucceeds(setDoc(configRef(db), config()));
    const batch = writeBatch(db);
    batch.set(configRef(db), config(mediaIndex({ coverId: 'MED-LOCAL-201' })));
    await assertSucceeds(batch.commit());
});

test('índice realista de EVT-0001 + cover inexistente antes del batch pasa', async () => {
    const db = editor().firestore();
    const newMedia = mediaRef(db, 'MED-LOCAL-209');
    assert.equal((await getDoc(newMedia)).exists(), false);
    const batch = writeBatch(db);
    batch.set(newMedia, {
        id: 'MED-LOCAL-209', role: 'cover', kind: 'image', originalName: 'cover.webp', mimeType: 'image/webp',
        size: 1000, width: 1200, height: 800, duration: 0, alt: '', caption: '',
        storagePath: 'eventos/EVT-MEDIA-INDEX/invitacion/media/cover/MED-LOCAL-209-abcdef123456.webp',
        focalPoint: { x: 50, y: 50 }, objectVersion: 'abcdef123456',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: UID
    });
    batch.set(configRef(db), config(mediaIndex({
        coverId: 'MED-LOCAL-209', galleryIds: ['MED-LOCAL-003', 'MED-LOCAL-005', 'MED-LOCAL-004'],
        dressCodeId: 'MED-LOCAL-001', videoId: 'MED-LOCAL-006'
    })));
    await assertSucceeds(batch.commit());
});

test('mediaIndex duplicado entre cover y dressCode es rechazado', async () => {
    await assertFails(setDoc(configRef(editor().firestore()), config(mediaIndex({ coverId: 'MED-LOCAL-001', dressCodeId: 'MED-LOCAL-001' }))));
});

test('config canónico + placeId nuevo pasa', async () => {
    const db = editor().firestore();
    await assertSucceeds(setDoc(configRef(db), config()));
    const batch = writeBatch(db);
    batch.set(configRef(db), config(mediaIndex({ placeIds: ['MED-LOCAL-202'] })));
    await assertSucceeds(batch.commit());
});

test('gallery swap conserva orden y pasa', async () => {
    const db = editor().firestore();
    await assertSucceeds(setDoc(configRef(db), config(mediaIndex({ galleryIds: ['MED-LOCAL-203', 'MED-LOCAL-204'] }))));
    const batch = writeBatch(db);
    batch.set(configRef(db), config(mediaIndex({ galleryIds: ['MED-LOCAL-205', 'MED-LOCAL-204'] })));
    await assertSucceeds(batch.commit());
});

test('claims inválidos son rechazados', async () => {
    await assertFails(setDoc(configRef(guest().firestore()), config(mediaIndex({ coverId: 'MED-LOCAL-206' }), 'UID-GUEST')));
});

test('mediaIndex con key extra es rechazado', async () => {
    const db = editor().firestore();
    const invalidIndex = { ...mediaIndex({ coverId: 'MED-LOCAL-207' }), unexpected: true };
    await assertFails(setDoc(configRef(db), config(invalidIndex)));
});

test('cambio fuera de mediaIndex es rechazado', async () => {
    const db = editor().firestore();
    await assertSucceeds(setDoc(configRef(db), config()));
    await assertFails(setDoc(configRef(db), { ...config(), schemaVersion: 99 }));
});
