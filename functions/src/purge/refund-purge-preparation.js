import { createHash } from 'node:crypto';
import { hashTechnicalManifest } from './manifest-hash.js';
import { buildRefundEvidenceHash, getConfirmedRefundRecord } from './refund-records.js';

export const REFUND_PURGE_SCHEMA_VERSION = 1;
export const REFUND_PURGE_STATUSES = Object.freeze(['DRAFT', 'DRY_RUN_READY', 'BLOCKED']);
export const PURGE_RECORD_PREFIX = 'PURGE-';
const EVENT_SAFETY_FIELDS = ['demoMode', 'estado', 'owner', 'uid', 'ownerUid', 'ownerId', 'editorUid', 'editorId', 'clienteUid', 'clienteId'];

const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,150}$/;
const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const MEDIA_ROLES = new Set(['cover', 'gallery', 'place', 'dressCode', 'video', 'videoPoster', 'music']);
const RSVP_COLLECTIONS = ['rsvpAccess', 'rsvpPublic', 'rsvpResponses', 'rsvpState', 'rsvpConflicts'];
const SUBCOLLECTIONS = Object.freeze([
    'invitados', 'checkins', 'rsvpAccess', 'rsvpPublic', 'rsvpResponses',
    'rsvpState', 'rsvpConflicts'
]);

function purgeError(code, details = {}) {
    const error = new Error(code);
    error.code = code;
    Object.assign(error, details);
    return error;
}

export function isCeoClaims(claims = {}) {
    return claims?.role === 'CEO' || claims?.userRole === 'CEO';
}

export function purgeRecordId(eventId) {
    assertEventId(eventId);
    return `${PURGE_RECORD_PREFIX}${eventId}`;
}

function assertEventId(eventId) {
    const value = String(eventId ?? '');
    if (!EVENT_ID_PATTERN.test(value)) throw purgeError('INVALID_EVENT_ID');
    return value;
}

function assertReference(value, code) {
    const normalized = String(value ?? '').trim();
    if (!SAFE_REFERENCE_PATTERN.test(normalized)) throw purgeError(code);
    return normalized;
}

function isValidDateLike(value) {
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value?.toDate === 'function') return isValidDateLike(value.toDate());
    if (Number.isFinite(value?.seconds ?? value?._seconds)) return true;
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizeRefundEvidence(refund = {}, refundRecordId = null) {
    if (refund.status !== 'REFUNDED') throw purgeError('REFUND_NOT_CONFIRMED');
    const refundReference = assertReference(refund.refundReference, 'REFUND_REFERENCE_MISSING');
    const commercialFileReference = assertReference(
        refund.commercialFileReference,
        'COMMERCIAL_RECORD_MISSING'
    );
    if (!isValidDateLike(refund.refundedAt)) throw purgeError('REFUNDED_AT_MISSING');
    if (refund.terminationIntent !== 'COMPLETE_TERMINATION') {
        throw purgeError(refund.terminationIntent === 'SERVICE_CONTINUES'
            ? 'REFUND_DOES_NOT_TERMINATE_SERVICE' : 'REFUND_EVIDENCE_NOT_PRODUCTION_READY');
    }
    return Object.freeze({
        status: 'REFUNDED',
        refundReference,
        commercialFileReference,
        refundedAt: refund.refundedAt,
        amount: refund.amount,
        currency: refund.currency,
        paymentMethod: refund.paymentMethod,
        terminationIntent: refund.terminationIntent,
        refundEvidenceHash: refund.refundEvidenceHash,
        ...(refundRecordId ? { refundRecordId } : {})
    });
}

function digest(value) {
    return createHash('sha256').update(String(value)).digest('hex');
}

export function createEventSafetyHash(eventData = {}) {
    return hashTechnicalManifest(Object.fromEntries(EVENT_SAFETY_FIELDS.map((field) => [field, eventData[field] ?? null])));
}

function documentIdHash(id) {
    return { documentIdHash: digest(id) };
}

