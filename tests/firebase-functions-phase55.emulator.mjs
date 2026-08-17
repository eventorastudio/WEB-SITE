import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

import { calculateEventStats } from '../functions/generated/event-stats.js';
import { reconcileCurrentRsvpResponse } from '../functions/src/rsvp-reconciliation.js';

const PROJECT_ID = 'demo-eventorastudio-phase55';
const GUEST_ID = 'INV-0001';
const TOKEN = 'T'.repeat(43);
const ROTATED_TOKEN = 'R'.repeat(43);
const BASE_TIME = Timestamp.fromDate(new Date('2026-08-17T12:00:00.000Z'));

let app;
let db;

before(() => {
    app = initializeApp({ projectId: PROJECT_ID }, 'phase55-tests');
    db = getFirestore(app);
});

after(async () => {
    await deleteApp(app);
});

function response(eventId, overrides = {}) {
    return {
        schemaVersion: 1,
        eventId,
        guestId: GUEST_ID,
        status: 'accepted',
        passesConfirmed: 4,
        respondedAt: BASE_TIME,
        ...overrides
    };
}

function guest(overrides = {}) {
    return {
        codigoInvitado: GUEST_ID,
        nombre: 'Andrea Tellez',
        correo: 'andrea@example.com',
        telefono: '+525512345678',
        pases: 4,
        pasesUtilizados: 0,
        pasesDisponibles: 4,
        checkinSecuencia: 0,
        mesa: 12,
        estado: 'pendiente',
        confirmado: false,
        llegadaRegistrada: false,
        horaLlegada: null,
        tipoAcceso: 'ambos',
        qrToken: 'QR_PRIVATE_VALUE_1234567890',
        qrActivo: true,
        notas: 'Dato interno',
        fechaCreacion: BASE_TIME,
        fechaActualizacion: BASE_TIME,
        ...overrides
    };
}

function eventDocument(guestDocument) {
    return {
        nombre: 'Evento Fase 5.5',
        statsRevision: 1,
        statsSchemaVersion: 1,
        statsUpdatedAt: BASE_TIME,
        estadisticas: calculateEventStats([{ id: GUEST_ID, ...guestDocument }]),
        fechaActualizacion: BASE_TIME
    };
}

function directReferences(caseId, token = TOKEN) {
    const event = db.collection('phase55Events').doc(caseId);
    return {
        event,
        guest: event.collection('guests').doc(GUEST_ID),
        state: event.collection('states').doc(GUEST_ID),
        response: event.collection('responses').doc(token)
    };
}

async function seedDirect(caseId, responseDocument, guestDocument = guest()) {
    const refs = directReferences(caseId);
    const batch = db.batch();
    batch.set(refs.event, eventDocument(guestDocument));
    batch.set(refs.guest, guestDocument);
    batch.set(refs.response, responseDocument);
    await batch.commit();
    return refs;
}

async function reconcile(eventId, token, references, options = {}) {
    return reconcileCurrentRsvpResponse({
        db,
        eventId,
        token,
        references,
        serverTimestampFactory: () => FieldValue.serverTimestamp(),
        ...options
    });
}

function plusSeconds(seconds) {
    return new Timestamp(BASE_TIME.seconds + seconds, BASE_TIME.nanoseconds);
}

async function waitForDocument(reference, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snapshot = await reference.get();
        if (snapshot.exists) return snapshot;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`phase55/document-timeout:${reference.path}`);
}

test('1. trigger real accepted sincroniza estado y confirmado del guest', async () => {
    const eventId = 'EVT-55-TRIGGER-ACCEPTED';
    const eventRef = db.collection('eventos').doc(eventId);
    const guestRef = eventRef.collection('invitados').doc(GUEST_ID);
    const stateRef = eventRef.collection('rsvpState').doc(GUEST_ID);
    const originalGuest = guest();
    const batch = db.batch();
    batch.set(eventRef, eventDocument(originalGuest));
    batch.set(guestRef, originalGuest);
    await batch.commit();
    await eventRef.collection('rsvpResponses').doc(TOKEN).set(response(eventId));

    const state = (await waitForDocument(stateRef)).data();
    const syncedGuest = (await guestRef.get()).data();
    const syncedEvent = (await eventRef.get()).data();
    assert.deepEqual(Object.keys(state).sort(), [
        'eventId', 'guestId', 'passesConfirmed', 'respondedAt', 'schemaVersion', 'status', 'syncedAt'
    ]);
    assert.equal(state.status, 'accepted');
    assert.equal(syncedGuest.estado, 'confirmado');
    assert.equal(syncedGuest.confirmado, true);
    assert.equal(syncedEvent.estadisticas.pasesConfirmados, originalGuest.pases);
    assert.equal(syncedEvent.estadisticas.pasesUtilizados, 0);
});

test('2. declined sincroniza no_asistira y confirmado false', async () => {
    const eventId = 'EVT-55-DECLINED';
    const refs = await seedDirect('declined', response(eventId, {
        status: 'declined', passesConfirmed: 0
    }));
    const outcome = await reconcile(eventId, TOKEN, refs);
    const syncedGuest = (await refs.guest.get()).data();
    assert.equal(outcome.status, 'applied');
    assert.equal(syncedGuest.estado, 'no_asistira');
    assert.equal(syncedGuest.confirmado, false);
});

test('3. passesConfirmed exacto vive en rsvpState y no se inventa en guest', async () => {
    const eventId = 'EVT-55-PASSES';
    const refs = await seedDirect('passes', response(eventId, { passesConfirmed: 2 }));
    await reconcile(eventId, TOKEN, refs);
    const state = (await refs.state.get()).data();
    const syncedGuest = (await refs.guest.get()).data();
    assert.equal(state.passesConfirmed, 2);
    assert.equal(syncedGuest.pases, 4);
    assert.equal('pasesConfirmados' in syncedGuest, false);
});

