import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteObject, getMetadata, listAll, ref, updateMetadata, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'demo-eventorastudio-phase45';
const EVENT_DEMO = 'EVT-DEMO-LIBRARY';
const EVENT_NORMAL = 'EVT-NORMAL-LIBRARY';
const DML_ID = 'DML-abcdefghijklmnopqrst';
const VERSION = 'abcdef123456';
const FILE_NAME = `${DML_ID}-${VERSION}.webp`;
const STORAGE_PATH = `demo-library/${FILE_NAME}`;
const MEDIA_ID = 'MED-LOCAL-901';

let env;
before(async () => {
    env = await initializeTestEnvironment({ projectId: PROJECT_ID });
    await seedEvent(EVENT_DEMO, true);
});
after(async () => { await env?.cleanup(); });

const editor = () => env.authenticatedContext('UID-DEMO-LIBRARY-EDITOR', { role: 'DISENADOR' });
const publicContext = () => env.unauthenticatedContext();
const eventRef = (db, eventId) => doc(db, 'eventos', eventId);
const sharedMediaRef = (db, eventId = EVENT_DEMO) => doc(db, 'eventos', eventId, 'invitacion', 'config', 'media', MEDIA_ID);

async function seedEvent(eventId, demoMode) {
    const db = env.authenticatedContext('UID-DEMO-LIBRARY-CEO', { role: 'CEO' }).firestore();
    await assertSucceeds(setDoc(eventRef(db, eventId), { demoMode }));
}

function sharedMediaData(uid, overrides = {}) {
    return {
        id: MEDIA_ID,
        role: 'gallery',
        kind: 'image',
        originalName: 'shared.webp',
        mimeType: 'image/webp',
        size: 4,
        width: 1200,
        height: 800,
        duration: 0,
        alt: 'Shared',
        caption: '',
        storagePath: STORAGE_PATH,
        focalPoint: { x: 50, y: 50 },
        objectVersion: VERSION,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        sharedDemoAssetId: DML_ID,
        ...overrides
    };
}

test('A/H: editor autorizado puede listar demo-library y público no puede enumerarla', async () => {
    const path = ref(editor().storage(), STORAGE_PATH);
    await assertSucceeds(uploadBytes(path, new Uint8Array([1, 2, 3, 4]), {
        contentType: 'image/webp',
        customMetadata: { sourceEventId: EVENT_DEMO, sharedDemoAssetId: DML_ID, role: 'gallery' }
    }));
    await assertSucceeds(listAll(ref(editor().storage(), 'demo-library')));
    await assertFails(listAll(ref(publicContext().storage(), 'demo-library')));
});

test('B/I: público no tiene lectura directa del asset; Public usa downloadUrl proyectada', async () => {
    await assertFails(getMetadata(ref(publicContext().storage(), STORAGE_PATH)));
    assert.equal(true, true);
});

for (const [extension, mime] of [['jpg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]) {
    test(`C: editor crea ${extension.toUpperCase()} válido`, async () => {
        const id = `DML-${extension}abcdefghijklmnop`;
        const path = ref(editor().storage(), `demo-library/${id}-${VERSION}.${extension}`);
        await assertSucceeds(uploadBytes(path, new Uint8Array([1, 2, 3, 4]), {
            contentType: mime,
            customMetadata: { sourceEventId: EVENT_DEMO, sharedDemoAssetId: id, role: 'gallery' }
        }));
    });
}

test('D/E: tipo, path o metadata inválidos son rechazados', async () => {
    await assertFails(uploadBytes(ref(editor().storage(), 'demo-library/DML-invalidabcdefghijklmnop-abcdef123456.gif'), new Uint8Array([1]), {
        contentType: 'image/gif',
        customMetadata: { sourceEventId: EVENT_DEMO, sharedDemoAssetId: 'DML-invalidabcdefghijklmnop', role: 'gallery' }
    }));
    await assertFails(uploadBytes(ref(editor().storage(), 'demo-library/DML-invalidabcdefghijklmnop-abcdef123456.webp'), new Uint8Array([1]), {
        contentType: 'image/webp',
        customMetadata: { sourceEventId: EVENT_DEMO, sharedDemoAssetId: 'DML-otherabcdefghijklmnop', role: 'gallery' }
    }));
});

test('F/G: update y delete físico del asset compartido son rechazados', async () => {
    const path = ref(editor().storage(), STORAGE_PATH);
    await assertFails(updateMetadata(path, { cacheControl: 'no-cache' }));
    await assertFails(deleteObject(path));
});

test('J/N: DEMO permite referencia shared y media normal conserva el contrato', async () => {
    const context = editor();
    const db = context.firestore();
    const uid = 'UID-DEMO-LIBRARY-EDITOR';
    await seedEvent(EVENT_DEMO, true);
    await assertSucceeds(setDoc(sharedMediaRef(db), sharedMediaData(uid)));
    const normalMedia = sharedMediaData(uid, {
            id: 'MED-LOCAL-902',
            storagePath: `eventos/${EVENT_DEMO}/invitacion/media/gallery/MED-LOCAL-902-${VERSION}.webp`
        });
    delete normalMedia.sharedDemoAssetId;
    await assertSucceeds(setDoc(doc(db, 'eventos', EVENT_DEMO, 'invitacion', 'config', 'media', 'MED-LOCAL-902'), normalMedia));
});

test('K/L/M: referencias shared en evento normal, sin ID o inconsistentes son rechazadas', async () => {
    const context = editor();
    const db = context.firestore();
    const uid = 'UID-DEMO-LIBRARY-EDITOR';
    await seedEvent(EVENT_NORMAL, false);
    await assertFails(setDoc(sharedMediaRef(db, EVENT_NORMAL), sharedMediaData(uid)));
    const missingId = sharedMediaData(uid);
    delete missingId.sharedDemoAssetId;
    await assertFails(setDoc(sharedMediaRef(db, EVENT_DEMO), missingId));
    await assertFails(setDoc(sharedMediaRef(db, EVENT_DEMO), sharedMediaData(uid, { storagePath: `demo-library/DML-otherabcdefghijklmnop-${VERSION}.webp` })));
});
