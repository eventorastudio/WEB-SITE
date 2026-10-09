import { getAppCheck } from 'firebase-admin/app-check';
import { logger } from 'firebase-functions';

export async function requireAppCheck(req, res) {
    const token = String(req.get('X-Firebase-AppCheck') || '').trim();
    if (!token) {
        logger.warn('App Check rejected', { reason: 'missing' });
        res.status(401).json({ ok: false, message: 'Verificación de aplicación requerida.' });
        return false;
    }
    try {
        await verifyAppCheckToken(token);
        return true;
    } catch {
        logger.warn('App Check rejected', { reason: 'invalid' });
        res.status(401).json({ ok: false, message: 'Verificación de aplicación inválida.' });
        return false;
    }
}

export async function verifyAppCheckToken(token, verifier = getAppCheck()) {
    return verifier.verifyToken(token);
}
