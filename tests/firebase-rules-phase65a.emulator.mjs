import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc
} from 'firebase/firestore';

const PROJECT_ID = 'demo-eventorastudio-phase65a';
const EVENT_ID = 'EVT-PHASE65A';
const PUBLIC_KEY = 'a'.repeat(48);
let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
});

after(async () => {
    await testEnv?.cleanup();
});

function projectionRef(db) {
    return doc(db, 'eventos', EVENT_ID, 'invitacionPublic', PUBLIC_KEY);
}

test('editor interno puede obtener una proyeccion inexistente', async () => {
    for (const role of ['CEO', 'ADMINISTRADOR', 'ADMIN', 'DISENADOR']) {
        const db = testEnv.authenticatedContext(`UID-PHASE65A-${role}`, { role }).firestore();
        const snapshot = await assertSucceeds(getDoc(projectionRef(db)));
        assert.equal(snapshot.exists(), false);
    }
});

test('publico mantiene LIST y escrituras denegadas', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const projections = collection(db, 'eventos', EVENT_ID, 'invitacionPublic');

    await assertFails(getDocs(projections));
    await assertFails(setDoc(projectionRef(db), {
        eventId: EVENT_ID,
        publicKey: PUBLIC_KEY
    }));
});
