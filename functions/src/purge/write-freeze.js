const GLOBAL_LOCK_PATH = 'administrativeLocks/refundProjectPurge';
export const PURGE_LEASE_MS = 5 * 60 * 1000;

function freezeError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

export function purgeGlobalLockReference(db) {
    return db.doc(GLOBAL_LOCK_PATH);
}

export function assertEventNotPurgingSnapshot(eventData = {}) {
    if (eventData.purgeLock?.operationId) throw freezeError('EVENT_PURGE_IN_PROGRESS');
    return true;
}

export async function assertEventNotPurging({ db, eventId, transaction = null } = {}) {
    const reference = db.doc(`eventos/${eventId}`);
    const snapshot = transaction ? await transaction.get(reference) : await reference.get();
    if (!snapshot.exists) throw freezeError('EVENT_NOT_FOUND');
    assertEventNotPurgingSnapshot(snapshot.data());
    return snapshot;
}

export function globalLockIsRecoverable(lock, operationId, eventId) {
    return lock?.operationId === operationId && lock?.eventId === eventId;
}

export function globalLockExpiresAt(now = new Date()) {
    return new Date(now.getTime() + PURGE_LEASE_MS);
}
