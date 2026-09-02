import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
    assertEmulatorEnvironment,
    prepareRefundPurgeDryRun
} from '../functions/src/purge/refund-purge-preparation.js';
import { confirmRefundRecord, recordRefundProcessed } from '../functions/src/purge/refund-records.js';

assertEmulatorEnvironment();

const PROJECT_ID = 'demo-eventorastudio-phase2e2a';
const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
const REFUND = {
    status: 'REFUNDED',
    refundReference: 'EV-REE-2030-0001',
    commercialFileReference: 'EV-COM-2030-0001',
    refundedAt: '2025-01-02T12:00:00.000Z',
    amount: 1000,
    currency: 'MXN',
    paymentMethod: 'SPEI',
    terminationIntent: 'COMPLETE_TERMINATION'
};
let seedCounter = 0;

before(async () => {
    await db.collection('administrativePurgeRecords').listDocuments();
});

after(async () => {
    await app.delete();
});

function eventId(label) {
    seedCounter += 1;
    return `E2E2A-${label}-${seedCounter}`;
}

function mockBucket(files = []) {
    return { getFiles: async () => [files.map((name) => ({ name }))] };
}

async function seedRefundRecord(eventId, overrides = {}) {
    const input = { ...REFUND, eventId, ...overrides };
    const recorded = await recordRefundProcessed({ db, input, actorUid: 'CEO-001', claims: { role: 'CEO' } });
    await confirmRefundRecord({ db, refundRecordId: recorded.refundRecordId, actorUid: 'CEO-001', claims: { role: 'CEO' } });
    return recorded.refundRecordId;
}

async function seedNormal(id, { unknownMedia = false } = {}) {
    const event = db.doc(`eventos/${id}`);
    await event.set({ demoMode: false, estado: 'activo' });
    await event.collection('invitados').doc('GUEST-001').set({ nombre: 'No debe salir en manifest' });
    await event.collection('checkins').doc('CHECK-001').set({ invitadoId: 'GUEST-001' });
    await event.collection('rsvpAccess').doc('SECRET-RSVP-TOKEN').set({ guestId: 'GUEST-001' });
    await event.collection('rsvpPublic').doc('CFG-001').set({ eventId: id });
    await event.collection('rsvpResponses').doc('SECRET-RESPONSE-TOKEN').set({ guestId: 'GUEST-001' });
    await event.collection('rsvpState').doc('GUEST-001').set({ guestId: 'GUEST-001' });
    await event.collection('rsvpConflicts').doc('CONFLICT-001').set({ guestId: 'GUEST-001' });
    await event.collection('invitacion').doc('draft').set({ content: { identity: { primaryName: 'Privado' } } });
    await event.collection('invitacion').doc('publication').set({ currentRevisionId: 'REV-000001' });
    await event.collection('invitacion').doc('publication').collection('revisions').doc('REV-000001').set({ content: { identity: { primaryName: 'Privado' } } });
    await event.collection('invitacionPublic').doc('a'.repeat(48)).set({ content: { identity: { primaryName: 'Privado' } } });
    const ownPath = `eventos/${id}/invitacion/media/gallery/MED-LOCAL-001-abcdefabcdef.jpg`;
    const sharedPath = 'demo-library/DML-sharedasset-abcdefabcdef.jpg';
    const unknownPath = `external-bucket/MED-LOCAL-002-fedcbafedcba.jpg`;
    await event.collection('invitacion').doc('config').set({ mediaIndex: { galleryIds: ['MED-LOCAL-001'] } });
    await event.collection('invitacion').doc('config').collection('media').doc('MED-LOCAL-001').set({
        id: 'MED-LOCAL-001', role: 'gallery', storagePath: ownPath, objectVersion: 'abcdefabcdef'
    });
    await event.collection('invitacion').doc('config').collection('media').doc('MED-LOCAL-003').set({
        id: 'MED-LOCAL-003', role: 'gallery', storagePath: sharedPath, objectVersion: 'abcdefabcdef', sharedDemoAssetId: 'DML-sharedasset'
    });
    if (unknownMedia) {
        await event.collection('invitacion').doc('config').collection('media').doc('MED-LOCAL-002').set({
            id: 'MED-LOCAL-002', role: 'gallery', storagePath: unknownPath, objectVersion: 'fedcbafedcba'
        });
    }
    await db.collection('usuarios').doc(`USER-${id}`).set({ eventosPermitidos: [id] });
    return { ownPath, sharedPath, unknownPath };
}