function technicalPath(collection, eventId, id = '') {
    return id ? `eventos/${eventId}/${collection}/${id}` : `eventos/${eventId}/${collection}`;
}

function safeStoragePath(path, eventId) {
    const value = String(path ?? '');
    const ownPrefix = `eventos/${eventId}/`;
    if (value.startsWith(ownPrefix) && value.length <= 600) return value;
    if (value.startsWith('demo-library/') && value.length <= 600) return value;
    return '';
}

function classifyMediaDocument(document, eventId) {
    const path = String(document?.storagePath ?? '');
    const sharedId = String(document?.sharedDemoAssetId ?? '');
    const role = String(document?.role ?? '');
    if (!MEDIA_ROLES.has(role)) return { classification: 'UNKNOWN', path: safeStoragePath(path, eventId) };
    if (sharedId || path.startsWith('demo-library/')) {
        return {
            classification: sharedId && path.startsWith('demo-library/') ? 'SHARED_DEMO' : 'UNKNOWN',
            path: safeStoragePath(path, eventId),
            sharedDemoAssetId: sharedId || null
        };
    }
    if (!path.startsWith(`eventos/${eventId}/invitacion/media/`)) {
        return { classification: 'UNKNOWN', path: safeStoragePath(path, eventId) };
    }
    return { classification: 'OWN_EVENT', path };
}

async function readCollection(eventReference, collectionName) {
    const snapshot = await eventReference.collection(collectionName).get();
    return snapshot.docs;
}

async function collectProfileReferences(db, eventId) {
    const snapshot = await db.collection('usuarios').get();
    return snapshot.docs
        .filter((profile) => Array.isArray(profile.data()?.eventosPermitidos)
            && profile.data().eventosPermitidos.includes(eventId))
        .map((profile) => ({ profileId: profile.id, action: 'DETACH' }));
}

async function collectMedia(eventReference, eventId) {
    const configSnapshot = await eventReference.collection('invitacion').doc('config').get();
    const mediaSnapshot = await eventReference.collection('invitacion').doc('config').collection('media').get();
    const mediaIndex = configSnapshot.exists ? configSnapshot.data()?.mediaIndex ?? null : null;
    const assets = mediaSnapshot.docs.map((document) => {
        const data = document.data();
        return {
            mediaId: document.id,
            ...classifyMediaDocument(data, eventId),
            storagePath: safeStoragePath(data.storagePath, eventId),
            objectVersion: String(data.objectVersion ?? '').slice(0, 20)
        };
    });
    const knownPaths = new Set(assets.map((asset) => asset.path).filter(Boolean));
    return { configExists: configSnapshot.exists, mediaIndex, assets, knownPaths };
}

async function collectStorage(bucket, eventId, knownPaths) {
    if (!bucket || typeof bucket.getFiles !== 'function') {
        return { objects: [], warnings: ['STORAGE_DISCOVERY_UNAVAILABLE'] };
    }
    const [files] = await bucket.getFiles({ prefix: `eventos/${eventId}/invitacion/media/` });
    const objects = [];
    const warnings = [];
    for (const file of files ?? []) {
        const path = String(file.name ?? '');
        if (!path.startsWith(`eventos/${eventId}/invitacion/media/`)) continue;
        if (!knownPaths.has(path)) warnings.push({ code: 'ORPHAN_CANDIDATE', storagePath: path });
        objects.push({ storagePath: path, classification: knownPaths.has(path) ? 'OWN_EVENT' : 'ORPHAN_CANDIDATE' });
    }
    return { objects, warnings };
}

function collectionManifest(eventId, collectionName, documents) {
    const path = technicalPath(collectionName, eventId);
    const entries = documents.map((document) => collectionName === 'rsvpAccess'
        || collectionName === 'rsvpResponses'
        ? documentIdHash(document.id)
        : { id: document.id });
    return { collection: collectionName, path, count: documents.length, entries };
}

