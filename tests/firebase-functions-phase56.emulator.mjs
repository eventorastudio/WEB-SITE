import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

import { reconcileCurrentRsvpResponse } from '../functions/src/rsvp-reconciliation.js';

const PROJECT_ID = 'demo-eventorastudio-phase55';
const GUEST_ID = 'INV-0001';
const TOKEN = 'T'.repeat(43);
const RESPONDED_AT = Timestamp.fromDate(new Date('2026-08-17T15:00:00.000Z'));
const SYNCED_AT = Timestamp.fromDate(new Date('2026-08-17T15:00:01.000Z'));

let app;
let db;

before(() => {
    app = initializeApp({ projectId: PROJECT_ID }, 'phase56-functions-tests');
    db = getFirestore(app);
});

after(async () => {
    await deleteApp(app);
});

function references(caseId) {
    const event = db.collection('phase56Events').doc(caseId);
    return {
        event,
        response: event.collection('responses').doc(TOKEN),
        state: event.collection('states').doc(GUEST_ID),
        guest: event.collection('guests').doc(GUEST_ID),
        conflicts: event.collection('conflicts')
    };
}

async function seedConflict(caseId) {
    const refs = references(caseId);
    const batch = db.batch();
    batch.set(refs.state, {
        schemaVersion: 1,
        eventId: `EVT-56-${caseId.toUpperCase()}`,
        guestId: GUEST_ID,
        status: 'accepted',
        passesConfirmed: 4,
        respondedAt: RESPONDED_AT,
        syncedAt: SYNCED_AT
    });
    batch.set(refs.response, {
        schemaVersion: 1,
        eventId: `EVT-56-${caseId.toUpperCase()}`,
        guestId: GUEST_ID,
        status: 'declined',
        passesConfirmed: 0,
        respondedAt: RESPONDED_AT
    });
    await batch.commit();
    return refs;
}

async function reconcile(caseId, refs) {
    return reconcileCurrentRsvpResponse({
        db,
        eventId: `EVT-56-${caseId.toUpperCase()}`,
        token: TOKEN,
        references: refs,
        serverTimestampFactory: () => FieldValue.serverTimestamp()
    });
}

test('1. conflicto real se persiste una sola vez sin bearer ni datos sensibles', async () => {
    const refs = await seedConflict('persist');
    const outcome = await reconcile('persist', refs);
    const conflicts = await refs.conflicts.get();
    assert.equal(outcome.status, 'conflict');
    assert.equal(outcome.conflictCreated, true);
    assert.equal(conflicts.size, 1);
    const record = conflicts.docs[0].data();
    assert.deepEqual(Object.keys(record).sort(), [
        'candidate', 'canonical', 'conflictType', 'createdAt',
        'eventId', 'guestId', 'respondedAt'
    ]);
    assert.deepEqual(record.canonical, { status: 'accepted', passesConfirmed: 4 });
    assert.deepEqual(record.candidate, { status: 'declined', passesConfirmed: 0 });
    assert.equal('token' in record, false);
    assert.equal('qrToken' in record, false);
});

test('2. retry del mismo conflicto conserva un documento y su createdAt', async () => {
    const refs = await seedConflict('retry');
    await reconcile('retry', refs);
    const before = await refs.conflicts.get();
    const beforeRecord = before.docs[0].data();
    const outcome = await reconcile('retry', refs);
    const after = await refs.conflicts.get();
    assert.equal(outcome.status, 'conflict');
    assert.equal(outcome.conflictCreated, false);
    assert.equal(after.size, 1);
    assert.equal(after.docs[0].id, before.docs[0].id);
    assert.equal(after.docs[0].data().createdAt.isEqual(beforeRecord.createdAt), true);
});
