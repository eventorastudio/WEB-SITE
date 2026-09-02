import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
    confirmRefundRecord,
    getConfirmedRefundRecord,
    recordRefundProcessed
} from '../functions/src/purge/refund-records.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('EMULATOR_REQUIRED');

const app = getApps()[0] ?? initializeApp({ projectId: 'demo-eventorastudio-phase2d' });
const db = getFirestore(app);
let sequence = 0;

after(async () => app.delete());

function input() {
    sequence += 1;
    return {
        eventId: `REF-EVENT-${sequence}`,
        commercialFileReference: `EV-COM-${sequence}`,
        refundReference: `EV-REF-${sequence}`,
        amount: 1250.50,
        currency: 'MXN',
        paymentMethod: 'SPEI',
        refundedAt: new Date(),
        terminationIntent: 'COMPLETE_TERMINATION'
    };
}

const ceo = { role: 'CEO' };

test('CEO registra y confirma refund; CONFIRMED es inmutable y se liga a un evento', async () => {
    const value = input();
    const recorded = await recordRefundProcessed({ db, input: value, actorUid: 'CEO-REFUND', claims: ceo });
    assert.equal(recorded.status, 'RECORDED');
    const confirmed = await confirmRefundRecord({ db, refundRecordId: recorded.refundRecordId, actorUid: 'CEO-REFUND', claims: ceo });
    assert.equal(confirmed.status, 'CONFIRMED');
    const resolved = await getConfirmedRefundRecord({ db, refundRecordId: recorded.refundRecordId, eventId: value.eventId });
    assert.equal(resolved.record.eventId, value.eventId);
    await assert.rejects(recordRefundProcessed({ db, input: value, actorUid: 'CEO-REFUND', claims: ceo }), (error) => error.code === 'REFUND_CONFIRMED_IMMUTABLE');
    await assert.rejects(getConfirmedRefundRecord({ db, refundRecordId: recorded.refundRecordId, eventId: 'OTHER-EVENT' }), (error) => error.code === 'REFUND_EVENT_MISMATCH');
});

test('refund inválido, roles no CEO y doble uso quedan rechazados', async () => {
    const value = input();
    await assert.rejects(recordRefundProcessed({ db, input: { ...value, amount: 0 }, actorUid: 'ADMIN', claims: { role: 'ADMINISTRADOR' } }), (error) => error.code === 'UNAUTHORIZED');
    await assert.rejects(recordRefundProcessed({ db, input: { ...value, amount: 0 }, actorUid: 'CEO-REFUND', claims: ceo }), (error) => error.code === 'AMOUNT_INVALID');
    await assert.rejects(recordRefundProcessed({ db, input: { ...value, refundedAt: '' }, actorUid: 'CEO-REFUND', claims: ceo }), (error) => error.code === 'REFUNDED_AT_INVALID');
    const recorded = await recordRefundProcessed({ db, input: value, actorUid: 'CEO-REFUND', claims: ceo });
    await confirmRefundRecord({ db, refundRecordId: recorded.refundRecordId, actorUid: 'CEO-REFUND', claims: ceo });
    await db.doc(`administrativeRefundRecords/${recorded.refundRecordId}`).update({ linkedPurgeOperationId: 'PURGE-OTHER' });
    await assert.rejects(getConfirmedRefundRecord({ db, refundRecordId: recorded.refundRecordId, eventId: value.eventId }), (error) => error.code === 'REFUND_ALREADY_LINKED');
});
