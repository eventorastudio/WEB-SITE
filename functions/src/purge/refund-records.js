import { createHash } from 'node:crypto';

const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,150}$/;
const REFERENCE_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const PAYMENT_METHODS = new Set(['MERCADO_PAGO', 'SPEI', 'OTHER']);
export const REFUND_TERMINATION_INTENTS = Object.freeze(['SERVICE_CONTINUES', 'COMPLETE_TERMINATION']);

function refundError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function eventId(value) {
    const normalized = String(value ?? '').trim();
    if (!EVENT_ID_PATTERN.test(normalized)) throw refundError('INVALID_EVENT_ID');
    return normalized;
}

function reference(value, code) {
    const normalized = String(value ?? '').trim();
    if (!REFERENCE_PATTERN.test(normalized)) throw refundError(code);
    return normalized;
}

function safeRefundRecordId(value) {
    const normalized = String(value ?? '').trim();
    if (!/^[A-Za-z0-9._%:-]{1,240}$/.test(normalized)) throw refundError('REFUND_RECORD_NOT_FOUND');
    return normalized;
}

function terminationIntent(value) {
    if (!REFUND_TERMINATION_INTENTS.includes(value)) throw refundError('TERMINATION_INTENT_INVALID');
    return value;
}

function dateValue(value) {
    if (value?.toDate) return value.toDate();
    const date = value instanceof Date ? value : new Date(String(value ?? ''));
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 60_000) throw refundError('REFUNDED_AT_INVALID');
    return date;
}

function amountValue(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw refundError('AMOUNT_INVALID');
    return Math.round(amount * 100) / 100;
}

function paymentMethod(value, otherPaymentMethod) {
    const method = String(value ?? '').trim();
    if (!PAYMENT_METHODS.has(method)) throw refundError('PAYMENT_METHOD_INVALID');
    if (method === 'OTHER' && String(otherPaymentMethod ?? '').trim().length > 80) throw refundError('PAYMENT_METHOD_INVALID');
    return method;
}

export function normalizeRefundRecordInput(input = {}) {
    const method = paymentMethod(input.paymentMethod, input.otherPaymentMethod);
    return {
        eventId: eventId(input.eventId),
        commercialFileReference: reference(input.commercialFileReference, 'COMMERCIAL_RECORD_MISSING'),
        refundReference: reference(input.refundReference, 'REFUND_REFERENCE_MISSING'),
        amount: amountValue(input.amount),
        currency: String(input.currency ?? 'MXN') === 'MXN' ? 'MXN' : (() => { throw refundError('CURRENCY_INVALID'); })(),
        paymentMethod: method,
        ...(method === 'OTHER' && String(input.otherPaymentMethod ?? '').trim()
            ? { otherPaymentMethod: String(input.otherPaymentMethod).trim() } : {}),
        refundedAt: dateValue(input.refundedAt),
        terminationIntent: terminationIntent(input.terminationIntent)
    };
}

export function buildRefundEvidenceHash(input = {}) {
    const normalized = normalizeRefundRecordInput(input);
    return createHash('sha256').update(JSON.stringify({
        eventId: normalized.eventId,
        commercialFileReference: normalized.commercialFileReference,
        refundReference: normalized.refundReference,
        amount: normalized.amount,
        currency: normalized.currency,
        paymentMethod: normalized.paymentMethod,
        ...(normalized.otherPaymentMethod ? { otherPaymentMethod: normalized.otherPaymentMethod } : {}),
        refundedAt: normalized.refundedAt.toISOString(),
        terminationIntent: normalized.terminationIntent
    })).digest('hex');
}

export async function recordRefundProcessed({ db, input, actorUid, claims, now = new Date() } = {}) {
    if (!(claims?.role === 'CEO' || claims?.userRole === 'CEO')) throw refundError('UNAUTHORIZED');
    const normalized = normalizeRefundRecordInput(input);
    const refundRecordId = `REF-${normalized.eventId}-${encodeURIComponent(normalized.refundReference)}`;
    const recordReference = db.collection('administrativeRefundRecords').doc(refundRecordId);
    const record = {
        refundRecordId,
        ...normalized,
        status: 'RECORDED',
        refundEvidenceHash: buildRefundEvidenceHash(normalized),
        recordVersion: 1,
        recordedAt: now,
        recordedBy: actorUid,
        updatedAt: now
    };
    await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(recordReference);
        if (existing.exists) {
            const data = existing.data();
            if (data.status === 'CONFIRMED') throw refundError('REFUND_CONFIRMED_IMMUTABLE');
            if (data.status === 'RECORDED') throw refundError('REFUND_RECORD_ALREADY_EXISTS');
        }
        transaction.set(recordReference, record);
    });
    return Object.freeze({ refundRecordId, status: 'RECORDED' });
}

export async function confirmRefundRecord({ db, refundRecordId, actorUid, claims, now = new Date() } = {}) {
    if (!(claims?.role === 'CEO' || claims?.userRole === 'CEO')) throw refundError('UNAUTHORIZED');
    const safeId = safeRefundRecordId(refundRecordId);
    const recordReference = db.collection('administrativeRefundRecords').doc(safeId);
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(recordReference);
        if (!snapshot.exists) throw refundError('REFUND_RECORD_NOT_FOUND');
        const record = snapshot.data();
        if (record.status === 'CONFIRMED') throw refundError('REFUND_ALREADY_CONFIRMED');
        if (record.status !== 'RECORDED') throw refundError('REFUND_RECORD_NOT_CONFIRMABLE');
        let expectedHash;
        try {
            expectedHash = buildRefundEvidenceHash(record);
        } catch {
            throw refundError('REFUND_RECORD_INVALID');
        }
        if (record.refundEvidenceHash !== expectedHash) throw refundError('REFUND_RECORD_INVALID');
        transaction.set(recordReference, {
            status: 'CONFIRMED',
            confirmedAt: now,
            confirmedBy: actorUid,
            updatedAt: now,
            recordVersion: 1
        }, { merge: true });
    });
    return Object.freeze({ refundRecordId: safeId, status: 'CONFIRMED' });
}

export async function getConfirmedRefundRecord({ db, refundRecordId, eventId, transaction = null, allowLinked = false } = {}) {
    const safeId = safeRefundRecordId(refundRecordId);
    const recordReference = db.collection('administrativeRefundRecords').doc(safeId);
    const snapshot = transaction ? await transaction.get(recordReference) : await recordReference.get();
    if (!snapshot.exists) throw refundError('REFUND_RECORD_NOT_FOUND');
    const record = snapshot.data();
    if (record.status !== 'CONFIRMED') throw refundError('REFUND_NOT_CONFIRMED');
    let expectedHash;
    try {
        expectedHash = buildRefundEvidenceHash(record);
    } catch {
        throw refundError('REFUND_RECORD_INVALID');
    }
    if (record.refundEvidenceHash !== expectedHash) throw refundError('REFUND_EVIDENCE_STALE');
    if (eventId && record.eventId !== eventId) throw refundError('REFUND_EVENT_MISMATCH');
    if (record.linkedPurgeOperationId && !allowLinked) throw refundError('REFUND_ALREADY_LINKED');
    return { recordReference, record };
}
