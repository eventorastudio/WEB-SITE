import {
    REFUND_PURGE_SCHEMA_VERSION,
    buildRefundPurgeInventory,
    createRefundPurgeManifest,
    purgeRecordId,
    createEventSafetyHash
} from './refund-purge-preparation.js';
import { buildRefundEvidenceHash, getConfirmedRefundRecord } from './refund-records.js';
import { hashPurgeManifest } from './refund-purge-authorization.js';
import { assertProductionPurgeGate } from './production-purge-gate.js';
import {
    globalLockExpiresAt,
    globalLockIsRecoverable,
    purgeGlobalLockReference,
} from './write-freeze.js';

export const DESTRUCTIVE_PURGE_STEPS = Object.freeze([
    'PUBLIC_ACCESS', 'FIRESTORE_PURGING', 'STORAGE_PURGING', 'MEDIA_METADATA',
    'PROFILES', 'ROOT', 'VERIFYING'
]);

const ALLOWED_EMULATOR_PROJECTS = new Set([
    'demo-eventorastudio-phase2e2a',
    'demo-eventorastudio-phase2e2b'
]);
const ACTIVE_STATUSES = new Set([
    'PURGE_PENDING', 'FIRESTORE_PURGING', 'STORAGE_PURGING', 'VERIFYING'
]);
const OWN_STORAGE_PREFIX = (eventId) => `eventos/${eventId}/invitacion/media/`;
const CHUNK_SIZE = 400;

function assertStageGate(testHooks, stage) {
    const hasTestOverride = typeof testHooks?.allowDestructiveStage === 'function';
    const allowEmulatorOverride = hasTestOverride
        ? testHooks.allowDestructiveStage(stage) === true
        : process.env.EVENTORA_ALLOW_DESTRUCTIVE_EMULATOR_PURGE === 'true';
    assertProductionPurgeGate({ allowEmulatorOverride });
}

function purgeError(code, details = {}) {
    const error = new Error(code);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function assertLocalHost(value) {
    const host = String(value ?? '');
    return /^(127\.0\.0\.1|localhost|::1):\d+$/.test(host);
}

function projectIdFromEnvironment() {
    if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
    try {
        return JSON.parse(process.env.FIREBASE_CONFIG ?? '{}').projectId ?? '';
    } catch {
        return '';
    }
}

export function assertDestructiveEmulatorEnvironment(bucket) {
    const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST
        ?? process.env.STORAGE_EMULATOR_HOST;
    const storageMock = bucket?.__eventoraStorageEmulatorMock === true;
    if (!assertLocalHost(process.env.FIRESTORE_EMULATOR_HOST)
        || process.env.EVENTORA_ALLOW_DESTRUCTIVE_EMULATOR_PURGE !== 'true'
        || !ALLOWED_EMULATOR_PROJECTS.has(projectIdFromEnvironment())
        || (!storageMock && !assertLocalHost(storageHost))) {
        throw purgeError('DESTRUCTIVE_PURGE_NOT_ALLOWED');
    }
}

function assertEventId(eventId) {
    const value = String(eventId ?? '');
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(value)) throw purgeError('INVALID_EVENT_ID');
    return value;
}

function assertRefundEvidence(refund) {
    const value = refund ?? {};
    if (value.status !== 'REFUNDED') throw purgeError('REFUND_NOT_CONFIRMED');
    for (const [field, code] of [
        ['refundReference', 'REFUND_REFERENCE_MISSING'],
        ['commercialFileReference', 'COMMERCIAL_RECORD_MISSING']
    ]) {
        if (!/^[A-Za-z0-9._:/-]{1,240}$/.test(String(value[field] ?? '').trim())) {
            throw purgeError(code);
        }
    }
    if (!(value.refundedAt instanceof Date && !Number.isNaN(value.refundedAt.getTime()))
        && !(typeof value.refundedAt === 'string' && !Number.isNaN(Date.parse(value.refundedAt)))
        && !Number.isFinite(value.refundedAt?.seconds ?? value.refundedAt?._seconds)) {
        throw purgeError('REFUNDED_AT_MISSING');
    }
    return {
        status: 'REFUNDED',
        refundReference: String(value.refundReference).trim(),
        commercialFileReference: String(value.commercialFileReference).trim(),
        refundedAt: value.refundedAt
    };
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    }
    return value;
}

