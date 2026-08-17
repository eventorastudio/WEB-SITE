import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc
} from 'firebase/firestore';

const PROJECT_ID = 'demo-eventorastudio-phase52';
const UID = 'UID-PHASE52';
const TOUCHED_PATHS = [
    'content.rsvp.enabled',
    'content.rsvp.title',
    'content.rsvp.message',
    'content.rsvp.buttonLabel',
    'content.rsvp.deadline',
    'content.rsvp.method',
    'content.rsvp.whatsapp.phone',
    'content.rsvp.whatsapp.message',
    'content.rsvp.guestPolicy',
    'content.rsvp.responses.acceptedLabel',
    'content.rsvp.responses.declinedLabel',
    'content.rsvp.responses.confirmationMessage'
];

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
        schemaVersion: 1,
        contentSchemaVersion: 3,
        eventId,
        enabled: true,
        title: 'Confirma tu asistencia',
        message: 'Nos encantará contar contigo.',
        buttonLabel: 'Confirmar',
        deadline: '2026-12-20',
        method: 'whatsapp',
        whatsapp: { phone: '+525512345678', message: 'Confirmo mi asistencia' },
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

async function seedRsvp(eventId, data = null) {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        await setDoc(rsvpRef(admin.firestore(), eventId), data ?? validDocument(eventId, 'seed-user'));
    });
}

for (const [role, claimName] of [
    ['CEO', 'role'],
    ['ADMINISTRADOR', 'userRole'],
    ['DISENADOR', 'role']
]) {
    test(`${role}: CREATE, READ y UPDATE RSVP pasan`, async () => {
        const eventId = `EVT-RSVP-${role}`;
        const actor = context(role, claimName);
        const reference = rsvpRef(actor.context.firestore(), eventId);
        await assertSucceeds(setDoc(reference, validDocument(eventId, actor.uid)));
        const snapshot = await assertSucceeds(getDoc(reference));
        assert.equal(snapshot.data().title, 'Confirma tu asistencia');
        await assertSucceeds(updateDoc(reference, {
            title: `Actualizado por ${role}`,
            updatedAt: serverTimestamp(),
            updatedBy: actor.uid
        }));
    });
}

test('CLIENTE no puede crear, leer ni actualizar RSVP', async () => {
    const eventId = 'EVT-RSVP-CLIENTE';
    const actor = context('CLIENTE');
    const reference = rsvpRef(actor.context.firestore(), eventId);
    await assertFails(setDoc(reference, validDocument(eventId, actor.uid)));
    await seedRsvp(eventId);
    await assertFails(getDoc(reference));
    await assertFails(updateDoc(reference, { title: 'No permitido' }));
});

test('usuario no autenticado no puede crear ni leer RSVP', async () => {
    const eventId = 'EVT-RSVP-NOAUTH';
    const db = testEnv.unauthenticatedContext().firestore();
    const reference = rsvpRef(db, eventId);
    await assertFails(setDoc(reference, validDocument(eventId, 'spoofed')));
    await seedRsvp(eventId);
    await assertFails(getDoc(reference));
});

test('rol desconocido no puede crear ni leer RSVP', async () => {
    const eventId = 'EVT-RSVP-UNKNOWN';
    const actor = context('EDITOR_RSVP');
    const reference = rsvpRef(actor.context.firestore(), eventId);
    await assertFails(setDoc(reference, validDocument(eventId, actor.uid)));
    await seedRsvp(eventId);
    await assertFails(getDoc(reference));
});

test('cross-event se deniega cuando eventId del documento no coincide con el path', async () => {
    const actor = context('CEO');
    await assertFails(setDoc(
        rsvpRef(actor.context.firestore(), 'EVT-CROSS-A'),
        validDocument('EVT-CROSS-B', actor.uid)
    ));
});

test('schemaVersion o contentSchemaVersion inválidos se deniegan', async () => {
    const actor = context('CEO');
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), 'EVT-BAD-SCHEMA-1'), validDocument('EVT-BAD-SCHEMA-1', actor.uid, { schemaVersion: 2 })));
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), 'EVT-BAD-SCHEMA-2'), validDocument('EVT-BAD-SCHEMA-2', actor.uid, { contentSchemaVersion: 2 })));
});

