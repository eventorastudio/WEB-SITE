import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { confirmRefundRecord, recordRefundProcessed } from '../functions/src/purge/refund-records.js';
import { authorizeRefundProjectPurge, expectedPurgePhrase, hashPurgeManifest } from '../functions/src/purge/refund-purge-authorization.js';

import { prepareRefundPurgeDryRun } from '../functions/src/purge/refund-purge-preparation.js';
import {
    assertDestructiveEmulatorEnvironment,
    executeRefundProjectPurge,
    isEventPurgeLocked
} from '../functions/src/purge/refund-purge-executor.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('EMULATOR_REQUIRED');

const PROJECT_ID = 'demo-eventorastudio-phase2e2b';
const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
const REFUND = {
    status: 'REFUNDED',
    refundReference: 'EV-REE-2030-0001',
    commercialFileReference: 'EV-COM-2030-0001',
    refundedAt: '2025-01-02T12:00:00.000Z', amount: 1000, currency: 'MXN', paymentMethod: 'SPEI', terminationIntent: 'COMPLETE_TERMINATION'
};
let sequence = 0;

before(() => {
    process.env.EVENTORA_ALLOW_DESTRUCTIVE_EMULATOR_PURGE = 'true';
    process.env.GCLOUD_PROJECT = PROJECT_ID;
});

after(async () => app.delete());

function nextId(label) {
    sequence += 1;
    return `E2E2B-${label}-${sequence}`;
}

class StorageMock {
    constructor(paths = []) {
        this.paths = new Set(paths);
        this.failPath = null;
        this.failed = false;
        this.__eventoraStorageEmulatorMock = true;
    }

    async getFiles({ prefix } = {}) {
        return [[...this.paths]
            .filter((path) => path.startsWith(prefix ?? ''))
            .map((name) => ({ name }))];
    }

    file(path) {
        return {
            delete: async () => {
                if (this.failPath === path && !this.failed) {
                    this.failed = true;
                    const error = new Error('storage fixture failure');
                    error.code = '503';
                    throw error;
                }
                this.paths.delete(path);
            },
            exists: async () => [this.paths.has(path)]
        };
    }
}

async function seedEvent(eventId, storagePaths, { demoMode = false } = {}) {
    const event = db.doc(`eventos/${eventId}`);
    await event.set({ demoMode, estado: 'activo' });
    await event.collection('invitados').doc('GUEST-A').set({ nombre: 'PII fixture' });
    await event.collection('checkins').doc('CHECK-A').set({ guestId: 'GUEST-A' });
    await event.collection('rsvpAccess').doc('SECRET-ACCESS-TOKEN').set({ guestId: 'GUEST-A' });
    await event.collection('rsvpPublic').doc('RSVP-CONFIG').set({ eventId });
    await event.collection('rsvpResponses').doc('SECRET-RESPONSE-TOKEN').set({ guestId: 'GUEST-A' });
    await event.collection('rsvpState').doc('GUEST-A').set({ guestId: 'GUEST-A' });
    await event.collection('rsvpConflicts').doc('CONFLICT-A').set({ guestId: 'GUEST-A' });
    await event.collection('invitacion').doc('draft').set({ texto: 'Texto privado de fixture' });
    await event.collection('invitacion').doc('rsvp').set({ enabled: true });
    await event.collection('invitacion').doc('rsvpPublication').set({ enabled: true });
    await event.collection('invitacion').doc('publication').set({ currentRevisionId: 'REV-A' });
    await event.collection('invitacion').doc('publication').collection('revisions').doc('REV-A').set({ texto: 'Privado' });
    await event.collection('invitacionPublic').doc('public-key-a').set({ texto: 'Público' });
    const ownPath = storagePaths.find((path) => path.includes('/cover/'));
    await event.collection('invitacion').doc('config').set({ mediaIndex: { coverIds: ['MEDIA-A'] } });
    await event.collection('invitacion').doc('config').collection('media').doc('MEDIA-A').set({
        role: 'cover', storagePath: ownPath, objectVersion: 'v1'
    });
    await db.collection('usuarios').doc(`USER-${eventId}`).set({ eventosPermitidos: [eventId, 'OTHER-EVENT'] });
    await db.collection('commercialFiles').doc(`CF-${eventId}`).set({ refundReference: REFUND.refundReference });
    const refund = { ...REFUND, eventId, refundReference: `${REFUND.refundReference}-${eventId}`, commercialFileReference: `${REFUND.commercialFileReference}-${eventId}` };
    const recorded = await recordRefundProcessed({ db, input: refund, actorUid: 'CEO-TEST', claims: { role: 'CEO' } });
    await confirmRefundRecord({ db, refundRecordId: recorded.refundRecordId, actorUid: 'CEO-TEST', claims: { role: 'CEO' } });
    await event.set({ refundReference: refund.refundReference, commercialFileReference: refund.commercialFileReference }, { merge: true });
    return recorded.refundRecordId;
}

