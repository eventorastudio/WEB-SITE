import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';

const PROJECT_ID = 'demo-eventorastudio-phase53';
const UID_PREFIX = 'UID-PHASE53';
const FUTURE = new Date('2035-01-01T00:00:00.000Z');
const EXPIRED = new Date('2020-01-01T00:00:00.000Z');

let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
});

after(async () => {
    await testEnv?.cleanup();
});

function token(character) {
    return character.repeat(43);
}

function context(role, claimName = 'role') {
    const uid = `${UID_PREFIX}-${role}-${claimName}`;
    return { uid, context: testEnv.authenticatedContext(uid, { [claimName]: role }) };
}

function accessRef(db, eventId, accessToken) {
    return doc(db, 'eventos', eventId, 'rsvpAccess', accessToken);
}

function validAccessDocument(eventId, uid, overrides = {}) {
    return {
        schemaVersion: 1,
        eventId,
        guestId: 'INV-0001',
        displayName: 'Andrea Téllez',
        passLimit: 4,
        active: true,
        expiresAt: null,
        ...overrides
    };
}

function seededAccessDocument(eventId, overrides = {}) {
    return {
        schemaVersion: 1,
        eventId,
        guestId: 'INV-0001',
        displayName: 'Andrea Téllez',
        passLimit: 4,
        active: true,
        expiresAt: null,
        ...overrides
    };
}

async function seed(path, data) {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        await setDoc(doc(admin.firestore(), ...path), data);
    });
}

for (const [role, claimName, marker] of [
    ['CEO', 'role', 'A'],
    ['ADMINISTRADOR', 'userRole', 'B'],
    ['DISENADOR', 'role', 'C']
]) {
    test(`${role}: CREATE, READ y UPDATE de Access pasan`, async () => {
        const eventId = `EVT-ACCESS-${role}`;
        const actor = context(role, claimName);
        const reference = accessRef(actor.context.firestore(), eventId, token(marker));
        await assertSucceeds(setDoc(reference, validAccessDocument(eventId, actor.uid)));
        const snapshot = await assertSucceeds(getDoc(reference));
        assert.equal(snapshot.data().passLimit, 4);
        await assertSucceeds(updateDoc(reference, {
            displayName: `Nombre ${role}`,
            passLimit: 5
        }));
    });
}

test('CLIENTE con bearer válido puede GET exacto pero no administrar Access', async () => {
    const eventId = 'EVT-ACCESS-CLIENTE';
    const accessToken = token('D');
    const actor = context('CLIENTE');
    const reference = accessRef(actor.context.firestore(), eventId, accessToken);
    await assertFails(setDoc(reference, validAccessDocument(eventId, actor.uid)));
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId));
    await assertSucceeds(getDoc(reference));
    await assertFails(getDocs(collection(actor.context.firestore(), 'eventos', eventId, 'rsvpAccess')));
    await assertFails(updateDoc(reference, { active: false }));
    await assertFails(deleteDoc(reference));
});

test('rol desconocido con bearer válido puede GET exacto pero no administrar Access', async () => {
    const eventId = 'EVT-ACCESS-UNKNOWN';
    const accessToken = token('E');
    const actor = context('RSVP_EDITOR');
    const reference = accessRef(actor.context.firestore(), eventId, accessToken);
    await assertFails(setDoc(reference, validAccessDocument(eventId, actor.uid)));
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId));
    await assertSucceeds(getDoc(reference));
    await assertFails(updateDoc(reference, { active: false }));
});

test('GET público exacto pasa para Access activo sin expiración', async () => {
    const eventId = 'EVT-PUBLIC-ACTIVE';
    const accessToken = token('F');
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId));
    const snapshot = await assertSucceeds(getDoc(accessRef(testEnv.unauthenticatedContext().firestore(), eventId, accessToken)));
    assert.equal(snapshot.data().displayName, 'Andrea Téllez');
    assert.deepEqual(Object.keys(snapshot.data()).sort(), [
        'active', 'displayName', 'eventId', 'expiresAt', 'guestId', 'passLimit', 'schemaVersion'
    ]);
    assert.equal('createdBy' in snapshot.data(), false);
    assert.equal('updatedBy' in snapshot.data(), false);
});

test('GET público rechaza el shape anterior que exponía auditoría interna', async () => {
    const eventId = 'EVT-PUBLIC-LEGACY-AUDIT';
    const accessToken = token('R');
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], {
        ...seededAccessDocument(eventId),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        createdBy: 'UID-INTERNAL',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedBy: 'UID-INTERNAL'
    });
    await assertFails(getDoc(accessRef(testEnv.unauthenticatedContext().firestore(), eventId, accessToken)));
});

test('GET público exacto pasa antes de expiresAt', async () => {
    const eventId = 'EVT-PUBLIC-FUTURE';
    const accessToken = token('G');
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId, { expiresAt: FUTURE }));
    await assertSucceeds(getDoc(accessRef(testEnv.unauthenticatedContext().firestore(), eventId, accessToken)));
});

test('GET público deniega un Access revocado', async () => {
    const eventId = 'EVT-PUBLIC-REVOKED';
    const accessToken = token('H');
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId, { active: false }));
    await assertFails(getDoc(accessRef(testEnv.unauthenticatedContext().firestore(), eventId, accessToken)));
});

test('GET público deniega un Access expirado', async () => {
    const eventId = 'EVT-PUBLIC-EXPIRED';
    const accessToken = token('I');
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId, { expiresAt: EXPIRED }));
    await assertFails(getDoc(accessRef(testEnv.unauthenticatedContext().firestore(), eventId, accessToken)));
});