export async function buildRefundPurgeInventory({ db, bucket, eventReference, eventId }) {
    const collections = new Map();
    for (const collectionName of SUBCOLLECTIONS) {
        collections.set(collectionName, await readCollection(eventReference, collectionName));
    }
    const invitationReference = eventReference.collection('invitacion');
    const invitationDocuments = await Promise.all(
        ['config', 'draft', 'rsvp', 'rsvpPublication', 'publication']
            .map(async (id) => ({ id, snapshot: await invitationReference.doc(id).get() }))
    );
    const publication = invitationDocuments.find(({ id }) => id === 'publication')?.snapshot;
    const revisionDocuments = publication?.exists
        ? await invitationReference.doc('publication').collection('revisions').get()
        : { docs: [] };
    const publicProjectionSnapshot = await eventReference.collection('invitacionPublic').get();
    const media = await collectMedia(eventReference, eventId);
    const storage = await collectStorage(bucket, eventId, media.knownPaths);
    const profiles = await collectProfileReferences(db, eventId);
    const invitationManifest = invitationDocuments
        .filter(({ snapshot }) => snapshot.exists)
        .map(({ id }) => ({ path: `eventos/${eventId}/invitacion/${id}`, id }));
    invitationManifest.push(...revisionDocuments.docs.map((document) => ({
        path: `eventos/${eventId}/invitacion/publication/revisions/${document.id}`,
        id: document.id
    })));
    const publicManifest = publicProjectionSnapshot.docs.map((document) => ({
        path: `eventos/${eventId}/invitacionPublic/${document.id}`,
        publicKey: document.id
    }));
    const firestoreManifest = [
        { path: `eventos/${eventId}`, id: eventId },
        ...SUBCOLLECTIONS.map((collectionName) => collectionManifest(
            eventId,
            collectionName,
            collections.get(collectionName)
        )),
        ...invitationManifest,
        ...publicManifest,
        ...media.assets.map(({ mediaId, storagePath, classification, sharedDemoAssetId, objectVersion }) => ({
            path: `eventos/${eventId}/invitacion/config/media/${mediaId}`,
            mediaId,
            storagePath,
            classification,
            ...(sharedDemoAssetId ? { sharedDemoAssetId } : {}),
            objectVersion
        })),
        ...profiles.map(({ profileId, action }) => ({
            path: `usuarios/${profileId}`,
            profileId,
            action
        }))
    ];
    const blockers = [];
    const warnings = [...storage.warnings];
    const unknownMedia = media.assets.filter((asset) => asset.classification === 'UNKNOWN');
    if (unknownMedia.length) blockers.push({ code: 'UNKNOWN_STORAGE_ASSET', count: unknownMedia.length });
    const orphanMedia = storage.objects.filter((asset) => asset.classification === 'ORPHAN_CANDIDATE');
    if (orphanMedia.length) blockers.push({ code: 'BLOCKED_ORPHAN_ASSET', count: orphanMedia.length });
    const sharedDemo = media.assets.filter((asset) => asset.classification === 'SHARED_DEMO');
    if (sharedDemo.some((asset) => !asset.sharedDemoAssetId)) {
        blockers.push({ code: 'BLOCKED_SHARED_ASSET_ORIGIN', count: 1 });
    }
    const counts = Object.fromEntries(SUBCOLLECTIONS.map((collectionName) => [
        collectionName,
        collections.get(collectionName).length
    ]));
    counts.revisions = revisionDocuments.docs.length;
    counts.publicProjections = publicProjectionSnapshot.size;
    counts.mediaMetadata = media.assets.length;
    counts.storageObjectReferences = storage.objects.length;
    counts.sharedDemoReferences = sharedDemo.length;
    counts.profileReferences = profiles.length;
    counts.firestoreDocuments = firestoreManifest.length;
    return {
        counts: Object.freeze(counts),
        firestoreManifest,
        storageManifest: storage.objects,
        blockers,
        warnings,
        publicKeys: publicManifest.map(({ publicKey }) => publicKey),
        sharedDemoReferences: sharedDemo.map(({ mediaId, sharedDemoAssetId, storagePath }) => ({
            mediaId,
            sharedDemoAssetId,
            storagePath,
            action: 'DETACH_ONLY'
        }))
    };
}

