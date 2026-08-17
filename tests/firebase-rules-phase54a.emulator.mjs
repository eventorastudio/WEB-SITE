import test, { after, before } from 'node:test';

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
    Timestamp,
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc
} from 'firebase/firestore';

const PROJECT_ID = 'demo-eventorastudio-phase54a';
const UID = 'UID-PHASE54A';
const TOUCHED_PATHS = [
    'content.rsvp.deadline',
    'content.rsvp.deadlineTime',
    'content.rsvp.deadlineTimeZone'
];
const CLOSES_AT = Timestamp.fromDate(new Date('2026-12-21T00:30:00.000Z'));

let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
});

after(async () => {
    await testEnv?.cleanup();
});

function context(role, claimName = 'role') {
    const uid = `${UID}-${role}-${claimName}`;
    return { uid, context: testEnv.authenticatedContext(uid, { [claimName]: role }) };
}

function rsvpRef(db, eventId) {
    return doc(db, 'eventos', eventId, 'invitacion', 'rsvp');
}

function validDocument(eventId, uid, overrides = {}) {
    return {
        schemaVersion: 2,
        contentSchemaVersion: 4,
        eventId,
        enabled: true,
        title: 'Confirma tu asistencia',
        message: 'Nos encantará contar contigo.',
        buttonLabel: 'Confirmar',
        deadline: '2026-12-20',
        deadlineTime: '18:30',
        deadlineTimeZone: 'America/Mexico_City',
        responseClosesAt: CLOSES_AT,
        method: 'internal',
        whatsapp: { phone: '', message: '' },
        guestPolicy: 'assigned-only',
        responses: {
            acceptedLabel: 'Sí asistiré',
            declinedLabel: 'No podré asistir',
            confirmationMessage: 'Gracias por responder.'
        },
        touchedPaths: TOUCHED_PATHS,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        ...overrides
    };
}

async function seed(eventId, document = null) {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        await setDoc(rsvpRef(admin.firestore(), eventId), document ?? validDocument(eventId, 'seed-user'));
    });
}

for (const [role, claimName] of [
    ['CEO', 'role'],
    ['ADMINISTRADOR', 'userRole'],
    ['DISENADOR', 'role']
]) {
    test(`${role}: schema v2 completo permite CREATE, GET y UPDATE`, async () => {
        const eventId = `EVT-54A-${role}`;
        const actor = context(role, claimName);
        const reference = rsvpRef(actor.context.firestore(), eventId);
        await assertSucceeds(setDoc(reference, validDocument(eventId, actor.uid)));
        await assertSucceeds(getDoc(reference));
        await assertSucceeds(updateDoc(reference, {
            deadlineTime: '19:00',
            responseClosesAt: Timestamp.fromDate(new Date('2026-12-21T01:00:00.000Z')),
            updatedAt: serverTimestamp(),
            updatedBy: actor.uid
        }));
    });
}

test('schemaVersion 1 se deniega para writes nuevos', async () => {
    const actor = context('CEO');
    const eventId = 'EVT-54A-SCHEMA1';
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { schemaVersion: 1 })));
});

test('deadline, hora y zona vacíos con responseClosesAt null pasan', async () => {
    const actor = context('CEO');
    const eventId = 'EVT-54A-NO-DEADLINE';
    await assertSucceeds(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, {
        deadline: '',
        deadlineTime: '',
        deadlineTimeZone: '',
        responseClosesAt: null
    })));
});

test('deadline vacío con responseClosesAt definido se deniega', async () => {
    const actor = context('CEO');
    const eventId = 'EVT-54A-EMPTY-WITH-TIMESTAMP';
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, {
        deadline: '',
        deadlineTime: '',
        deadlineTimeZone: ''
    })));
});

test('deadline presente sin hora se deniega', async () => {
    const actor = context('CEO');
    const eventId = 'EVT-54A-MISSING-TIME';
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { deadlineTime: '' })));
});

test('deadline presente sin zona se deniega', async () => {
    const actor = context('CEO');
    const eventId = 'EVT-54A-MISSING-ZONE';
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { deadlineTimeZone: '' })));
});

test('deadline completo con responseClosesAt null se deniega', async () => {
    const actor = context('CEO');
    const eventId = 'EVT-54A-MISSING-TIMESTAMP';
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { responseClosesAt: null })));
});

test('formato de hora inválido se deniega', async () => {
    const actor = context('CEO');
    for (const [eventId, deadlineTime] of [['EVT-54A-2400', '24:00'], ['EVT-54A-SHORT-TIME', '9:30']]) {
        await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { deadlineTime })));
    }
});

test('zona fija o campo extra se deniegan', async () => {
    const actor = context('CEO');
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), 'EVT-54A-FIXED-ZONE'), validDocument('EVT-54A-FIXED-ZONE', actor.uid, {
        deadlineTimeZone: 'Etc/GMT+6'
    })));
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), 'EVT-54A-EXTRA'), validDocument('EVT-54A-EXTRA', actor.uid, {
        browserTimeZone: 'America/Monterrey'
    })));
});

test('CLIENTE no puede crear, leer ni actualizar RSVP privado v2', async () => {
    const actor = context('CLIENTE');
    const eventId = 'EVT-54A-CLIENTE';
    const reference = rsvpRef(actor.context.firestore(), eventId);
    await assertFails(setDoc(reference, validDocument(eventId, actor.uid)));
    await seed(eventId);
    await assertFails(getDoc(reference));
    await assertFails(updateDoc(reference, { deadlineTime: '20:00' }));
});

test('anónimo no puede crear ni leer RSVP privado v2', async () => {
    const eventId = 'EVT-54A-ANON';
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(rsvpRef(db, eventId), validDocument(eventId, 'spoofed')));
    await seed(eventId);
    await assertFails(getDoc(rsvpRef(db, eventId)));
});

test('DELETE continúa denegado incluso para CEO', async () => {
    const eventId = 'EVT-54A-NO-DELETE';
    await seed(eventId);
    await assertFails(deleteDoc(rsvpRef(context('CEO').context.firestore(), eventId)));
});