test('CEO prepara dry-run, genera manifest técnico e idempotencia sin borrar recursos', async () => {
    const id = eventId('NORMAL');
    const paths = await seedNormal(id);
    const refundRecordId = await seedRefundRecord(id);
    const result = await prepareRefundPurgeDryRun({
        db,
        bucket: mockBucket([paths.ownPath]),
        eventId: id,
        actorUid: 'CEO-001',
        claims: { role: 'CEO' },
        refundRecordId,
        now: new Date('2030-01-03T12:00:00.000Z')
    });
    assert.equal(result.status, 'DRY_RUN_READY');
    assert.equal(result.counts.invitados, 1);
    assert.equal(result.counts.rsvpAccess, 1);
    assert.equal(result.counts.revisions, 1);
    assert.equal(result.counts.profileReferences, 1);
    assert.equal(result.counts.sharedDemoReferences, 1);
    const manifestText = JSON.stringify(result.manifest);
    assert.doesNotMatch(manifestText, /No debe salir|SECRET-RSVP-TOKEN|SECRET-RESPONSE-TOKEN|qrToken|rsvpToken/);
    assert.ok(manifestText.includes(paths.ownPath));
    assert.ok(manifestText.includes('DETACH_ONLY'));

    const repeated = await prepareRefundPurgeDryRun({
        db, bucket: mockBucket([paths.ownPath]), eventId: id, actorUid: 'CEO-001', claims: { role: 'CEO' }, refundRecordId
    });
    assert.equal(repeated.idempotent, true);
    assert.equal(repeated.status, 'DRY_RUN_READY');
    assert.equal((await db.doc(`eventos/${id}`).get()).exists, true);
    assert.equal((await db.doc(`eventos/${id}/invitados/GUEST-001`).get()).exists, true);
    assert.equal((await db.doc(`eventos/${id}/invitacionPublic/${'a'.repeat(48)}`).get()).exists, true);
});

test('autorización y precondiciones bloquean sin tocar el evento', async () => {
    const demoId = eventId('DEMO');
    await db.doc(`eventos/${demoId}`).set({ demoMode: true });
    const demoRefundRecordId = await seedRefundRecord(demoId);
    await assert.rejects(
        prepareRefundPurgeDryRun({ db, bucket: mockBucket(), eventId: demoId, actorUid: 'CEO-001', claims: { role: 'CEO' }, refundRecordId: demoRefundRecordId }),
        (error) => error.code === 'DEMO_PURGE_BLOCKED'
    );
    const normalId = eventId('NOREFUND');
    await db.doc(`eventos/${normalId}`).set({ demoMode: false });
    await assert.rejects(
        prepareRefundPurgeDryRun({ db, bucket: mockBucket(), eventId: normalId, actorUid: 'ADMIN-001', claims: { role: 'ADMIN' }, refund: REFUND }),
        (error) => error.code === 'UNAUTHORIZED'
    );
    await assert.rejects(
        prepareRefundPurgeDryRun({ db, bucket: mockBucket(), eventId: normalId, actorUid: 'CEO-001', claims: { role: 'CEO' }, refund: REFUND }),
        (error) => error.code === 'REFUND_EVIDENCE_NOT_PRODUCTION_READY'
    );
});

test('asset desconocido bloquea el dry-run y conserva todos los documentos', async () => {
    const id = eventId('UNKNOWN');
    const paths = await seedNormal(id, { unknownMedia: true });
    const refundRecordId = await seedRefundRecord(id);
    const result = await prepareRefundPurgeDryRun({
        db, bucket: mockBucket([paths.ownPath, paths.unknownPath]), eventId: id,
        actorUid: 'CEO-001', claims: { userRole: 'CEO' }, refundRecordId
    });
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.blockers.some((blocker) => blocker.code === 'UNKNOWN_STORAGE_ASSET'));
    assert.equal((await db.doc(`eventos/${id}/invitacion/config/media/MED-LOCAL-002`).get()).exists, true);
    assert.equal((await db.doc(`eventos/${id}/rsvpAccess/SECRET-RSVP-TOKEN`).get()).exists, true);
});
