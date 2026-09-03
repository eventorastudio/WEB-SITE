import { purgeRecordId } from '../src/purge/refund-purge-preparation.js';
import { executeRefundProjectPurge } from '../src/purge/refund-purge-executor.js';

export const EXPECTED_PROJECT_ID = 'eventorastudio-d6d95';
export const EXPECTED_BUCKET_NAME = 'eventorastudio-d6d95.firebasestorage.app';
export const OPERATION_ID_PATTERN = /^PURGE-[A-Za-z0-9_-]{1,150}$/;

function operatorError(code, details = {}) {
    const error = new Error(code);
    error.code = code;
    Object.assign(error, details);
    return error;
}

export function validateOperationId(value) {
    if (typeof value !== 'string' || value.length === 0 || value !== value.trim()
        || !OPERATION_ID_PATTERN.test(value)) {
        throw operatorError('INVALID_OPERATION_ID');
    }
    return value;
}

function projectIdFromEnvironment(environment) {
    if (environment.GCLOUD_PROJECT) return environment.GCLOUD_PROJECT;
    try {
        return JSON.parse(environment.FIREBASE_CONFIG ?? '{}').projectId ?? '';
    } catch {
        return '';
    }
}

export function assertBackendBindings({ bucket, environment = process.env, allowLocalTestEnvironment = false } = {}) {
    const projectId = projectIdFromEnvironment(environment);
    const emulatorProject = /^demo-eventorastudio-phase2e2[ab]$/.test(projectId)
        && Boolean(environment.FIRESTORE_EMULATOR_HOST);
    if (projectId !== EXPECTED_PROJECT_ID && !(allowLocalTestEnvironment && emulatorProject)) {
        throw operatorError('BACKEND_PROJECT_MISMATCH');
    }
    if (bucket?.__eventoraStorageEmulatorMock === true) return true;
    if (bucket?.name && bucket.name !== EXPECTED_BUCKET_NAME) {
        throw operatorError('BACKEND_BUCKET_MISMATCH');
    }
    return true;
}

export function createRefundPurgeOperatorAdapter({ db, bucket, executor = executeRefundProjectPurge,
    environment = process.env, allowLocalTestEnvironment = false } = {}) {
    if (!db || !bucket) throw operatorError('BACKEND_DEPENDENCIES_MISSING');
    assertBackendBindings({ bucket, environment, allowLocalTestEnvironment });
    return Object.freeze({
        async execute(operationId) {
            const safeOperationId = validateOperationId(operationId);
            const snapshot = await db.collection('administrativePurgeRecords')
                .where('operationId', '==', safeOperationId).limit(1).get();
            if (snapshot.empty) throw operatorError('PURGE_RECORD_NOT_FOUND');
            const document = snapshot.docs[0];
            const record = document.data();
            if (record.operationId !== safeOperationId || document.id !== purgeRecordId(record.originalEventId)) {
                throw operatorError('OPERATION_BINDING_MISMATCH');
            }
            const eventId = record.originalEventId;
            const result = await executor({
                db, bucket, eventId,
                trustedExecutionContext: Object.freeze({
                    executionMode: 'OPERATOR_IAM',
                    adapter: 'refund-purge-service',
                    authenticatedBy: 'cloud-run-iam'
                })
            });
            return Object.freeze({
                ok: true,
                operationId: safeOperationId,
                status: result.status
            });
        }
    });
}