function containsForbiddenManifestData(value) {
    const serialized = JSON.stringify(value);
    return /qrToken|rsvpToken|displayName|correo|email|telefono|phone|guestName|nombreInvitado/i.test(serialized);
}

export function createRefundPurgeManifest(inventory) {
    const manifest = {
        manifestVersion: REFUND_PURGE_SCHEMA_VERSION,
        firestore: inventory.firestoreManifest,
        storage: inventory.storageManifest,
        publicKeys: inventory.publicKeys,
        sharedDemoReferences: inventory.sharedDemoReferences
    };
    if (containsForbiddenManifestData(manifest)) throw purgeError('MANIFEST_PRIVACY_VIOLATION');
    return manifest;
}

function recordPayload({ eventId, evidence, actorUid, operationId, inventory, status, eventSafetyHash, now }) {
    const manifest = createRefundPurgeManifest(inventory);
    return {
        originalEventId: eventId,
        ...(evidence.refundRecordId ? { refundRecordId: evidence.refundRecordId } : {}),
        commercialFileReference: evidence.commercialFileReference,
        refundReference: evidence.refundReference,
        refundedAt: evidence.refundedAt,
        terminationIntent: evidence.terminationIntent,
        refundEvidenceHash: evidence.refundEvidenceHash,
        eventSafetyHash,
        purgeRequestedAt: now,
        requestedBy: actorUid,
        operationId,
        status,
        purgeSchemaVersion: REFUND_PURGE_SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
        counts: inventory.counts,
        blockers: inventory.blockers,
        warnings: inventory.warnings,
        manifest,
        manifestHash: hashTechnicalManifest(manifest)
    };
}

async function claimPreparation({ db, eventId, operationId, actorUid, evidence, refundRecordReference = null, now }) {
    const recordReference = db.collection('administrativePurgeRecords').doc(purgeRecordId(eventId));
    return db.runTransaction(async (transaction) => {
        const existingSnapshot = await transaction.get(recordReference);
        if (existingSnapshot.exists) {
            const existing = existingSnapshot.data();
            if (existing.status === 'DRY_RUN_READY') return { claimed: false, existing };
            if (existing.status === 'DRAFT' && existing.operationId !== operationId) {
                throw purgeError('PURGE_ALREADY_PENDING');
            }
        }
        if (refundRecordReference) {
            const refundSnapshot = await transaction.get(refundRecordReference);
            const refundRecord = refundSnapshot.data();
            if (!refundSnapshot.exists || refundRecord?.status !== 'CONFIRMED') throw purgeError('REFUND_NOT_CONFIRMED');
            if (refundRecord.eventId !== eventId
                || refundRecord.refundReference !== evidence.refundReference
                || refundRecord.commercialFileReference !== evidence.commercialFileReference
                || refundRecord.terminationIntent !== evidence.terminationIntent
                || refundRecord.refundEvidenceHash !== evidence.refundEvidenceHash) {
                throw purgeError('REFUND_EVENT_MISMATCH');
            }
            if (refundRecord.linkedPurgeOperationId && refundRecord.linkedPurgeOperationId !== operationId) {
                throw purgeError('REFUND_ALREADY_LINKED');
            }
            transaction.set(refundRecordReference, { linkedPurgeOperationId: operationId, updatedAt: now }, { merge: true });
        }
        const payload = {
            originalEventId: eventId,
            ...(evidence.refundRecordId ? { refundRecordId: evidence.refundRecordId } : {}),
            commercialFileReference: evidence.commercialFileReference,
            refundReference: evidence.refundReference,
            refundedAt: evidence.refundedAt,
            terminationIntent: evidence.terminationIntent,
            refundEvidenceHash: evidence.refundEvidenceHash,
            eventSafetyHash: null,
            purgeRequestedAt: now,
            requestedBy: actorUid,
            operationId,
            status: 'DRAFT',
            purgeSchemaVersion: REFUND_PURGE_SCHEMA_VERSION,
            createdAt: existingSnapshot.exists ? existingSnapshot.data().createdAt ?? now : now,
            updatedAt: now
        };
        transaction.set(recordReference, payload, { merge: true });
        return { claimed: true, existing: null };
    });
}