function sameManifest(left, right) {
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function manifestWithoutGenerations(manifest = {}) {
    return {
        ...manifest,
        storage: (manifest.storage ?? []).map(({ generation, ...item }) => item)
    };
}

function manifestFromInventory(inventory) {
    return createRefundPurgeManifest(inventory);
}

function assertManifestReady(record) {
    if (record.purgeSchemaVersion !== REFUND_PURGE_SCHEMA_VERSION
        || record.manifest?.manifestVersion !== REFUND_PURGE_SCHEMA_VERSION) {
        throw purgeError('MANIFEST_VERSION_UNSUPPORTED');
    }
    if (record.blockers?.length) throw purgeError('MANIFEST_BLOCKED');
    if (record.manifest?.sharedDemoReferences?.some((item) => item.action !== 'DETACH_ONLY')) {
        throw purgeError('SHARED_DEMO_DELETE_BLOCKED');
    }
    for (const item of record.manifest?.storage ?? []) {
        if (item.classification === 'UNKNOWN') throw purgeError('UNKNOWN_STORAGE_ASSET');
        if (item.classification === 'ORPHAN_CANDIDATE') throw purgeError('BLOCKED_ORPHAN_ASSET');
        if (item.classification !== 'OWN_EVENT') throw purgeError(
            item.classification === 'SHARED_DEMO' ? 'SHARED_DEMO_DELETE_BLOCKED' : 'BLOCKED_ORPHAN_ASSET'
        );
    }
}

function isTrustedOperatorExecution(context) {
    return context?.executionMode === 'OPERATOR_IAM'
        && context?.adapter === 'refund-purge-service'
        && context?.authenticatedBy === 'cloud-run-iam';
}

function assertAuthorizationBinding({ record, authorizationId, authorizationToken, actorUid, now, trustedExecution = false }) {
    const authorization = record.authorization ?? {};
    if (!authorizationId || authorization.authorizationId !== authorizationId) throw purgeError('AUTHORIZATION_MISMATCH');
    if (authorization.commercialFileReference !== record.commercialFileReference) {
        throw purgeError('AUTHORIZATION_BINDING_MISMATCH');
    }
    if (authorization.actorUid !== actorUid || authorization.eventId !== record.originalEventId
        || authorization.operationId !== record.operationId
        || authorization.manifestHash !== record.manifestHash
        || authorization.refundEvidenceHash !== record.refundEvidenceHash
        || authorization.refundRecordId !== record.refundRecordId) {
        throw purgeError('AUTHORIZATION_MISMATCH');
    }
    if (authorization.used !== false) throw purgeError('AUTHORIZATION_ALREADY_USED');
    if (!(authorization.expiresAt?.toDate?.()?.getTime?.() > now.getTime())) throw purgeError('AUTHORIZATION_EXPIRED');
    if (!trustedExecution && authorization.authorizationTokenHash !== hashPurgeManifest({ authorizationToken })) {
        throw purgeError('AUTHORIZATION_INVALID');
    }
    return authorization;
}

async function assertConfirmedTerminationRefund({ db, record, eventId }) {
    if (!record.refundRecordId) throw purgeError('REFUND_EVIDENCE_NOT_PRODUCTION_READY');
    const confirmed = await getConfirmedRefundRecord({
        db, refundRecordId: record.refundRecordId, eventId, allowLinked: true
    });
    if (confirmed.record.terminationIntent !== 'COMPLETE_TERMINATION') {
        throw purgeError(confirmed.record.terminationIntent === 'SERVICE_CONTINUES'
            ? 'REFUND_DOES_NOT_TERMINATE_SERVICE' : 'REFUND_EVIDENCE_NOT_PRODUCTION_READY');
    }
    if (confirmed.record.linkedPurgeOperationId !== record.operationId
        || confirmed.record.refundReference !== record.refundReference
        || confirmed.record.commercialFileReference !== record.commercialFileReference
        || buildRefundEvidenceHash(confirmed.record) !== record.refundEvidenceHash) {
        throw purgeError('REFUND_EVIDENCE_STALE');
    }
    return confirmed.record;
}

async function assertEventSafety({ eventReference, record }) {
    const snapshot = await eventReference.get();
    if (!snapshot.exists) throw purgeError('EVENT_NOT_FOUND');
    if (snapshot.data()?.demoMode === true) throw purgeError('DEMO_PURGE_BLOCKED');
    if (record.eventSafetyHash && record.eventSafetyHash !== createEventSafetyHash(snapshot.data())) {
        throw purgeError('EVENT_SAFETY_STALE');
    }
    return snapshot;
}

async function deleteCollection(collectionReference) {
    let deleted = 0;
    while (true) {
        const snapshot = await collectionReference.limit(CHUNK_SIZE).get();
        if (snapshot.empty) return deleted;
        for (let offset = 0; offset < snapshot.docs.length; offset += CHUNK_SIZE) {
            const batch = collectionReference.firestore.batch();
            snapshot.docs.slice(offset, offset + CHUNK_SIZE).forEach((document) => batch.delete(document.ref));
            await batch.commit();
            deleted += Math.min(CHUNK_SIZE, snapshot.docs.length - offset);
        }
    }
}

async function deleteDocument(documentReference) {
    await documentReference.delete();
}

async function updateRecord(recordReference, patch) {
    await recordReference.set({ ...patch, updatedAt: new Date() }, { merge: true });
}

async function acquirePurgeLock({ db, eventId, actorUid, authorizationId, authorizationToken, trustedExecution = false, now = new Date() }) {
    const recordReference = db.collection('administrativePurgeRecords').doc(purgeRecordId(eventId));
    const eventReference = db.doc(`eventos/${eventId}`);
    const globalReference = purgeGlobalLockReference(db);
    return db.runTransaction(async (transaction) => {
        const [recordSnapshot, eventSnapshot, globalSnapshot] = await Promise.all([
            transaction.get(recordReference),
            transaction.get(eventReference),
            transaction.get(globalReference)
        ]);
        if (!recordSnapshot.exists) throw purgeError('PURGE_RECORD_NOT_FOUND');
        const record = recordSnapshot.data();
        if (record.status === 'PURGED') return { recordReference, eventReference, record, alreadyPurged: true };
        if (record.status === 'FAILED_RETRYABLE' && record.checkpoint === 'ROOT_DELETED') {
            if (!record.authorization?.authorizationId || record.authorization.authorizationId !== authorizationId
                || record.authorization.actorUid !== actorUid || record.authorization.used !== true) {
                throw purgeError('AUTHORIZATION_MISMATCH');
            }
            return { recordReference, eventReference, record, rootDeleted: true, alreadyPurged: false };
        }
        if (ACTIVE_STATUSES.has(record.status)) {
            if (record.checkpoint === 'ROOT_DELETE_READY'
                && globalLockIsRecoverable(globalSnapshot.data(), record.operationId, eventId)
                && record.authorization?.authorizationId === authorizationId
                && record.authorization?.actorUid === actorUid) {
                return { recordReference, eventReference, record, alreadyPurged: false };
            }
            throw purgeError('PURGE_ALREADY_RUNNING');
        }
        if (!['READY_FOR_EXECUTION', 'FAILED_RETRYABLE'].includes(record.status)) {
            throw purgeError('PURGE_NOT_READY');
        }
        if (!eventSnapshot.exists) throw purgeError('EVENT_NOT_FOUND');
        if (eventSnapshot.data()?.demoMode === true) throw purgeError('DEMO_PURGE_BLOCKED');
        const globalLock = globalSnapshot.exists ? globalSnapshot.data() : null;
        if (globalLock && !globalLockIsRecoverable(globalLock, record.operationId, eventId)) {
            const leaseExpired = !(globalLock.leaseExpiresAt?.toDate?.()?.getTime?.() > now.getTime());
            if (!leaseExpired || !['PURGED', 'BLOCKED'].includes(record.status)) {
                throw purgeError('GLOBAL_PURGE_ALREADY_RUNNING');
            }
        }
        if (record.eventSafetyHash && record.eventSafetyHash !== createEventSafetyHash(eventSnapshot.data())) {
            throw purgeError('EVENT_SAFETY_STALE');
        }
        await getConfirmedRefundRecord({
            db, refundRecordId: record.refundRecordId, eventId, transaction, allowLinked: true
        }).then(({ record: refundRecord }) => {
            if (refundRecord.terminationIntent !== 'COMPLETE_TERMINATION'
                || refundRecord.linkedPurgeOperationId !== record.operationId
                || buildRefundEvidenceHash(refundRecord) !== record.refundEvidenceHash) {
                throw purgeError('REFUND_EVIDENCE_STALE');
            }
        });
        if (record.status === 'READY_FOR_EXECUTION') {
            assertAuthorizationBinding({ record, authorizationId, authorizationToken, actorUid, now, trustedExecution });
        } else if (record.authorization?.used !== true) {
            throw purgeError('AUTHORIZATION_MISMATCH');
        }
        transaction.update(eventReference, {
            purgeLock: {
                operationId: record.operationId,
                status: 'PURGE_PENDING',
                acquiredAt: now,
                lockedBy: actorUid
            }
        });
        transaction.set(globalReference, {
            operationId: record.operationId,
            eventId,
            acquiredBy: actorUid,
            acquiredAt: globalLock?.acquiredAt ?? now,
            leaseExpiresAt: globalLockExpiresAt(now),
            lockVersion: Number(globalLock?.lockVersion ?? 0) + 1
        });
        transaction.update(recordReference, {
            status: 'PURGE_PENDING',
            checkpoint: record.checkpoint ?? 'PUBLIC_ACCESS',
            purgeStartedAt: record.purgeStartedAt ?? now,
            performedBy: actorUid,
            updatedAt: new Date()
        });
        if (record.status === 'READY_FOR_EXECUTION') {
            transaction.update(recordReference, {
                authorization: { ...record.authorization, used: true, usedAt: now }
            });
        }
        return { recordReference, eventReference, record, alreadyPurged: false };
    });
}

async function releasePurgeLock(eventReference) {
    await eventReference.update({ purgeLock: null }).catch(() => undefined);
}

async function releaseGlobalPurgeLock({ db, eventId, operationId }) {
    const reference = purgeGlobalLockReference(db);
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (snapshot.exists && globalLockIsRecoverable(snapshot.data(), operationId, eventId)) {
            transaction.delete(reference);
        }
    }).catch(() => undefined);
}

