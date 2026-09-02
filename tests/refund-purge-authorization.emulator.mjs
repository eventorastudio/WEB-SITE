import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
    authorizeRefundProjectPurge,
    cancelRefundProjectPurge,
    consumePurgeAuthorization,
    expectedPurgePhrase,
    hashPurgeManifest
} from '../functions/src/purge/refund-purge-authorization.js';
import { buildRefundEvidenceHash } from '../functions/src/purge/refund-records.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('EMULATOR_REQUIRED');

const app = getApps()[0] ?? initializeApp({ projectId: 'demo-eventorastudio-phase2e2c' });
const db = getFirestore(app);
const confirmations = {
    refundProcessed: true,
    eventAndReferenceReviewed: true,
    irreversibleUnderstood: true,
    commercialRecordsPreserved: true
};
let counter = 0;

after(async () => app.delete());

function fixture() {
    counter += 1;
    const eventId = `E2E2C-${counter}`;
    const commercialFileReference = `EV-COM-${counter}`;
    const refundReference = `EV-REF-${counter}`;
    const manifest = {
        manifestVersion: 1,
        firestore: [{ path: `eventos/${eventId}`, id: eventId }],
        storage: [], publicKeys: [], sharedDemoReferences: []
    };
    return { eventId, commercialFileReference, refundReference, manifest };
}

async function seed(recordFixture) {
    await db.collection('administrativePurgeRecords').doc(`PURGE-${recordFixture.eventId}`).set({
        originalEventId: recordFixture.eventId,
        operationId: `PURGE-${recordFixture.eventId}`,
        status: 'DRY_RUN_READY',
        purgeSchemaVersion: 1,
        refundReference: recordFixture.refundReference,
        commercialFileReference: recordFixture.commercialFileReference,
        manifest: recordFixture.manifest,
        blockers: []
    });
    const refundRecord = {
        refundRecordId: `REF-${recordFixture.eventId}-${recordFixture.refundReference}`,
        eventId: recordFixture.eventId,
        commercialFileReference: recordFixture.commercialFileReference,
        refundReference: recordFixture.refundReference,
        status: 'CONFIRMED',
        amount: 1000,
        currency: 'MXN',
        paymentMethod: 'SPEI',
        refundedAt: new Date('2025-01-02T12:00:00.000Z'),
        terminationIntent: 'COMPLETE_TERMINATION',
        linkedPurgeOperationId: `PURGE-${recordFixture.eventId}`
    };
    const refundEvidenceHash = buildRefundEvidenceHash(refundRecord);
    await db.collection('administrativeRefundRecords').doc(refundRecord.refundRecordId).set({
        ...refundRecord,
        refundEvidenceHash
    });
    await db.doc(`administrativePurgeRecords/PURGE-${recordFixture.eventId}`).update({
        refundRecordId: `REF-${recordFixture.eventId}-${recordFixture.refundReference}`,
        refundEvidenceHash
    });
}

function claims(ageSeconds = 0) {
    return { role: 'CEO', auth_time: Math.floor(Date.now() / 1000) - ageSeconds };
}

function request(recordFixture, overrides = {}) {
    const now = overrides.now ?? new Date();
    return {
        db,
        eventId: recordFixture.eventId,
        actorUid: 'CEO-2E2C',
        claims: claims(overrides.ageSeconds ?? 0),
        phrase: expectedPurgePhrase(recordFixture.eventId, recordFixture.commercialFileReference),
        confirmations,
        manifestHash: hashPurgeManifest(recordFixture.manifest),
        refundReference: recordFixture.refundReference,
        commercialFileReference: recordFixture.commercialFileReference,
        now
    };
}