test('campo extra se deniega por whitelist exacta', async () => {
    const eventId = 'EVT-EXTRA-FIELD';
    const actor = context('CEO');
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { previewState: 'mobile' })));
});

test('method inválido se deniega', async () => {
    const eventId = 'EVT-BAD-METHOD';
    const actor = context('CEO');
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { method: 'email' })));
});

test('guestPolicy inválido se deniega', async () => {
    const eventId = 'EVT-BAD-POLICY';
    const actor = context('CEO');
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { guestPolicy: 'unlimited' })));
});

test('whatsapp object inválido o incompleto se deniega', async () => {
    const actor = context('CEO');
    for (const [eventId, whatsapp] of [
        ['EVT-BAD-WHATSAPP-1', { phone: '+525512345678' }],
        ['EVT-BAD-WHATSAPP-2', { phone: 'javascript:alert(1)', message: 'X' }],
        ['EVT-BAD-WHATSAPP-3', { phone: '+525512345678', message: 'X', token: 'secret' }]
    ]) {
        await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { whatsapp })));
    }
});

test('responses object inválido, incompleto o con extra se deniega', async () => {
    const actor = context('CEO');
    for (const [eventId, responses] of [
        ['EVT-BAD-RESPONSES-1', { acceptedLabel: 'Sí', declinedLabel: 'No' }],
        ['EVT-BAD-RESPONSES-2', { acceptedLabel: 'Sí', declinedLabel: 'No', confirmationMessage: 'Ok', html: '<b>ok</b>' }]
    ]) {
        await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { responses })));
    }
});

test('updatedBy distinto de request.auth.uid se deniega', async () => {
    const eventId = 'EVT-BAD-UPDATED-BY';
    const actor = context('CEO');
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, 'OTHER-UID')));
});

test('updatedAt aportado por cliente en vez de server timestamp se deniega', async () => {
    const eventId = 'EVT-BAD-UPDATED-AT';
    const actor = context('CEO');
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, {
        updatedAt: new Date('2020-01-01T00:00:00Z')
    })));
});

test('strings oversized se deniegan en campos raíz y anidados', async () => {
    const actor = context('CEO');
    const cases = [
        ['EVT-LONG-TITLE', { title: 'x'.repeat(121) }],
        ['EVT-LONG-MESSAGE', { message: 'x'.repeat(501) }],
        ['EVT-LONG-WHATSAPP', { whatsapp: { phone: '+525512345678', message: 'x'.repeat(1001) } }],
        ['EVT-LONG-RESPONSE', { responses: { acceptedLabel: 'x'.repeat(121), declinedLabel: 'No', confirmationMessage: 'Ok' } }]
    ];
    for (const [eventId, override] of cases) {
        await assertFails(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, override)));
    }
});

test('deadline con tipo o formato inválido se deniega', async () => {
    const actor = context('CEO');
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), 'EVT-BAD-DATE-1'), validDocument('EVT-BAD-DATE-1', actor.uid, { deadline: 20261220 })));
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), 'EVT-BAD-DATE-2'), validDocument('EVT-BAD-DATE-2', actor.uid, { deadline: '20/12/2026' })));
});

test('touchedPaths desconocidos o duplicados se deniegan', async () => {
    const actor = context('CEO');
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), 'EVT-BAD-TOUCHED-1'), validDocument('EVT-BAD-TOUCHED-1', actor.uid, { touchedPaths: ['content.identity.primaryName'] })));
    await assertFails(setDoc(rsvpRef(actor.context.firestore(), 'EVT-BAD-TOUCHED-2'), validDocument('EVT-BAD-TOUCHED-2', actor.uid, { touchedPaths: ['content.rsvp.title', 'content.rsvp.title'] })));
});

test('DELETE permanece denegado incluso para CEO; enabled:false es la política', async () => {
    const eventId = 'EVT-RSVP-NO-DELETE';
    await seedRsvp(eventId);
    const actor = context('CEO');
    await assertFails(deleteDoc(rsvpRef(actor.context.firestore(), eventId)));
    await assertSucceeds(setDoc(rsvpRef(actor.context.firestore(), eventId), validDocument(eventId, actor.uid, { enabled: false })));
});