async function renewGlobalPurgeLock({ db, eventId, operationId, now = new Date() }) {
    const reference = purgeGlobalLockReference(db);
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists || !globalLockIsRecoverable(snapshot.data(), operationId, eventId)) {
            throw purgeError('GLOBAL_PURGE_ALREADY_RUNNING');
        }
        transaction.update(reference, { leaseExpiresAt: globalLockExpiresAt(now) });
    });
}

async function revalidateManifest({ db, bucket, eventId, record, eventReference }) {
    const inventory = await buildRefundPurgeInventory({ db, bucket, eventReference, eventId });
    const currentManifest = manifestFromInventory(inventory);
    if (!sameManifest(manifestWithoutGenerations(record.manifest), manifestWithoutGenerations(currentManifest))) {
        throw purgeError('MANIFEST_STALE');
    }
    if (inventory.blockers.length) throw purgeError('MANIFEST_BLOCKED');
    return inventory;
}

function storagePathForDeletion(path, eventId) {
    const value = String(path ?? '');
    const prefix = OWN_STORAGE_PREFIX(eventId);
    if (!value.startsWith(prefix) || value.includes('..') || value.includes('\\')) {
        throw purgeError('STORAGE_PATH_OUTSIDE_EVENT_PREFIX');
    }
    return value;
}