async function prepare({ eventId, bucket, refundRecordId }) {
    return prepareRefundPurgeDryRun({
        db, bucket, eventId, actorUid: 'CEO-TEST', claims: { role: 'CEO' }, refundRecordId,
        now: new Date('2030-01-03T12:00:00.000Z')
    });
}

async function authorize(eventId, prepared) {
    const stored = (await db.doc(`administrativePurgeRecords/PURGE-${eventId}`).get()).data();
    return authorizeRefundProjectPurge({ db, eventId, actorUid: 'CEO-TEST', claims: { role: 'CEO', auth_time: Math.floor(Date.now() / 1000) },
        phrase: expectedPurgePhrase(eventId, stored.commercialFileReference),
        confirmations: { refundProcessed: true, eventAndReferenceReviewed: true, irreversibleUnderstood: true, commercialRecordsPreserved: true },
        manifestHash: hashPurgeManifest(prepared.manifest), refundReference: stored.refundReference, commercialFileReference: stored.commercialFileReference });
}

test('purga completa por orden, aislamiento eventA/eventB y reanudación sin rollback', async () => {
    const eventA = nextId('A');
    const eventB = nextId('B');
    const ownPrefix = `eventos/${eventA}/invitacion/media/`;
    const eventBStoragePath = `eventos/${eventB}/invitacion/media/cover/b.webp`;
    const paths = [
        `${ownPrefix}cover/a.webp`,
        eventBStoragePath,
        'unrelated/important.webp',
        'demo-library/DML-shared.webp'
    ];
    const storage = new StorageMock(paths);
    await seedEvent(eventA, paths);
    await seedEvent(eventB, [eventBStoragePath]);
    await db.doc(`eventos/${eventB}`).update({ estado: 'normal' });
    const prepared = await prepare({ eventId: eventA, bucket: storage, refundRecordId: `REF-${eventA}-${encodeURIComponent(`${REFUND.refundReference}-${eventA}`)}` });
    assert.equal(prepared.status, 'DRY_RUN_READY');
    const authorization = await authorize(eventA, prepared);
    await assert.rejects(
        executeRefundProjectPurge({ db, bucket: storage, eventId: eventB, actorUid: 'CEO-TEST', claims: { role: 'CEO' }, authorizationId: 'missing', authorizationToken: 'missing' }),
        (error) => error.code === 'PURGE_RECORD_NOT_FOUND'
    );
    storage.failPath = `${ownPrefix}cover/a.webp`;
    await assert.rejects(
        executeRefundProjectPurge({ db, bucket: storage, eventId: eventA, actorUid: 'CEO-TEST', claims: { role: 'CEO' }, authorizationId: authorization.authorizationId, authorizationToken: authorization.authorizationToken }),
        (error) => error.code === 'STORAGE_DELETE_FAILED'
    );
    assert.equal((await db.doc(`administrativePurgeRecords/PURGE-${eventA}`).get()).data().status, 'FAILED_RETRYABLE');
    storage.failPath = null;
    const preparedB = await prepare({ eventId: eventB, bucket: storage, refundRecordId: `REF-${eventB}-${encodeURIComponent(`${REFUND.refundReference}-${eventB}`)}` });
    const authorizationB = await authorize(eventB, preparedB);
    await assert.rejects(
        executeRefundProjectPurge({ db, bucket: storage, eventId: eventB, actorUid: 'CEO-TEST', claims: { role: 'CEO' },
            authorizationId: authorizationB.authorizationId, authorizationToken: authorizationB.authorizationToken }),
        (error) => error.code === 'GLOBAL_PURGE_ALREADY_RUNNING'
    );
    assert.equal((await db.doc(`eventos/${eventB}`).get()).exists, true);
    const result = await executeRefundProjectPurge({
        db, bucket: storage, eventId: eventA, actorUid: 'CEO-TEST', claims: { role: 'CEO' }, authorizationId: authorization.authorizationId, authorizationToken: authorization.authorizationToken
    });
    assert.equal(result.status, 'PURGED');
    assert.equal(storage.paths.has('unrelated/important.webp'), true);
    assert.equal(storage.paths.has('demo-library/DML-shared.webp'), true);
    assert.deepEqual((await db.doc(`usuarios/USER-${eventA}`).get()).data().eventosPermitidos, ['OTHER-EVENT']);
    assert.equal((await db.doc(`commercialFiles/CF-${eventA}`).get()).exists, true);
    assert.equal((await db.doc(`eventos/${eventB}`).get()).exists, true);
    assert.equal((await db.doc(`eventos/${eventB}/invitados/GUEST-A`).get()).exists, true);
    assert.equal((await db.doc(`eventos/${eventB}/rsvpAccess/SECRET-ACCESS-TOKEN`).get()).exists, true);
    assert.equal((await db.doc(`eventos/${eventB}/invitacionPublic/public-key-a`).get()).exists, true);
    assert.equal(storage.paths.has(eventBStoragePath), true);
    assert.equal((await db.doc(`eventos/${eventA}`).get()).exists, false);
    assert.equal((await executeRefundProjectPurge({
        db, bucket: storage, eventId: eventA, actorUid: 'CEO-TEST', claims: { role: 'CEO' }, authorizationId: authorization.authorizationId, authorizationToken: authorization.authorizationToken
    })).status, 'ALREADY_PURGED');
});

