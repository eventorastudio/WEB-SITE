import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { prepareRefundPurgeDryRun } from '../functions/src/purge/refund-purge-preparation.js';
import { confirmRefundRecord, recordRefundProcessed } from '../functions/src/purge/refund-records.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('EMULATOR_REQUIRED');

const app = getApps()[0] ?? initializeApp({ projectId: 'demo-eventorastudio-phase2f1' });
const db = getFirestore(app);
let sequence = 0;

after(async () => app.delete());

function mockBucket() {
    return { getFiles: async () => [[]] };
}

async function seedRefund(intent, { eventId = `E2E2F1-${++sequence}`, amount = 1000 } = {}) {
    await db.doc(`eventos/${eventId}`).set({ demoMode: false });
    const input = {
        eventId,
        commercialFileReference: `CF-${eventId}`,
        refundReference: `RF-${eventId}`,
        amount,
        currency: 'MXN',
        paymentMethod: 'SPEI',
        refundedAt: new Date('2025-01-02T12:00:00.000Z'),
        terminationIntent: intent
    };
    const recorded = await recordRefundProcessed({ db, input, actorUid: 'CEO-2E2F1', claims: { role: 'CEO' } });
    await confirmRefundRecord({ db, refundRecordId: recorded.refundRecordId, actorUid: 'CEO-2E2F1', claims: { role: 'CEO' } });
    return { eventId, input, refundRecordId: recorded.refundRecordId };
}

async function prepare(fixture) {
    return prepareRefundPurgeDryRun({
        db, bucket: mockBucket(), eventId: fixture.eventId,
        refundRecordId: fixture.refundRecordId, actorUid: 'CEO-2E2F1', claims: { role: 'CEO' }
    });
}

test('SERVICE_CONTINUES nunca crea purge record', async () => {
    const fixture = await seedRefund('SERVICE_CONTINUES');
    await assert.rejects(prepare(fixture), (error) => error.code === 'REFUND_DOES_NOT_TERMINATE_SERVICE');
    assert.equal((await db.doc(`administrativePurgeRecords/PURGE-${fixture.eventId}`).get()).exists, false);
});

test('COMPLETE_TERMINATION permite dry-run; el monto no decide', async () => {
    const complete = await seedRefund('COMPLETE_TERMINATION', { amount: 1 });
    assert.equal((await prepare(complete)).status, 'DRY_RUN_READY');
    const continues = await seedRefund('SERVICE_CONTINUES', { amount: 100000 });
    await assert.rejects(prepare(continues), (error) => error.code === 'REFUND_DOES_NOT_TERMINATE_SERVICE');
});

test('terminationIntent ausente o inválido se rechaza al registrar', async () => {
    const base = {
        eventId: 'E2E2F1-INVALID', commercialFileReference: 'CF-INVALID', refundReference: 'RF-INVALID',
        amount: 100, currency: 'MXN', paymentMethod: 'SPEI', refundedAt: new Date()
    };
    await assert.rejects(recordRefundProcessed({ db, input: base, actorUid: 'CEO', claims: { role: 'CEO' } }), (error) => error.code === 'TERMINATION_INTENT_INVALID');
    await assert.rejects(recordRefundProcessed({ db, input: { ...base, terminationIntent: 'DELETE_PROJECT' }, actorUid: 'CEO', claims: { role: 'CEO' } }), (error) => error.code === 'TERMINATION_INTENT_INVALID');
});

test('CONFIRMED es inmutable y frontend no puede cambiar terminationIntent', async () => {
    const fixture = await seedRefund('COMPLETE_TERMINATION');
    await assert.rejects(recordRefundProcessed({ db, input: { ...fixture.input, terminationIntent: 'SERVICE_CONTINUES' }, actorUid: 'CEO', claims: { role: 'CEO' } }), (error) => error.code === 'REFUND_CONFIRMED_IMMUTABLE');
});

test('eventA no puede usar refund de eventB y el frontend no puede saltar el registro', async () => {
    const eventA = await seedRefund('COMPLETE_TERMINATION');
    const eventB = await seedRefund('COMPLETE_TERMINATION');
    await assert.rejects(prepare({ ...eventA, eventId: eventB.eventId }), (error) => error.code === 'REFUND_EVENT_MISMATCH');
    await assert.rejects(prepareRefundPurgeDryRun({
        db, bucket: mockBucket(), eventId: eventA.eventId, refund: { status: 'REFUNDED', refundReference: 'fake', commercialFileReference: 'fake', refundedAt: new Date() }, actorUid: 'CEO', claims: { role: 'CEO' }
    }), (error) => error.code === 'REFUND_EVIDENCE_NOT_PRODUCTION_READY');
});
