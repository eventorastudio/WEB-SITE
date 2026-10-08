import { getAuth } from 'firebase-admin/auth';

export const AUTHORIZED_ADMIN_UID = 'fzERhhRbsAfHcm55drt5lmAxn6J3';

const allowedOrigins = new Set([
    'https://eventorastudio.com',
    'https://www.eventorastudio.com',
    'http://localhost:5000',
    'http://localhost:5500',
    'http://localhost:8000',
    'http://localhost:8080',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8080'
]);

export function applyAdminCors(req, res) {
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) {
        res.status(403).json({ ok: false, message: 'Origen no permitido.' });
        return false;
    }

    if (origin) res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return true;
}

export async function requireAuthorizedAdmin(req, res) {
    const authorization = String(req.get('authorization') || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        res.status(401).json({ ok: false, message: 'Autenticación requerida.' });
        return null;
    }

    try {
        const decodedToken = await getAuth().verifyIdToken(match[1]);
        if (decodedToken.uid !== AUTHORIZED_ADMIN_UID) {
            res.status(403).json({ ok: false, message: 'Usuario no autorizado.' });
            return null;
        }
        return decodedToken;
    } catch {
        res.status(401).json({ ok: false, message: 'Sesión inválida o expirada.' });
        return null;
    }
}