async function deleteStorageManifest({ bucket, eventId, recordReference, record }) {
    const paths = (record.manifest?.storage ?? []).map((item) => ({
        path: storagePathForDeletion(item.storagePath, eventId),
        classification: item.classification,
        generation: item.generation
    }));
    const deletedPaths = new Set(record.storageDeletedPaths ?? []);
    for (const item of paths) {
        if (item.classification !== 'OWN_EVENT') throw purgeError(
            item.classification === 'SHARED_DEMO' ? 'SHARED_DEMO_DELETE_BLOCKED' : 'BLOCKED_ORPHAN_ASSET'
        );
        if (!/^\d+$/.test(String(item.generation ?? ''))) throw purgeError('STORAGE_GENERATION_MISSING');
        if (deletedPaths.has(item.path)) continue;
        if (!item.path || !item.path.startsWith(OWN_STORAGE_PREFIX(eventId))
            || item.path.includes('..') || item.path.includes('\\') || item.path.startsWith('/')
            || item.path.startsWith('demo-library/')) {
            throw purgeError('STORAGE_PATH_OUTSIDE_EVENT_PREFIX');
        }
        const file = bucket.file(item.path);
        try {
            await file.delete({ ifGenerationMatch: String(item.generation) });
        } catch (error) {
            if (String(error?.code) === '404' || error?.code === 'not-found') {
                // The manifest proves that this exact path/generation was authorized.
            } else if (String(error?.code) === '412' || error?.code === 'precondition-failed') {
                throw purgeError('GENERATION_MISMATCH');
            } else throw purgeError('STORAGE_DELETE_FAILED', { cause: error });
        }
        deletedPaths.add(item.path);
        await updateRecord(recordReference, { storageDeletedPaths: [...deletedPaths], checkpoint: 'STORAGE_PURGING' });
    }
    return [...deletedPaths];
}

