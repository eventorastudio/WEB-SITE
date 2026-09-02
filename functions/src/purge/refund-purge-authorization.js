import { randomUUID } from 'node:crypto';

import { purgeRecordId } from './refund-purge-preparation.js';
import { hashTechnicalManifest } from './manifest-hash.js';
import { buildRefundEvidenceHash, getConfirmedRefundRecord } from './refund-records.js';

export const PURGE_AUTHORIZATION_TTL_MS = 15 * 60 * 1000;

function purgeError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function isCeo(claims = {}) {
    return claims.role === 'CEO' || claims.userRole === 'CEO';
}

export function hashPurgeManifest(manifest) {
    return hashTechnicalManifest(manifest);
}

export function expectedPurgePhrase(eventId, commercialFileReference) {
    return `PURGAR ${eventId} ${commercialFileReference}`;
}

function assertFreshAuth(claims, now) {
    const authTime = Number(claims?.auth_time);
    if (!Number.isFinite(authTime) || (now.getTime() / 1000) - authTime > PURGE_AUTHORIZATION_TTL_MS / 1000) {
        throw purgeError('REAUTH_REQUIRED');
    }
}

function assertConfirmations(confirmations = {}) {
    const required = [
        'refundProcessed', 'eventAndReferenceReviewed',
        'irreversibleUnderstood', 'commercialRecordsPreserved'
    ];
    if (!required.every((key) => confirmations[key] === true)) throw purgeError('CONFIRMATIONS_INCOMPLETE');
}

function assertSafeReference(value, code) {
    const normalized = String(value ?? '').trim();
    if (!/^[A-Za-z0-9._:/-]{1,240}$/.test(normalized)) throw purgeError(code);
    return normalized;
}

function assertEventId(value) {
    const normalized = String(value ?? '').trim();
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(normalized)) throw purgeError('INVALID_EVENT_ID');
    return normalized;
}

export async function authorizeRefundProjectPurge({
    db, eventId, actorUid, claims, phrase, confirmations, manifestHash,
    refundReference, commercialFileReference, now = new Date()
} = {}) {
    if (!isCeo(claims)) throw purgeError('UNAUTHORIZED');
    const safeEventId = assertEventId(eventId);
    const safeRefundReference = assertSafeReference(refundReference, 'REFUND_REFERENCE_MISSING');
    const safeCommercialReference = assertSafeReference(commercialFileReference, 'COMMERCIAL_RECORD_MISSING');
    assertFreshAuth(claims, now);
    assertConfirmations(confirmations);
    if (phrase !== expectedPurgePhrase(safeEventId, safeCommercialReference)) throw purgeError('CONFIRMATION_PHRASE_INVALID');
    if (!/^[a-f0-9]{64}$/.test(String(manifestHash ?? ''))) throw purgeError('MANIFEST_HASH_INVALID');

    const eventSnapshot = await db.doc(`eventos/${safeEventId}`).get();
    if (eventSnapshot.exists && eventSnapshot.data()?.demoMode === true) throw purgeError('DEMO_PURGE_BLOCKED');
    const recordReference = db.collection('administrativePurgeRecords').doc(purgeRecordId(safeEventId));
    const authorizationId = randomUUID();
    const authorizationToken = randomUUID();
    const authorizationTokenHash = hashPurgeManifest({ authorizationToken });
    const authorizedAt = now;
    const expiresAt = new Date(now.getTime() + PURGE_AUTHORIZATION_TTL_MS);

    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(recordReference);
        if (!snapshot.exists) throw purgeError('PURGE_RECORD_NOT_FOUND');
        const record = snapshot.data();
        if (record.status === 'PURGED') throw purgeError('ALREADY_PURGED');
        if (!['DRY_RUN_READY', 'READY_FOR_EXECUTION'].includes(record.status)) throw purgeError('PURGE_NOT_READY');
        if (record.blockers?.length) throw purgeError('MANIFEST_BLOCKED');
        if (record.refundReference !== safeRefundReference
            || record.commercialFileReference !== safeCommercialReference) {
            throw purgeError('PURGE_EVIDENCE_MISMATCH');
        }
        if (!record.refundRecordId) throw purgeError('REFUND_EVIDENCE_NOT_PRODUCTION_READY');
        const confirmedRefund = await getConfirmedRefundRecord({
            db, refundRecordId: record.refundRecordId, eventId: safeEventId, transaction, allowLinked: true
        });
        if (confirmedRefund.record.refundReference !== safeRefundReference
            || confirmedRefund.record.commercialFileReference !== safeCommercialReference
            || confirmedRefund.record.terminationIntent !== 'COMPLETE_TERMINATION'
            || confirmedRefund.record.linkedPurgeOperationId !== record.operationId
            || record.refundEvidenceHash !== buildRefundEvidenceHash(confirmedRefund.record)) {
            throw purgeError('PURGE_EVIDENCE_MISMATCH');
        }
        const currentHash = hashPurgeManifest(record.manifest);
        if (currentHash !== manifestHash) throw purgeError('MANIFEST_STALE');
        if (record.authorization?.expiresAt?.toDate?.()?.getTime?.() > now.getTime()
            && record.authorization.used !== true) {
            throw purgeError('AUTHORIZATION_ALREADY_ACTIVE');
        }
        transaction.set(recordReference, {
            status: 'READY_FOR_EXECUTION',
            authorization: {
                authorizationId,
                authorizationTokenHash,
                operationId: record.operationId,
                eventId: safeEventId,
                refundRecordId: record.refundRecordId,
                actorUid,
                manifestHash,
                refundEvidenceHash: confirmedRefund.record.refundEvidenceHash,
                refundReference: safeRefundReference,
                commercialFileReference: safeCommercialReference,
                authorizedAt,
                expiresAt,
                used: false
            },
            authorizedBy: actorUid,
            authorizedAt,
            updatedAt: now
        }, { merge: true });
    });

    return Object.freeze({
        status: 'READY_FOR_EXECUTION', authorizationId, authorizationToken,
        operationId: `${purgeRecordId(safeEventId)}`, eventId: safeEventId, expiresAt
    });
}

