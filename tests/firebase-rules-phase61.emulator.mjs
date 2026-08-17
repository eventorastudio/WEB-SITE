import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc
} from 'firebase/firestore';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { serializeInvitationDraft } from '../admin/invitations/core/draft-persistence-schema.js';

const PROJECT_ID = 'demo-eventorastudio-phase61';
const UID = 'UID-PHASE61-RULES';
let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
});

after(async () => {
    await testEnv?.cleanup();
});

function actor(role, claimName = 'role') {
    const uid = `${UID}-${role}-${claimName}`;
    return { uid, context: testEnv.authenticatedContext(uid, { [claimName]: role }) };
}

function draftRef(db, eventId) {
    return doc(db, 'eventos', eventId, 'invitacion', 'draft');
}

function validDocument(eventId, uid) {
    const state = new InvitationBuilderState();
    state.initialize(eventId, {
        nombreEvento: 'María & Fernando',
        tipoEvento: 'Boda',
        fecha: '2027-11-15',
        hora: '19:00',
        ciudad: 'Saltillo',
        estado: 'Coahuila'
    });
    state.setPackage('premium');
    state.setTheme('champagne');
    state.toggleSection('welcome-story', true);
    state.addAccommodation({ name: 'Hotel Centro', reservationUrl: 'https://example.com/reservar' });
    return serializeInvitationDraft(state.getSnapshot().draft, {
        eventId,
        updatedAt: serverTimestamp(),
        updatedBy: uid
    });
}

async function seedDraft(eventId) {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        await setDoc(draftRef(admin.firestore(), eventId), validDocument(eventId, 'seed-user'));
    });
}

test('roles con invitations:edit pueden crear, leer y actualizar el draft', async () => {
    for (const [role, claimName] of [
        ['CEO', 'role'],
        ['ADMINISTRADOR', 'userRole'],
        ['DISENADOR', 'role']
    ]) {
        const eventId = `EVT-DRAFT-${role}`;
        const current = actor(role, claimName);
        const reference = draftRef(current.context.firestore(), eventId);
        await assertSucceeds(setDoc(reference, validDocument(eventId, current.uid)));
        const snapshot = await assertSucceeds(getDoc(reference));
        assert.equal(snapshot.data().theme, 'champagne');
        assert.equal(snapshot.data().accommodations[0].name, 'Hotel Centro');
        await assertSucceeds(updateDoc(reference, {
            theme: 'garden',
            updatedAt: serverTimestamp(),
            updatedBy: current.uid
        }));
    }
});

test('CLIENTE, rol interno sin invitations:edit y público no pueden leer ni escribir', async () => {
    for (const role of ['CLIENTE', 'VENTAS']) {
        const eventId = `EVT-DRAFT-DENY-${role}`;
        const current = actor(role);
        const reference = draftRef(current.context.firestore(), eventId);
        await assertFails(setDoc(reference, validDocument(eventId, current.uid)));
        await seedDraft(eventId);
        await assertFails(getDoc(reference));
    }

    const eventId = 'EVT-DRAFT-DENY-PUBLIC';
    const reference = draftRef(testEnv.unauthenticatedContext().firestore(), eventId);
    await assertFails(setDoc(reference, validDocument(eventId, 'spoofed-user')));
    await seedDraft(eventId);
    await assertFails(getDoc(reference));
});

test('Rules rechaza campos fuera de whitelist, incluido RSVP o media', async () => {
    const current = actor('CEO');
    const eventId = 'EVT-DRAFT-WHITELIST';
    const reference = draftRef(current.context.firestore(), eventId);
    const withMedia = { ...validDocument(eventId, current.uid), media: { gallery: [] } };
    const withRsvp = validDocument(eventId, current.uid);
    withRsvp.content = { ...withRsvp.content, rsvp: { enabled: true } };

    await assertFails(setDoc(reference, withMedia));
    await assertFails(setDoc(reference, withRsvp));
});