async function detachProfiles(db, eventId) {
    const snapshot = await db.collection('usuarios').get();
    for (let offset = 0; offset < snapshot.docs.length; offset += CHUNK_SIZE) {
        const batch = db.batch();
        let updates = 0;
        snapshot.docs.slice(offset, offset + CHUNK_SIZE).forEach((profile) => {
            const data = profile.data();
            if (!Array.isArray(data.eventosPermitidos) || !data.eventosPermitidos.includes(eventId)) return;
            batch.update(profile.ref, {
                eventosPermitidos: data.eventosPermitidos.filter((value) => value !== eventId)
            });
            updates += 1;
        });
        if (updates) await batch.commit();
    }
}

async function deleteFirestoreOperational({ eventReference }) {
    await deleteCollection(eventReference.collection('invitacionPublic'));
    for (const collectionName of ['rsvpAccess', 'rsvpPublic', 'rsvpResponses', 'rsvpState', 'rsvpConflicts']) {
        await deleteCollection(eventReference.collection(collectionName));
    }
    await deleteCollection(eventReference.collection('invitados'));
    await deleteCollection(eventReference.collection('checkins'));
    await deleteDocument(eventReference.collection('invitacion').doc('rsvp'));
    await deleteDocument(eventReference.collection('invitacion').doc('rsvpPublication'));
}

async function deleteInvitationAndMediaMetadata({ eventReference }) {
    const invitation = eventReference.collection('invitacion');
    await deleteCollection(invitation.doc('publication').collection('revisions'));
    await deleteCollection(invitation.doc('config').collection('media'));
    await deleteCollection(invitation);
}

async function deleteRootAtomically({ db, eventReference, recordReference, operationId, eventId, now }) {
    await db.runTransaction(async (transaction) => {
        const [recordSnapshot, eventSnapshot] = await Promise.all([
            transaction.get(recordReference),
            transaction.get(eventReference)
        ]);
        if (!recordSnapshot.exists || recordSnapshot.data()?.operationId !== operationId
            || recordSnapshot.data()?.checkpoint !== 'ROOT_DELETE_READY') {
            throw purgeError('ROOT_DELETE_STATE_MISMATCH');
        }
        if (!eventSnapshot.exists) throw purgeError('ROOT_MISSING_UNEXPECTED');
        if (eventSnapshot.data()?.purgeLock?.operationId !== operationId) {
            throw purgeError('ROOT_DELETE_LOCK_MISMATCH');
        }
        transaction.delete(eventReference);
        transaction.update(recordReference, {
            status: 'VERIFYING',
            checkpoint: 'ROOT_DELETED',
            rootDeletedAt: now,
            updatedAt: now
        });
    });
}

async function assertNoUnexpectedEventData(eventReference) {
    const collections = await eventReference.listCollections();
    for (const collection of collections) {
        const remaining = await collection.limit(1).get();
        if (!remaining.empty) throw purgeError('UNEXPECTED_DATA_REMAINS');
    }
}

async function assertPostRootEmpty(eventReference) {
    try {
        await assertNoUnexpectedEventData(eventReference);
    } catch (error) {
        throw purgeError('POST_ROOT_RESIDUAL_DATA', { cause: error });
    }
}

