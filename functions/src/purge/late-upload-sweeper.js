import { logger } from 'firebase-functions';
import { assertProductionPurgeGate } from './production-purge-gate.js';

export const PURGE_DESTRUCTIVE_CHECKPOINTS = Object.freeze([
    'FIRESTORE_PURGING', 'STORAGE_PURGING', 'MEDIA_METADATA', 'PROFILES',
    'ROOT', 'ROOT_DELETE_READY', 'ROOT_DELETED'
]);

export const PURGE_DESTRUCTIVE_STATUSES = Object.freeze([
    'PURGE_PENDING', 'STORAGE_PURGING', 'MEDIA_METADATA', 'PROFILES', 'VERIFYING', 'PURGED'
]);

const EVENT_MEDIA_PREFIX = /^eventos\/([A-Za-z0-9_-]{1,150})\/invitacion\/media\/(.+)$/;
const ALLOWED_BUCKET = /^[A-Za-z0-9._-]{3,220}$/;

function lateUploadError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

export function acknowledgeProductionPurgeDisabled(log = logger, productionGate = assertProductionPurgeGate) {
    try {
        productionGate();
        return false;
    } catch (error) {
        if (error?.code !== 'PRODUCTION_PURGE_DISABLED') throw error;
        log.info?.('Production purge sweeper disabled.', {
            code: 'PRODUCTION_PURGE_DISABLED'
        });
        return true;
    }
}

export function parseOwnedEventMediaPath(name) {
    const match = String(name ?? '').match(EVENT_MEDIA_PREFIX);
    if (!match || !match[2]) return null;
    return Object.freeze({ eventId: match[1], relativePath: match[2] });
}

export function isDestructivePurgeRecord(record = {}) {
    const safeRecord = record && typeof record === 'object' ? record : {};
    return PURGE_DESTRUCTIVE_STATUSES.includes(safeRecord.status)
        || PURGE_DESTRUCTIVE_CHECKPOINTS.includes(safeRecord.checkpoint)
        || (safeRecord.status === 'FAILED_RETRYABLE' && PURGE_DESTRUCTIVE_CHECKPOINTS.includes(safeRecord.checkpoint));
}

export async function handleLatePurgedEventObject({ event, db, bucket, expectedBucket = null, log = logger, productionGate = assertProductionPurgeGate } = {}) {
    if (acknowledgeProductionPurgeDisabled(log, productionGate)) {
        return Object.freeze({ action: 'DISABLED', reason: 'PRODUCTION_PURGE_DISABLED' });
    }
    const name = String(event?.data?.name ?? event?.name ?? '');
    const parsed = parseOwnedEventMediaPath(name);
    if (!parsed) return Object.freeze({ action: 'IGNORE', reason: 'WRONG_PREFIX' });

    const bucketName = String(event?.data?.bucket ?? event?.bucket ?? '');
    if (!ALLOWED_BUCKET.test(bucketName) || (expectedBucket && bucketName !== expectedBucket)) {
        return Object.freeze({ action: 'IGNORE', reason: 'WRONG_BUCKET', eventId: parsed.eventId });
    }
    if (!db || !bucket?.file) throw lateUploadError('SWEEPER_DEPENDENCY_INVALID');

    const [eventSnapshot, purgeSnapshot] = await Promise.all([
        db.doc(`eventos/${parsed.eventId}`).get(),
        db.doc(`administrativePurgeRecords/PURGE-${parsed.eventId}`).get()
    ]);
    const eventData = eventSnapshot.exists ? eventSnapshot.data() : null;
    const record = purgeSnapshot.exists ? purgeSnapshot.data() : null;
    const shouldDelete = Boolean(eventData?.purgeLock?.operationId) || isDestructivePurgeRecord(record);
    if (!shouldDelete) return Object.freeze({ action: 'KEEP', eventId: parsed.eventId, purgeStatus: record?.status ?? null });

    const generation = String(event?.data?.generation ?? event?.generation ?? '');
    if (!generation) return Object.freeze({ action: 'KEEP', reason: 'MISSING_GENERATION', eventId: parsed.eventId });
    const file = bucket.file(name);
    try {
        await file.delete({ ifGenerationMatch: generation });
    } catch (error) {
        const code = Number(error?.code);
        if (code === 404 || error?.code === 'not-found') {
            return Object.freeze({ action: 'ALREADY_GONE', eventId: parsed.eventId });
        }
        if (code === 412 || error?.code === 'precondition-failed') {
            return Object.freeze({ action: 'KEEP', reason: 'GENERATION_MISMATCH', eventId: parsed.eventId, generation });
        }
        throw error;
    }
    log.info?.('Late event media object removed.', {
        eventId: parsed.eventId,
        generation: generation || null,
        action: 'DELETE_LATE_OBJECT',
        purgeStatus: record?.status ?? (eventData?.purgeLock?.status ?? null)
    });
    return Object.freeze({ action: 'DELETE_LATE_OBJECT', eventId: parsed.eventId, generation: generation || null });
}
