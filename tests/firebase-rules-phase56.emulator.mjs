import test, { after, before } from 'node:test';

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
    Timestamp,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc
} from 'firebase/firestore';

const PROJECT_ID = 'demo-eventorastudio-phase56';
const EVENT_ID = 'EVT-56-RULES';
const GUEST_ID = 'INV-0001';
const TIME = Timestamp.fromDate(new Date('2026-08-17T15:00:00.000Z'));

let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        const db = admin.firestore();
        await setDoc(doc(db, 'eventos', EVENT_ID, 'rsvpState', GUEST_ID), {
            schemaVersion: 1,
            eventId: EVENT_ID,
            guestId: GUEST_ID,
            status: 'accepted',
            passesConfirmed: 2,
            respondedAt: TIME,
            syncedAt: TIME
        });
        await setDoc(doc(db, 'eventos', EVENT_ID, 'rsvpConflicts', 'RSVP-CONFLICT-TEST'), {
            eventId: EVENT_ID,
            guestId: GUEST_ID,
            conflictType: 'same-responded-at',
            respondedAt: TIME,
            canonical: { status: 'accepted', passesConfirmed: 2 },
            candidate: { status: 'declined', passesConfirmed: 0 },
            createdAt: TIME
        });
    });
});

after(async () => {
    await testEnv?.cleanup();
});

test('público no lee state/conflicts; roles internos sólo los leen', async () => {
    const statePath = ['eventos', EVENT_ID, 'rsvpState', GUEST_ID];
    const conflictPath = ['eventos', EVENT_ID, 'rsvpConflicts', 'RSVP-CONFLICT-TEST'];
    for (const db of [
        testEnv.unauthenticatedContext().firestore(),
        testEnv.authenticatedContext('UID-CLIENTE', { role: 'CLIENTE' }).firestore()
    ]) {
        await assertFails(getDoc(doc(db, ...statePath)));
        await assertFails(getDoc(doc(db, ...conflictPath)));
        await assertFails(getDocs(collection(db, 'eventos', EVENT_ID, 'rsvpState')));
        await assertFails(getDocs(collection(db, 'eventos', EVENT_ID, 'rsvpConflicts')));
    }

    const internal = testEnv.authenticatedContext('UID-VENTAS', { role: 'VENTAS' }).firestore();
    await assertSucceeds(getDoc(doc(internal, ...statePath)));
    await assertSucceeds(getDoc(doc(internal, ...conflictPath)));
    await assertSucceeds(getDocs(collection(internal, 'eventos', EVENT_ID, 'rsvpState')));
    await assertSucceeds(getDocs(collection(internal, 'eventos', EVENT_ID, 'rsvpConflicts')));
    await assertFails(setDoc(doc(internal, ...statePath), { altered: true }));
    await assertFails(setDoc(doc(internal, ...conflictPath), { altered: true }));
});
