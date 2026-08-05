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
import {
    CheckinValidationError,
    getCheckinErrorMessage,
    isCheckinDebugMode,
    isSafeDocumentId,
    normalizeCheckinPassState,
    parseQrPayload,
    validPassCount,
    validateQrToken
} from './checkin-validation.js';

export class CheckInError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
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

export { getCheckinErrorMessage, isCheckinDebugMode, parseQrPayload };

export const checkinService = {
    async registerEntry({ eventId, guestId, passes, method, qrToken = null, userId }) {
        if (!isSafeDocumentId(eventId) || !isSafeDocumentId(guestId) || !isSafeDocumentId(userId)) {
            throw new CheckInError('checkin/invalid-request');
        }
        if (!['qr', 'manual'].includes(method)) throw new CheckInError('checkin/invalid-method');
        const requestedPasses = validPassCount(passes);
        if (!requestedPasses) throw new CheckInError('checkin/invalid-pass-count');
        if (method === 'qr') validateQrToken(qrToken);

        const guestRef = doc(db, 'eventos', eventId, 'invitados', guestId);
        const checkinRef = doc(collection(db, 'eventos', eventId, 'checkins'));
        try {
            return await runTransaction(db, async (transaction) => {
                // Firestore requires transaction reads to happen before writes.
                const guestSnapshot = await transaction.get(guestRef);
                if (!guestSnapshot.exists()) throw new CheckInError('checkin/guest-not-found');

                const raw = guestSnapshot.data();
                if (method === 'qr' && (raw.qrActivo === false || raw.qrToken !== qrToken)) {
                    throw new CheckInError(raw.qrActivo === false ? 'checkin/qr-disabled' : 'checkin/invalid-token');
                }

                let passState;
                try {
                    passState = normalizeCheckinPassState(raw);
                } catch (error) {
                    if (error instanceof CheckinValidationError) throw new CheckInError(error.code);
                    throw error;
                }
                const { pasesTotales, pasesUtilizados, pasesDisponibles } = passState;
                if (pasesDisponibles <= 0) throw new CheckInError('checkin/passes-already-used');
                if (requestedPasses > pasesDisponibles) throw new CheckInError('checkin/insufficient-passes');

                const pasesUtilizadosDespues = pasesUtilizados + requestedPasses;
                const pasesDisponiblesDespues = pasesTotales - pasesUtilizadosDespues;
                const resultado = pasesDisponiblesDespues > 0 ? 'parcial' : 'aprobado';
                const guest = normalizeGuestData(raw);

                transaction.update(guestRef, {
                    pasesUtilizados: pasesUtilizadosDespues,
                    pasesDisponibles: pasesDisponiblesDespues,
                    llegadaRegistrada: true,
                    horaLlegada: raw.horaLlegada ?? serverTimestamp(),
                    estado: 'llego',
                    fechaActualizacion: serverTimestamp()
                });
                transaction.set(checkinRef, {
                    eventId,
                    invitadoId: guestId,
                    codigoInvitado: String(guest.codigoInvitado || ''),
                    nombreInvitado: String(guest.nombre || ''),
                    pasesRegistrados: requestedPasses,
                    pasesDisponiblesDespues,
                    fechaHora: serverTimestamp(),
                    registradoPor: userId,
                    metodo,
                    resultado
                });
                return {
                    guest: {
                        ...guest,
                        id: guestId,
                        pasesUtilizados: pasesUtilizadosDespues,
                        pasesDisponibles: pasesDisponiblesDespues
                    },
                    passesRegistered: requestedPasses,
                    result: resultado,
                    checkinId: checkinRef.id
                };
            });
        } catch (error) {
            if (isCheckinDebugMode()) {
                console.error('[Portal Check-in] Transaction failed', {
                    code: error?.code,
                    message: error?.message,
                    stack: error?.stack,
                    uid: userId,
                    eventId,
                    guestId,
                    requestedPasses
                });
            }
            throw error;
        }
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