async function verifyPurge({ db, bucket, eventId, eventReference, record, rootMustBeAbsent = true }) {
    const counts = {};
    for (const collectionName of ['invitados', 'checkins', 'rsvpAccess', 'rsvpPublic', 'rsvpResponses', 'rsvpState', 'rsvpConflicts', 'invitacionPublic']) {
        counts[collectionName] = (await eventReference.collection(collectionName).limit(1).get()).size;
    }
    const invitation = eventReference.collection('invitacion');
    for (const documentName of ['config', 'draft', 'rsvp', 'rsvpPublication', 'publication']) {
        counts[`invitacion_${documentName}`] = (await invitation.doc(documentName).get()).exists ? 1 : 0;
    }
    counts.revisions = (await invitation.doc('publication').collection('revisions').limit(1).get()).size;
    const storageFiles = await bucket.getFiles({ prefix: OWN_STORAGE_PREFIX(eventId) });
    counts.storageOwnEvent = (storageFiles[0] ?? []).filter((file) => String(file.name).startsWith(OWN_STORAGE_PREFIX(eventId))).length;
    const profiles = await db.collection('usuarios').get();
    counts.profileReferences = profiles.docs.filter((profile) => profile.data()?.eventosPermitidos?.includes(eventId)).length;
    const rootSnapshot = await eventReference.get();
    counts.root = rootSnapshot.exists ? 1 : 0;
    const residual = Object.entries(counts).some(([key, value]) => key === 'root'
        ? (rootMustBeAbsent ? value !== 0 : value !== 1)
        : value !== 0);
    if (residual) throw purgeError(rootMustBeAbsent ? 'VERIFY_FAILED' : 'PRE_ROOT_VERIFY_FAILED', { counts });
    const sharedDemo = (record.manifest?.sharedDemoReferences ?? []).map((item) => item.storagePath).filter(Boolean);
    for (const path of sharedDemo) {
        const [exists] = await bucket.file(path).exists();
        if (!exists) throw purgeError('SHARED_DEMO_VERIFY_FAILED');
    }
    return Object.freeze(counts);
}

async function minimizeFinalRecord({ recordReference, record, verification, now }) {
    await recordReference.set({
        originalEventId: record.originalEventId,
        operationId: record.operationId,
        refundRecordId: record.refundRecordId,
        commercialFileReference: record.commercialFileReference,
        status: 'PURGED',
        purgeSchemaVersion: REFUND_PURGE_SCHEMA_VERSION,
        manifestHash: record.manifestHash,
        refundEvidenceHash: record.refundEvidenceHash,
        terminationIntent: 'COMPLETE_TERMINATION',
        performedBy: record.performedBy,
        purgeStartedAt: record.purgeStartedAt,
        purgedAt: now,
        counts: record.counts,
        verification,
        updatedAt: now
    });
}