test('CEO autoriza una vez, el token se liga al registro y puede cancelarse', async () => {
    const recordFixture = fixture();
    await seed(recordFixture);
    const authorization = await authorizeRefundProjectPurge(request(recordFixture));
    assert.equal(authorization.status, 'READY_FOR_EXECUTION');
    assert.ok(authorization.authorizationToken);
    const recordReference = db.doc(`administrativePurgeRecords/PURGE-${recordFixture.eventId}`);
    const saved = (await recordReference.get()).data();
    const serialized = JSON.stringify(saved);
    assert.equal(saved.authorization.used, false);
    assert.equal(saved.authorization.authorizationToken, undefined);
    assert.doesNotMatch(serialized, /PII fixture|guest|correo|email|telefono|qrToken|rsvpToken|https?:\/\//i);
    await assert.rejects(authorizeRefundProjectPurge(request(recordFixture)), (error) => error.code === 'AUTHORIZATION_ALREADY_ACTIVE');
    const cancelled = await cancelRefundProjectPurge({
        db, eventId: recordFixture.eventId, actorUid: 'CEO-2E2C', claims: claims(),
        authorizationId: authorization.authorizationId
    });
    assert.equal(cancelled.status, 'DRY_RUN_READY');
    assert.equal((await recordReference.get()).data().authorization.authorizationTokenHash, null);
});

test('roles no CEO, confirmación incompleta, frase/folio/hash stale y fresh auth rechazan', async () => {
    const recordFixture = fixture();
    await seed(recordFixture);
    await assert.rejects(authorizeRefundProjectPurge({ ...request(recordFixture), eventId: '../wrong-event' }), (error) => error.code === 'INVALID_EVENT_ID');
    await assert.rejects(authorizeRefundProjectPurge({ ...request(recordFixture), claims: { role: 'ADMINISTRADOR', auth_time: Math.floor(Date.now() / 1000) } }), (error) => error.code === 'UNAUTHORIZED');
    await assert.rejects(authorizeRefundProjectPurge({ ...request(recordFixture), confirmations: { ...confirmations, irreversibleUnderstood: false } }), (error) => error.code === 'CONFIRMATIONS_INCOMPLETE');
    await assert.rejects(authorizeRefundProjectPurge({ ...request(recordFixture), phrase: 'PURGAR INCORRECTO' }), (error) => error.code === 'CONFIRMATION_PHRASE_INVALID');
    await assert.rejects(authorizeRefundProjectPurge({
        ...request(recordFixture), commercialFileReference: 'WRONG-FOLIO', phrase: expectedPurgePhrase(recordFixture.eventId, 'WRONG-FOLIO')
    }), (error) => error.code === 'PURGE_EVIDENCE_MISMATCH');
    await assert.rejects(authorizeRefundProjectPurge({ ...request(recordFixture), manifestHash: '0'.repeat(64) }), (error) => error.code === 'MANIFEST_STALE');
    await assert.rejects(authorizeRefundProjectPurge({ ...request(recordFixture, { ageSeconds: 901 }) }), (error) => error.code === 'REAUTH_REQUIRED');
});

test('autorización expirada puede sustituirse y DEMO nunca llega a READY', async () => {
    const recordFixture = fixture();
    await seed(recordFixture);
    await db.doc(`administrativePurgeRecords/PURGE-${recordFixture.eventId}`).update({
        authorization: { authorizationId: 'EXPIRED', expiresAt: new Date(Date.now() - 1_000), used: false }
    });
    const replacement = await authorizeRefundProjectPurge(request(recordFixture));
    assert.equal(replacement.status, 'READY_FOR_EXECUTION');
    const demo = fixture();
    await db.doc(`eventos/${demo.eventId}`).set({ demoMode: true });
    await assert.rejects(authorizeRefundProjectPurge(request(demo)), (error) => error.code === 'DEMO_PURGE_BLOCKED');
});

test('el token de autorización es single-use y expira', async () => {
    const recordFixture = fixture();
    await seed(recordFixture);
    const authorization = await authorizeRefundProjectPurge(request(recordFixture));
    const consumed = await consumePurgeAuthorization({
        db, eventId: recordFixture.eventId, authorizationId: authorization.authorizationId,
        authorizationToken: authorization.authorizationToken
    });
    assert.equal(consumed.status, 'AUTHORIZATION_CONSUMED');
    await assert.rejects(consumePurgeAuthorization({
        db, eventId: recordFixture.eventId, authorizationId: authorization.authorizationId,
        authorizationToken: authorization.authorizationToken
    }), (error) => error.code === 'AUTHORIZATION_ALREADY_USED');
});

test('la evidencia refund modificada antes de autorizar queda stale', async () => {
    const recordFixture = fixture();
    await seed(recordFixture);
    await db.doc(`administrativeRefundRecords/REF-${recordFixture.eventId}-${recordFixture.refundReference}`).update({ amount: 2000 });
    await assert.rejects(authorizeRefundProjectPurge(request(recordFixture)), (error) => error.code === 'REFUND_EVIDENCE_STALE');
});