test('4. retry identico es no-op y conserva syncedAt, guest y revision', async () => {
    const eventId = 'EVT-55-RETRY';
    const refs = await seedDirect('retry', response(eventId));
    await reconcile(eventId, TOKEN, refs);
    const beforeState = (await refs.state.get()).data();
    const beforeGuest = (await refs.guest.get()).data();
    const beforeEvent = (await refs.event.get()).data();
    const outcome = await reconcile(eventId, TOKEN, refs);
    const afterState = (await refs.state.get()).data();
    const afterGuest = (await refs.guest.get()).data();
    const afterEvent = (await refs.event.get()).data();
    assert.equal(outcome.status, 'unchanged');
    assert.equal(afterState.syncedAt.isEqual(beforeState.syncedAt), true);
    assert.deepEqual(afterGuest, beforeGuest);
    assert.equal(afterEvent.statsRevision, beforeEvent.statsRevision);
});

test('5. response antiguo se ignora sin revertir state o guest', async () => {
    const eventId = 'EVT-55-OLDER';
    const refs = await seedDirect('older', response(eventId, { respondedAt: plusSeconds(10) }));
    await reconcile(eventId, TOKEN, refs);
    await refs.response.set(response(eventId, {
        status: 'declined', passesConfirmed: 0, respondedAt: BASE_TIME
    }));
    const outcome = await reconcile(eventId, TOKEN, refs);
    assert.equal(outcome.status, 'ignored');
    assert.equal((await refs.state.get()).data().status, 'accepted');
    assert.equal((await refs.guest.get()).data().estado, 'confirmado');
});

test('6. response mas nuevo reemplaza state y aplica declined al guest', async () => {
    const eventId = 'EVT-55-NEWER';
    const refs = await seedDirect('newer', response(eventId));
    await reconcile(eventId, TOKEN, refs);
    await refs.response.set(response(eventId, {
        status: 'declined', passesConfirmed: 0, respondedAt: plusSeconds(10)
    }));
    const outcome = await reconcile(eventId, TOKEN, refs);
    assert.equal(outcome.status, 'applied');
    assert.equal((await refs.state.get()).data().status, 'declined');
    assert.equal((await refs.guest.get()).data().estado, 'no_asistira');
});

test('7. mismo timestamp con datos distintos reporta conflict sin overwrite', async () => {
    const eventId = 'EVT-55-CONFLICT';
    const refs = await seedDirect('conflict', response(eventId));
    await reconcile(eventId, TOKEN, refs);
    const beforeState = (await refs.state.get()).data();
    const beforeGuest = (await refs.guest.get()).data();
    await refs.response.set(response(eventId, { status: 'declined', passesConfirmed: 0 }));
    const outcome = await reconcile(eventId, TOKEN, refs);
    assert.equal(outcome.status, 'conflict');
    assert.deepEqual((await refs.state.get()).data(), beforeState);
    assert.deepEqual((await refs.guest.get()).data(), beforeGuest);
});

test('8. response duplicado por rotacion converge a una sola verdad logica', async () => {
    const eventId = 'EVT-55-ROTATION';
    const firstRefs = await seedDirect('rotation', response(eventId));
    await reconcile(eventId, TOKEN, firstRefs);
    const rotatedRefs = { ...firstRefs, response: directReferences('rotation', ROTATED_TOKEN).response };
    await rotatedRefs.response.set(response(eventId));
    const outcome = await reconcile(eventId, ROTATED_TOKEN, rotatedRefs);
    const states = await firstRefs.event.collection('states').get();
    assert.equal(outcome.status, 'unchanged');
    assert.equal(states.size, 1);
    assert.equal(states.docs[0].data().status, 'accepted');
});

test('9. campos asignados, QR y check-in permanecen byte-for-byte intactos', async () => {
    const eventId = 'EVT-55-PROTECTED';
    const originalGuest = guest({
        pasesUtilizados: 2,
        pasesDisponibles: 2,
        checkinSecuencia: 1,
        estado: 'llego',
        confirmado: true,
        llegadaRegistrada: true,
        horaLlegada: plusSeconds(-20)
    });
    const refs = await seedDirect('protected', response(eventId, {
        status: 'declined',
        passesConfirmed: 0
    }), originalGuest);
    await reconcile(eventId, TOKEN, refs);
    const state = (await refs.state.get()).data();
    const syncedGuest = (await refs.guest.get()).data();
    assert.equal(state.status, 'declined');
    assert.equal(syncedGuest.estado, 'llego');
    assert.equal(syncedGuest.confirmado, true);
    for (const field of [
        'pases', 'pasesUtilizados', 'pasesDisponibles', 'checkinSecuencia',
        'llegadaRegistrada', 'horaLlegada', 'qrToken', 'qrActivo'
    ]) {
        assert.deepEqual(syncedGuest[field], originalGuest[field]);
    }
});

test('10. fallo dentro de transaccion no modifica state, guest ni agregado', async () => {
    const eventId = 'EVT-55-ATOMIC';
    const refs = await seedDirect('atomic', response(eventId));
    const guestBefore = (await refs.guest.get()).data();
    const eventBefore = (await refs.event.get()).data();
    await assert.rejects(
        reconcile(eventId, TOKEN, refs, {
            beforeCommit: async () => { throw new Error('phase55/test-transaction-failure'); }
        }),
        /phase55\/test-transaction-failure/
    );
    assert.equal((await refs.state.get()).exists, false);
    assert.deepEqual((await refs.guest.get()).data(), guestBefore);
    assert.deepEqual((await refs.event.get()).data(), eventBefore);
});