export async function executeRefundProjectPurge({
    db, bucket, eventId, actorUid, claims, authorizationId, authorizationToken,
    trustedExecutionContext = null, testHooks = {}
}) {
    assertDestructiveEmulatorEnvironment(bucket);
    const trustedExecution = isTrustedOperatorExecution(trustedExecutionContext);
    if (!trustedExecution && !(claims?.role === 'CEO' || claims?.userRole === 'CEO')) throw purgeError('UNAUTHORIZED');
    const safeEventId = assertEventId(eventId);
    const recordReference = db.collection('administrativePurgeRecords').doc(purgeRecordId(safeEventId));
    const eventReference = db.doc(`eventos/${safeEventId}`);
    const existingRecord = await recordReference.get();
    if (existingRecord.exists && existingRecord.data()?.status === 'PURGED') {
        return Object.freeze({ status: 'ALREADY_PURGED', eventId: safeEventId });
    }
    if (!existingRecord.exists) throw purgeError('PURGE_RECORD_NOT_FOUND');
    let record = existingRecord.data();
    const effectiveActorUid = trustedExecution
        ? String(record.authorization?.actorUid ?? '')
        : actorUid;
    const effectiveAuthorizationId = trustedExecution
        ? record.authorization?.authorizationId
        : authorizationId;
    if (trustedExecution && (!effectiveActorUid || !effectiveAuthorizationId)) {
        throw purgeError('AUTHORIZATION_MISMATCH');
    }
    if (record.status === 'DRY_RUN_READY' && !effectiveAuthorizationId) throw purgeError('AUTHORIZATION_REQUIRED');
    if (record.status === 'READY_FOR_EXECUTION' && !effectiveAuthorizationId) throw purgeError('AUTHORIZATION_REQUIRED');
    if (record.status === 'DRY_RUN_READY') throw purgeError('PURGE_NOT_READY');
    if (['FAILED_RETRYABLE', 'BLOCKED', 'VERIFYING'].includes(record.status) && record.checkpoint === 'ROOT_DELETED'
        && !record.blockers?.some((item) => ['POST_ROOT_RESIDUAL_DATA', 'VERIFY_FAILED'].includes(item.code))) {
        if (record.authorization?.authorizationId !== effectiveAuthorizationId || record.authorization?.actorUid !== effectiveActorUid) {
            throw purgeError('AUTHORIZATION_MISMATCH');
        }
        try {
            const verification = await verifyPurge({ db, bucket, eventId: safeEventId, eventReference, record });
            await minimizeFinalRecord({ recordReference, record, verification, now: new Date() });
            await releaseGlobalPurgeLock({ db, eventId: safeEventId, operationId: record.operationId });
            return Object.freeze({ status: 'PURGED', eventId: safeEventId, verification });
        } catch (error) {
            await updateRecord(recordReference, {
                status: 'BLOCKED', checkpoint: 'ROOT_DELETED', lastError: { code: String(error?.code ?? 'POST_ROOT_VERIFY_FAILED') }
            });
            throw error;
        }
    }
    assertStageGate(testHooks, 'OPERATION_START');
    if (record.checkpoint !== 'ROOT_DELETE_READY') {
        const preflightEvent = await eventReference.get();
        if (!preflightEvent.exists) throw purgeError('EVENT_NOT_FOUND');
        if (preflightEvent.data()?.demoMode === true) throw purgeError('DEMO_PURGE_BLOCKED');
    }
    const lock = await acquirePurgeLock({
        db, eventId: safeEventId, actorUid: effectiveActorUid,
        authorizationId: effectiveAuthorizationId, authorizationToken, trustedExecution
    });
    if (lock.alreadyPurged) return Object.freeze({ status: 'ALREADY_PURGED', eventId: safeEventId });
    const { recordReference: lockedRecordReference } = lock;
    record = (await lockedRecordReference.get()).data();
    let rootDeleted = false;
    let destructionStarted = false;
    try {
        assertManifestReady(record);
        await assertConfirmedTerminationRefund({ db, record, eventId: safeEventId });
        if (record.checkpoint !== 'ROOT_DELETE_READY') {
            await assertEventSafety({ eventReference, record });
        }
        if (record.checkpoint === 'PUBLIC_ACCESS' || record.checkpoint === 'PRECONDITIONS_VALIDATED') {
            await revalidateManifest({ db, bucket, eventId: safeEventId, record, eventReference });
        }
        if (record.checkpoint === 'PUBLIC_ACCESS' || record.checkpoint === 'PRECONDITIONS_VALIDATED') {
            assertStageGate(testHooks, 'FIRESTORE_PURGING');
            await updateRecord(lockedRecordReference, { checkpoint: 'PRECONDITIONS_VALIDATED' });
            await renewGlobalPurgeLock({ db, eventId: safeEventId, operationId: record.operationId });
            destructionStarted = true;
            await deleteFirestoreOperational({ eventReference });
            record = { ...record, checkpoint: 'FIRESTORE_PURGING' };
        }
        if (record.checkpoint === 'FIRESTORE_PURGING') {
            assertStageGate(testHooks, 'STORAGE_PURGING');
            await updateRecord(lockedRecordReference, { status: 'STORAGE_PURGING', checkpoint: 'STORAGE_PURGING' });
            record = { ...record, checkpoint: 'STORAGE_PURGING' };
        }
        if (record.checkpoint === 'STORAGE_PURGING') {
            await renewGlobalPurgeLock({ db, eventId: safeEventId, operationId: record.operationId });
            destructionStarted = true;
            await deleteStorageManifest({ bucket, eventId: safeEventId, recordReference: lockedRecordReference, record });
            await updateRecord(lockedRecordReference, { status: 'MEDIA_METADATA', checkpoint: 'MEDIA_METADATA' });
            record = { ...record, checkpoint: 'MEDIA_METADATA' };
        }
        if (record.checkpoint === 'MEDIA_METADATA') {
            assertStageGate(testHooks, 'MEDIA_METADATA');
            await renewGlobalPurgeLock({ db, eventId: safeEventId, operationId: record.operationId });
            await deleteInvitationAndMediaMetadata({ eventReference });
            await updateRecord(lockedRecordReference, { status: 'PROFILES', checkpoint: 'PROFILES' });
            record = { ...record, checkpoint: 'PROFILES' };
        }
        if (record.checkpoint === 'PROFILES') {
            assertStageGate(testHooks, 'PROFILES');
            await renewGlobalPurgeLock({ db, eventId: safeEventId, operationId: record.operationId });
            await detachProfiles(db, safeEventId);
            await updateRecord(lockedRecordReference, { status: 'FIRESTORE_PURGING', checkpoint: 'ROOT' });
            record = { ...record, checkpoint: 'ROOT' };
        }
        if (record.checkpoint === 'ROOT' || record.checkpoint === 'ROOT_DELETE_READY') {
            assertStageGate(testHooks, 'ROOT');
            await renewGlobalPurgeLock({ db, eventId: safeEventId, operationId: record.operationId });
            if (record.checkpoint === 'ROOT') {
                await assertNoUnexpectedEventData(eventReference);
                await verifyPurge({ db, bucket, eventId: safeEventId, eventReference, record, rootMustBeAbsent: false });
                await updateRecord(lockedRecordReference, { checkpoint: 'ROOT_DELETE_READY' });
            }
            await deleteRootAtomically({
                db, eventReference, recordReference: lockedRecordReference,
                operationId: record.operationId, eventId: safeEventId, now: new Date()
            });
            rootDeleted = true;
            record = { ...record, status: 'VERIFYING', checkpoint: 'ROOT_DELETED' };
            if (typeof testHooks.afterRootDelete === 'function') await testHooks.afterRootDelete({ db, eventId: safeEventId });
        }
        const verification = await verifyPurge({ db, bucket, eventId: safeEventId, eventReference, record });
        await assertPostRootEmpty(eventReference);
        await minimizeFinalRecord({ recordReference: lockedRecordReference, record, verification, now: new Date() });
        await releaseGlobalPurgeLock({ db, eventId: safeEventId, operationId: record.operationId });
        return Object.freeze({ status: 'PURGED', eventId: safeEventId, verification });
    } catch (error) {
        const code = String(error?.code ?? 'PURGE_FAILED');
        const postRoot = rootDeleted || record.checkpoint === 'ROOT_DELETED';
        const blocker = new Set([
            'MANIFEST_STALE', 'MANIFEST_VERSION_UNSUPPORTED', 'MANIFEST_BLOCKED', 'UNKNOWN_STORAGE_ASSET',
            'BLOCKED_ORPHAN_ASSET', 'SHARED_DEMO_DELETE_BLOCKED', 'STORAGE_PATH_OUTSIDE_EVENT_PREFIX',
            'STORAGE_GENERATION_MISSING', 'GENERATION_MISMATCH', 'ROOT_MISSING_UNEXPECTED',
            'ROOT_DELETE_STATE_MISMATCH', 'ROOT_DELETE_LOCK_MISMATCH',
            'EVENT_SAFETY_STALE', 'REFUND_EVIDENCE_STALE', 'REFUND_DOES_NOT_TERMINATE_SERVICE',
            'PRE_ROOT_VERIFY_FAILED', 'POST_ROOT_RESIDUAL_DATA', 'VERIFY_FAILED'
        ]).has(code);
        await updateRecord(lockedRecordReference, {
            status: postRoot ? (['POST_ROOT_RESIDUAL_DATA', 'VERIFY_FAILED'].includes(code) ? 'BLOCKED' : 'FAILED_RETRYABLE')
                : (blocker ? 'BLOCKED' : 'FAILED_RETRYABLE'),
            checkpoint: postRoot ? 'ROOT_DELETED' : (record.checkpoint ?? 'PUBLIC_ACCESS'),
            ...(blocker || postRoot ? { blockers: [{ code }] } : { lastError: { code } })
        });
        if ((code === 'PRODUCTION_PURGE_DISABLED' || blocker) && !postRoot) {
            await releaseGlobalPurgeLock({ db, eventId: safeEventId, operationId: record.operationId });
        }
        if (!postRoot && blocker && !destructionStarted) {
            await releasePurgeLock(eventReference);
            await releaseGlobalPurgeLock({ db, eventId: safeEventId, operationId: record.operationId });
        }
        throw error;
    }
}

export function isEventPurgeLocked(eventData = {}) {
    return Boolean(eventData.purgeLock?.operationId);
}