export async function prepareRefundPurgeDryRun({
    db,
    bucket,
    eventId,
    actorUid,
    claims,
    refund,
    refundRecordId = null,
    operationId = null,
    now = new Date()
} = {}) {
    if (!isCeoClaims(claims)) throw purgeError('UNAUTHORIZED');
    const safeEventId = assertEventId(eventId);
    if (!refundRecordId) throw purgeError('REFUND_EVIDENCE_NOT_PRODUCTION_READY');
    const confirmed = await getConfirmedRefundRecord({ db, refundRecordId, eventId: safeEventId, allowLinked: true });
    const refundRecordReference = confirmed.recordReference;
    const resolvedRefund = {
        status: 'REFUNDED',
        refundReference: confirmed.record.refundReference,
        commercialFileReference: confirmed.record.commercialFileReference,
        refundedAt: confirmed.record.refundedAt,
        amount: confirmed.record.amount,
        currency: confirmed.record.currency,
        paymentMethod: confirmed.record.paymentMethod,
        terminationIntent: confirmed.record.terminationIntent,
        refundEvidenceHash: buildRefundEvidenceHash(confirmed.record)
    };
    const evidence = normalizeRefundEvidence(resolvedRefund, refundRecordId);
    const actor = assertReference(actorUid, 'UNAUTHORIZED');
    const deterministicOperationId = operationId || `${PURGE_RECORD_PREFIX}${safeEventId}`;
    const eventReference = db.doc(`eventos/${safeEventId}`);
    const eventSnapshot = await eventReference.get();
    if (!eventSnapshot.exists) throw purgeError('EVENT_NOT_FOUND');
    if (eventSnapshot.data()?.demoMode === true) throw purgeError('DEMO_PURGE_BLOCKED');
    const claim = await claimPreparation({
        db,
        eventId: safeEventId,
        operationId: deterministicOperationId,
        actorUid: actor,
        evidence,
        refundRecordReference,
        now
    });
    if (!claim.claimed && claim.existing) return Object.freeze({
        status: claim.existing.status,
        eventId: safeEventId,
        operationId: claim.existing.operationId,
        counts: claim.existing.counts ?? {},
        blockers: claim.existing.blockers ?? [],
        warnings: claim.existing.warnings ?? [],
        manifest: claim.existing.manifest ?? null,
        manifestHash: claim.existing.manifestHash ?? null,
        idempotent: true
    });
    let inventory;
    try {
        inventory = await buildRefundPurgeInventory({ db, bucket, eventReference, eventId: safeEventId });
    } catch (error) {
        const recordReference = db.collection('administrativePurgeRecords').doc(purgeRecordId(safeEventId));
        await recordReference.set({
            status: 'BLOCKED',
            blockers: [{ code: 'DRY_RUN_FAILED' }],
            warnings: [],
            updatedAt: now
        }, { merge: true });
        throw purgeError('DRY_RUN_FAILED', { cause: error });
    }
    const status = inventory.blockers.length ? 'BLOCKED' : 'DRY_RUN_READY';
    const payload = recordPayload({
        eventId: safeEventId,
        evidence,
        actorUid: actor,
        operationId: deterministicOperationId,
        inventory,
        status,
        eventSafetyHash: createEventSafetyHash(eventSnapshot.data()),
        now
    });
    const recordReference = db.collection('administrativePurgeRecords').doc(purgeRecordId(safeEventId));
    await recordReference.set(payload, { merge: true });
    return Object.freeze({
        status,
        eventId: safeEventId,
        operationId: deterministicOperationId,
        counts: inventory.counts,
        blockers: inventory.blockers,
        warnings: inventory.warnings,
        manifest: payload.manifest,
        manifestHash: payload.manifestHash,
        idempotent: false
    });
}

export function assertEmulatorEnvironment() {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw purgeError('EMULATOR_REQUIRED');
}