test('GET público deniega un documento cuyo eventId no coincide con el path', async () => {
    const eventId = 'EVT-PUBLIC-WRONG';
    const accessToken = token('J');
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument('EVT-OTHER'));
    await assertFails(getDoc(accessRef(testEnv.unauthenticatedContext().firestore(), eventId, accessToken)));
});

test('GET público deniega un document ID de token malformado', async () => {
    const eventId = 'EVT-PUBLIC-MALFORMED';
    const accessToken = 'short-token';
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId));
    await assertFails(getDoc(accessRef(testEnv.unauthenticatedContext().firestore(), eventId, accessToken)));
});

test('LIST y queries por guestId/active se deniegan anónimos y autenticados no-admin', async () => {
    const eventId = 'EVT-PUBLIC-LIST';
    const accessToken = token('K');
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId));
    const db = testEnv.unauthenticatedContext().firestore();
    const accessCollection = collection(db, 'eventos', eventId, 'rsvpAccess');
    await assertFails(getDocs(accessCollection));
    await assertFails(getDocs(query(accessCollection, where('guestId', '==', 'INV-0001'))));
    await assertFails(getDocs(query(accessCollection, where('active', '==', true))));
    const actor = context('CLIENTE');
    const authenticatedCollection = collection(actor.context.firestore(), 'eventos', eventId, 'rsvpAccess');
    await assertFails(getDocs(authenticatedCollection));
    await assertFails(getDocs(query(authenticatedCollection, where('guestId', '==', 'INV-0001'))));
    await assertFails(getDocs(query(authenticatedCollection, where('active', '==', true))));
});

test('CREATE, UPDATE y DELETE se deniegan anónimos y autenticados no-admin', async () => {
    const eventId = 'EVT-PUBLIC-WRITES';
    const accessToken = token('L');
    const db = testEnv.unauthenticatedContext().firestore();
    const reference = accessRef(db, eventId, accessToken);
    await assertFails(setDoc(reference, validAccessDocument(eventId, 'ANONYMOUS')));
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId));
    await assertFails(updateDoc(reference, { active: false }));
    await assertFails(deleteDoc(reference));
    const actor = context('CLIENTE');
    const authenticatedReference = accessRef(actor.context.firestore(), eventId, accessToken);
    await assertFails(setDoc(
        accessRef(actor.context.firestore(), eventId, token('Z')),
        validAccessDocument(eventId, actor.uid)
    ));
    await assertFails(updateDoc(authenticatedReference, { active: false }));
    await assertFails(deleteDoc(authenticatedReference));
});

test('GET y LIST públicos del documento completo de invitado siguen denegados', async () => {
    const eventId = 'EVT-PUBLIC-GUEST';
    await seed(['eventos', eventId, 'invitados', 'INV-0001'], { nombre: 'Dato privado', pases: 4 });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'eventos', eventId, 'invitados', 'INV-0001')));
    await assertFails(getDocs(collection(db, 'eventos', eventId, 'invitados')));
});

test('GET público de checkins sigue denegado', async () => {
    const eventId = 'EVT-PUBLIC-CHECKIN';
    await seed(['eventos', eventId, 'checkins', 'INV-0001-001'], { invitadoId: 'INV-0001' });
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'eventos', eventId, 'checkins', 'INV-0001-001')));
});

test('GET público de invitacion/rsvp sigue denegado', async () => {
    const eventId = 'EVT-PUBLIC-RSVP-CONFIG';
    await seed(['eventos', eventId, 'invitacion', 'rsvp'], { enabled: true });
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'eventos', eventId, 'invitacion', 'rsvp')));
});

test('Rules rechazan cross-event, auditoría/extra y passLimit fuera de rango', async () => {
    const actor = context('CEO');
    await assertFails(setDoc(
        accessRef(actor.context.firestore(), 'EVT-RULES-CROSS', token('M')),
        validAccessDocument('EVT-OTHER', actor.uid)
    ));
    await assertFails(setDoc(
        accessRef(actor.context.firestore(), 'EVT-RULES-EXTRA', token('N')),
        validAccessDocument('EVT-RULES-EXTRA', actor.uid, {
            createdBy: actor.uid,
            updatedBy: actor.uid
        })
    ));
    await assertFails(setDoc(
        accessRef(actor.context.firestore(), 'EVT-RULES-PASSES', token('O')),
        validAccessDocument('EVT-RULES-PASSES', actor.uid, { passLimit: 1000 })
    ));
});

test('query interna por guestId pasa para un editor autorizado', async () => {
    const eventId = 'EVT-INTERNAL-QUERY';
    const accessToken = token('P');
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId));
    const actor = context('DISENADOR');
    const snapshot = await assertSucceeds(getDocs(query(
        collection(actor.context.firestore(), 'eventos', eventId, 'rsvpAccess'),
        where('guestId', '==', 'INV-0001')
    )));
    assert.equal(snapshot.size, 1);
});

test('DELETE interno permanece denegado; la revocación es active:false', async () => {
    const eventId = 'EVT-INTERNAL-NO-DELETE';
    const accessToken = token('Q');
    await seed(['eventos', eventId, 'rsvpAccess', accessToken], seededAccessDocument(eventId));
    const actor = context('CEO');
    const reference = accessRef(actor.context.firestore(), eventId, accessToken);
    await assertFails(deleteDoc(reference));
    await assertSucceeds(updateDoc(reference, {
        active: false
    }));
});