test('manifest stale, DEMO, evento equivocado y asset UNKNOWN no borran', async () => {
    const eventId = nextId('STALE');
    const path = `eventos/${eventId}/invitacion/media/cover/a.webp`;
    const storage = new StorageMock([path, 'demo-library/DML-shared.webp']);
    await seedEvent(eventId, [path]);
    const stalePrepared = await prepare({ eventId, bucket: storage, refundRecordId: `REF-${eventId}-${encodeURIComponent(`${REFUND.refundReference}-${eventId}`)}` });
    const staleAuthorization = await authorize(eventId, stalePrepared);
    await db.doc(`eventos/${eventId}/invitados/NEW-GUEST`).set({ artificial: true });
    await assert.rejects(
        executeRefundProjectPurge({ db, bucket: storage, eventId, actorUid: 'CEO-TEST', claims: { role: 'CEO' }, authorizationId: staleAuthorization.authorizationId, authorizationToken: staleAuthorization.authorizationToken }),
        (error) => error.code === 'MANIFEST_STALE'
    );
    assert.equal((await db.doc(`eventos/${eventId}`).get()).exists, true);
    await db.doc(`eventos/${eventId}/invitados/NEW-GUEST`).delete();
    const stalePrepared2 = await prepare({ eventId, bucket: storage, refundRecordId: `REF-${eventId}-${encodeURIComponent(`${REFUND.refundReference}-${eventId}`)}` });
    const staleAuthorization2 = await authorize(eventId, stalePrepared2);
    assert.equal((await executeRefundProjectPurge({
        db, bucket: storage, eventId, actorUid: 'CEO-TEST', claims: { role: 'CEO' }, authorizationId: staleAuthorization2.authorizationId, authorizationToken: staleAuthorization2.authorizationToken
    })).status, 'PURGED');
    const demoId = nextId('DEMO');
    await db.doc(`eventos/${demoId}`).set({ demoMode: true });
    await assert.rejects(
        executeRefundProjectPurge({ db, bucket: storage, eventId: demoId, actorUid: 'CEO-TEST', claims: { role: 'CEO' }, refund: REFUND }),
        (error) => error.code === 'PURGE_RECORD_NOT_FOUND'
    );
    const unknownId = nextId('UNKNOWN');
    const unknownPath = `external/unknown-${unknownId}.webp`;
    const validPath = `eventos/${unknownId}/invitacion/media/cover/known.webp`;
    await seedEvent(unknownId, [validPath]);
    await db.doc(`eventos/${unknownId}/invitacion/config/media/MEDIA-UNKNOWN`).set({
        role: 'gallery', storagePath: unknownPath
    });
    const unknownPrepared = await prepare({ eventId: unknownId, bucket: new StorageMock([]), refundRecordId: `REF-${unknownId}-${encodeURIComponent(`${REFUND.refundReference}-${unknownId}`)}` });
    assert.equal(unknownPrepared.status, 'BLOCKED');
    assert.equal((await db.doc(`eventos/${unknownId}`).get()).exists, true);
});

