import crypto from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const collectionName = 'requestRateLimits';
const windowMs = 15 * 60 * 1000;
const maxRequests = 5;

export async function enforceWebsiteRequestRateLimit(req, res) {
    const identifier = requestIdentifier(req);
    const reference = getFirestore().collection(collectionName).doc(identifier);
    const now = Date.now();
    let limited = false;
    await getFirestore().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        const decision = evaluateRateLimit(current, now);
        if (!decision.allowed) {
            limited = true;
            return;
        }
        transaction.set(reference, { count: decision.count, windowStartedAt: decision.windowStartedAt, updatedAt: FieldValue.serverTimestamp() });
    });
    if (!limited) return true;
    logger.warn('Website request rate limited');
    res.set('Retry-After', '900').status(429).json({ ok: false, message: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' });
    return false;
}

export const rateLimitConfig = Object.freeze({ maxRequests, windowMinutes: windowMs / 60000 });

export function evaluateRateLimit(current, now = Date.now()) {
    const windowStartedAt = Number(current?.windowStartedAt || 0);
    const activeWindow = windowStartedAt && now - windowStartedAt < windowMs;
    const count = activeWindow ? Number(current?.count || 0) : 0;
    if (count >= maxRequests) return { allowed: false, count, windowStartedAt };
    return { allowed: true, count: count + 1, windowStartedAt: activeWindow ? windowStartedAt : now };
}

export function requestIdentifier(req) {
    const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
    const ip = forwarded || String(req.ip || req.get('x-real-ip') || 'unknown').trim();
    return crypto.createHash('sha256').update(`eventora:${ip}`).digest('hex');
}