export async function cancelRefundProjectPurge({ db, eventId, actorUid, claims, authorizationId, now = new Date() } = {}) {
    if (!isCeo(claims)) throw purgeError('UNAUTHORIZED');
    const safeEventId = assertEventId(eventId);
    const recordReference = db.collection('administrativePurgeRecords').doc(purgeRecordId(safeEventId));
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(recordReference);
        if (!snapshot.exists) throw purgeError('PURGE_RECORD_NOT_FOUND');
        const record = snapshot.data();
        if (record.status !== 'READY_FOR_EXECUTION') throw purgeError('AUTHORIZATION_NOT_ACTIVE');
        if (record.authorization?.authorizationId !== authorizationId) throw purgeError('AUTHORIZATION_MISMATCH');
        transaction.set(recordReference, {
            status: 'DRY_RUN_READY',
            authorization: { ...record.authorization, authorizationTokenHash: null, used: true, cancelledAt: now },
            cancelledAt: now,
            cancelledBy: actorUid,
            updatedAt: now
        }, { merge: true });
    });
    return Object.freeze({ status: 'DRY_RUN_READY', eventId: safeEventId, cancelled: true });
}

export async function consumePurgeAuthorization({ db, eventId, authorizationId, authorizationToken, now = new Date() } = {}) {
    const safeEventId = assertEventId(eventId);
    const recordReference = db.collection('administrativePurgeRecords').doc(purgeRecordId(safeEventId));
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(recordReference);
        if (!snapshot.exists) throw purgeError('PURGE_RECORD_NOT_FOUND');
        const record = snapshot.data();
        const authorization = record.authorization ?? {};
        if (record.status !== 'READY_FOR_EXECUTION') throw purgeError('PURGE_NOT_READY');
        if (authorization.authorizationId !== authorizationId) throw purgeError('AUTHORIZATION_MISMATCH');
        if (authorization.used === true) throw purgeError('AUTHORIZATION_ALREADY_USED');
        if (!(authorization.expiresAt?.toDate?.()?.getTime?.() > now.getTime())) {
            throw purgeError('AUTHORIZATION_EXPIRED');
        }
        if (authorization.authorizationTokenHash !== hashPurgeManifest({ authorizationToken })) {
            throw purgeError('AUTHORIZATION_INVALID');
        }
        transaction.set(recordReference, {
            authorization: { ...authorization, used: true, usedAt: now },
            updatedAt: now
        }, { merge: true });
    });
    return Object.freeze({ status: 'AUTHORIZATION_CONSUMED', eventId: safeEventId, authorizationId });
}