test('la raíz tiene recuperación y el Final Record queda minimizado', async () => {
    const eventId = nextId('ROOT-RECOVERY');
    const path = `eventos/${eventId}/invitacion/media/cover/a.webp`;
    const storage = new StorageMock([path]);
    await seedEvent(eventId, [path]);
    const prepared = await prepare({ eventId, bucket: storage, refundRecordId: `REF-${eventId}-${encodeURIComponent(`${REFUND.refundReference}-${eventId}`)}` });
    const authorization = await authorize(eventId, prepared);
    await assert.rejects(executeRefundProjectPurge({ db, bucket: storage, eventId, actorUid: 'CEO-TEST', claims: { role: 'CEO' },
        authorizationId: authorization.authorizationId, authorizationToken: authorization.authorizationToken,
        testHooks: { afterRootDelete: () => { const error = new Error('checkpoint interruption'); error.code = 'CHECKPOINT_INTERRUPTED'; throw error; } } }));
    const interrupted = (await db.doc(`administrativePurgeRecords/PURGE-${eventId}`).get()).data();
    assert.equal(interrupted.status, 'FAILED_RETRYABLE');
    assert.equal(interrupted.checkpoint, 'ROOT_DELETED');
    const result = await executeRefundProjectPurge({ db, bucket: storage, eventId, actorUid: 'CEO-TEST', claims: { role: 'CEO' },
        authorizationId: authorization.authorizationId, authorizationToken: authorization.authorizationToken });
    assert.equal(result.status, 'PURGED');
    const finalRecord = (await db.doc(`administrativePurgeRecords/PURGE-${eventId}`).get()).data();
    assert.equal(finalRecord.status, 'PURGED');
    assert.equal('authorization' in finalRecord, false);
    assert.equal('storageDeletedPaths' in finalRecord, false);
    assert.equal((await db.doc(`administrativeRefundRecords/REF-${eventId}-${encodeURIComponent(`${REFUND.refundReference}-${eventId}`)}`).get()).exists, true);
});

test('guards y lock RSVP exigen emulador, Storage seguro y flag explícito', async () => {
    const storage = new StorageMock();
    const previousFirestore = process.env.FIRESTORE_EMULATOR_HOST;
    const previousFlag = process.env.EVENTORA_ALLOW_DESTRUCTIVE_EMULATOR_PURGE;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    assert.throws(() => assertDestructiveEmulatorEnvironment(storage), (error) => error.code === 'DESTRUCTIVE_PURGE_NOT_ALLOWED');
    process.env.FIRESTORE_EMULATOR_HOST = previousFirestore;
    delete process.env.EVENTORA_ALLOW_DESTRUCTIVE_EMULATOR_PURGE;
    assert.throws(() => assertDestructiveEmulatorEnvironment(storage), (error) => error.code === 'DESTRUCTIVE_PURGE_NOT_ALLOWED');
    process.env.EVENTORA_ALLOW_DESTRUCTIVE_EMULATOR_PURGE = previousFlag;
    const event = { purgeLock: { operationId: 'PURGE-lock' } };
    assert.equal(isEventPurgeLocked(event), true);
    assert.equal(isEventPurgeLocked({}), false);
});
