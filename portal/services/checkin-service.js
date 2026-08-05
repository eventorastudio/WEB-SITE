import { db } from '../firebase.js';
import {
    collection,
    doc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { normalizeGuestData } from '../../shared/guest-contract.js';

export class CheckInError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

function validPassCount(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 999 ? parsed : null;
}

function sanitizeDevice(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function toIso(value) {
    return value?.toDate ? value.toDate().toISOString() : (value || null);
}

function sanitizeHistory(snapshot) {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        invitadoId: String(data.invitadoId ?? ''),
        nombreInvitado: String(data.nombreInvitado ?? ''),
        codigoInvitado: String(data.codigoInvitado ?? ''),
        pasesRegistrados: Number(data.pasesRegistrados) || 0,
        pasesDisponiblesDespues: Number(data.pasesDisponiblesDespues) || 0,
        fechaHora: toIso(data.fechaHora),
        registradoPor: String(data.registradoPor ?? ''),
        metodo: data.metodo === 'manual' ? 'manual' : 'qr',
        resultado: String(data.resultado ?? 'aprobado')
    };
}

export function parseQrPayload(rawValue) {
    const raw = String(rawValue ?? '').trim();
    if (!raw) throw new CheckInError('checkin/empty-qr');
    try {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && typeof data.token === 'string') {
            return { token: data.token.trim(), eventId: String(data.eventId ?? '').trim() || null };
        }
    } catch {
        // También se acepta una URL de pase segura con el token como parámetro t.
    }
    try {
        const url = new URL(raw);
        const token = url.searchParams.get('t')?.trim();
        if (token) return { token, eventId: url.searchParams.get('event')?.trim() || null };
    } catch {
        if (/^[A-Za-z0-9_-]{16,256}$/.test(raw)) return { token: raw, eventId: null };
    }
    throw new CheckInError('checkin/invalid-qr-format');
}

function validateToken(token) {
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(token)) throw new CheckInError('checkin/invalid-qr-format');
}

export const checkinService = {
    async registerEntry({ eventId, guestId, passes, method, qrToken = null, userId, device = '' }) {
        if (!eventId || !guestId || !userId) throw new CheckInError('checkin/invalid-request');
        if (!['qr', 'manual'].includes(method)) throw new CheckInError('checkin/invalid-method');
        const requestedPasses = validPassCount(passes);
        if (!requestedPasses) throw new CheckInError('checkin/invalid-pass-count');
        if (method === 'qr') validateToken(qrToken);

        const guestRef = doc(db, 'eventos', eventId, 'invitados', guestId);
        const checkinRef = doc(collection(db, 'eventos', eventId, 'checkins'));
        const result = await runTransaction(db, async (transaction) => {
            const guestSnapshot = await transaction.get(guestRef);
            if (!guestSnapshot.exists()) throw new CheckInError('checkin/guest-not-found');
            const raw = guestSnapshot.data();
            if (method === 'qr' && (raw.qrActivo === false || raw.qrToken !== qrToken)) {
                throw new CheckInError(raw.qrActivo === false ? 'checkin/qr-disabled' : 'checkin/invalid-token');
            }

            const guest = normalizeGuestData(raw);
            const total = guest.pases;
            const usedFallback = guest.llegadaRegistrada ? total : 0;
            const used = Number.isInteger(Number(raw.pasesUtilizados))
                ? Math.min(Math.max(Number(raw.pasesUtilizados), 0), total)
                : usedFallback;
            const available = total - used;
            if (available <= 0) throw new CheckInError('checkin/passes-already-used');
            if (requestedPasses > available) throw new CheckInError('checkin/insufficient-passes');

            const usedAfter = used + requestedPasses;
            const availableAfter = total - usedAfter;
            const resultCode = availableAfter > 0 ? 'parcial' : 'aprobado';
            transaction.update(guestRef, {
                pasesUtilizados: usedAfter,
                pasesDisponibles: availableAfter,
                estado: 'llego',
                confirmado: true,
                llegadaRegistrada: true,
                horaLlegada: raw.horaLlegada ?? serverTimestamp(),
                ultimaLlegada: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            });
            transaction.set(checkinRef, {
                eventId,
                invitadoId: guestId,
                nombreInvitado: guest.nombre,
                codigoInvitado: guest.codigoInvitado,
                pasesRegistrados: requestedPasses,
                pasesDisponiblesDespues: availableAfter,
                fechaHora: serverTimestamp(),
                registradoPor: userId,
                metodo: method,
                dispositivo: sanitizeDevice(device),
                resultado: resultCode
            });
            return {
                guest: { ...guest, id: guestId, pasesUtilizados: usedAfter, pasesDisponibles: availableAfter },
                passesRegistered: requestedPasses,
                result: resultCode,
                checkinId: checkinRef.id
            };
        });
        return result;
    },

    subscribeHistory(eventId, callback, onError, max = 25) {
        const historyQuery = query(
            collection(db, 'eventos', eventId, 'checkins'),
            orderBy('fechaHora', 'desc'),
            limit(Math.min(Math.max(Number(max) || 25, 1), 100))
        );
        return onSnapshot(historyQuery, (snapshot) => {
            callback(snapshot.docs.map(sanitizeHistory));
        }, (error) => onError?.(error));
    },

    async getGuestHistory(eventId, guestId) {
        const historyQuery = query(
            collection(db, 'eventos', eventId, 'checkins'),
            where('invitadoId', '==', guestId),
            limit(100)
        );
        const snapshot = await getDocs(historyQuery);
        return snapshot.docs.map(sanitizeHistory).sort((left, right) => {
            return new Date(right.fechaHora || 0) - new Date(left.fechaHora || 0);
        });
    },

    getRevertCapability() {
        return {
            available: false,
            reason: 'La reversión requiere una función segura con permisos administrativos específicos.'
        };
    }
};
