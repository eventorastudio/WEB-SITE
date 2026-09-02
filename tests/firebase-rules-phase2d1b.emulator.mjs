import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-eventorastudio-phase2d1b';
let testEnv;

before(async () => { testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID }); });
after(async () => { await testEnv?.cleanup(); });

function eventRef(db, id) { return doc(db, 'eventos', id); }
function context(role, uid = `UID-${role}`) {
    return testEnv.authenticatedContext(uid, { role }).firestore();
}
async function seed(id) {
    const db = context('CEO', `seed-${id}`);
    await assertSucceeds(setDoc(eventRef(db, id), {
        fecha: '2030-06-15', demoMode: false, estado: 'activo', owner: 'owner-1', uid: 'owner-1'
    }));
}

async function seedPurgeReservation(id) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'administrativePurgeRecords', `PURGE-${id}`), {
            status: 'PURGED', eventId: id, operationId: `PURGE-${id}`
        });
    });
}

function validNewEventPayload() {
    return { fecha: '2030-06-15', demoMode: false, estado: 'activo', owner: 'owner-1', uid: 'owner-1' };
}

test('event ID reservado por purge no puede recrearse por ningún manager ni payload', async () => {
    const id = 'reserved-event';
    await seedPurgeReservation(id);
    for (const role of ['CEO', 'ADMINISTRADOR', 'ADMIN']) {
        const db = context(role, `reuse-${role}`);
        await assertFails(setDoc(eventRef(db, id), validNewEventPayload()));
        await assertFails(setDoc(eventRef(db, id), { ...validNewEventPayload(), purgeLock: null }));
        await assertFails(setDoc(eventRef(db, id), { ...validNewEventPayload(), purgeLock: false, administrative: true }));
    }
});

test('event ID nuevo y eventA reservado no bloquean eventB; usuario sin permisos sigue en deny', async () => {
    await seedPurgeReservation('eventA');
    await assertSucceeds(setDoc(eventRef(context('CEO', 'new-event-manager'), 'eventB'), validNewEventPayload()));
    await assertSucceeds(setDoc(eventRef(context('ADMIN', 'random-event-manager'), 'random-event'), validNewEventPayload()));
    await assertFails(setDoc(eventRef(testEnv.authenticatedContext('plain-user', {}).firestore(), 'unauthorized-new'), validNewEventPayload()));
});

test('cliente no puede eliminar ni modificar la reserva administrativa', async () => {
    const id = 'immutable-reservation';
    await seedPurgeReservation(id);
    const db = context('CEO', 'reservation-attacker');
    await assertFails(deleteDoc(doc(db, 'administrativePurgeRecords', `PURGE-${id}`)));
    await assertFails(updateDoc(doc(db, 'administrativePurgeRecords', `PURGE-${id}`), { status: 'DRAFT' }));
});

test('CEO, ADMINISTRADOR y ADMIN pueden actualizar fecha', async () => {
    for (const role of ['CEO', 'ADMINISTRADOR', 'ADMIN']) {
        const id = `date-${role}`;
        await seed(id);
        await assertSucceeds(updateDoc(eventRef(context(role), id), { fecha: '2030-06-16' }));
    }
});

test('DISENADOR sólo puede actualizar fecha civil válida', async () => {
    const id = 'designer-date';
    await seed(id);
    const db = context('DISENADOR');
    await assertSucceeds(updateDoc(eventRef(db, id), { fecha: '2032-02-29' }));
    await assertFails(updateDoc(eventRef(db, id), { fecha: '2030-6-17' }));
    await assertFails(updateDoc(eventRef(db, id), { fecha: '2030-06-17', demoMode: true }));
    await assertFails(updateDoc(eventRef(db, id), { fecha: '2030-06-17', estado: 'pausado' }));
    await assertFails(updateDoc(eventRef(db, id), { fecha: '2030-06-17', owner: 'other' }));
    await assertFails(updateDoc(eventRef(db, id), { fecha: '2030-06-17', uid: 'other' }));
});

test('usuario sin rol y rol no editor no pueden actualizar fecha', async () => {
    const id = 'unauthorized-date';
    await seed(id);
    await assertFails(updateDoc(eventRef(testEnv.authenticatedContext('plain-user', {}).firestore(), id), { fecha: '2030-06-16' }));
    await assertFails(updateDoc(eventRef(context('VENTAS'), id), { fecha: '2030-06-16' }));
});

test('purgeLock congela el root para cliente y no permite manipular el lock', async () => {
    const id = 'root-freeze';
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(eventRef(context.firestore(), id), {
            fecha: '2030-06-15', demoMode: false, estado: 'activo', owner: 'owner-1', uid: 'owner-1',
            purgeLock: { operationId: 'PURGE-root-freeze', status: 'PURGE_PENDING' }
        });
    });
    const db = context('CEO');
    await assertFails(updateDoc(eventRef(db, id), { fecha: '2030-06-16' }));
    await assertFails(updateDoc(eventRef(db, id), { demoMode: true }));
    await assertFails(updateDoc(eventRef(db, id), { estado: 'pausado' }));
    await assertFails(updateDoc(eventRef(db, id), { purgeLock: null }));
});
