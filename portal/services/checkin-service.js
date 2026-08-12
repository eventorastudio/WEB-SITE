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
import {
    buildCheckinMutation,
    getGuestAffectedFields,
    CheckinValidationError,
    getCheckinErrorMessage,
    isCheckinDebugMode,
    isSafeDocumentId,
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
        const eventRef = doc(db, 'eventos', eventId);
        const transactionDebug = {
            checkinId: null,
            affectedGuestFields: [],
            updatesEventStats: false
        };
        try {
            return await runTransaction(db, async (transaction) => {
                // Firestore requires all transaction reads before its writes.
                const [eventSnapshot, guestSnapshot] = await Promise.all([
                    transaction.get(eventRef),
                    transaction.get(guestRef)
                ]);
                if (!eventSnapshot.exists()) throw new CheckInError('checkin/event-not-found');
                if (eventSnapshot.data().guestRenumberingInProgress === true) {
                    throw new CheckInError('checkin/guest-renumbering-in-progress');
                }
                if (eventSnapshot.data().checkinRenumberingInProgress === true) {
                    throw new CheckInError('checkin/renumbering-in-progress');
                }
                if (!guestSnapshot.exists()) throw new CheckInError('checkin/guest-not-found');

                let mutation;
                try {
                    mutation = buildCheckinMutation({
                        guest: guestSnapshot.data(),
                        eventId,
                        guestId,
                        requestedPasses,
                        method,
                        qrToken,
                        userId,
                        // One transform is reused in all new timestamps. Rules
                        // observe it as request.time in the transaction.
                        timestamp: serverTimestamp()
                    });
                } catch (error) {
                    if (error instanceof CheckinValidationError) throw new CheckInError(error.code);
                    throw error;
                }

                const checkinRef = doc(db, 'eventos', eventId, 'checkins', mutation.checkinId);
                transactionDebug.checkinId = mutation.checkinId;
                transactionDebug.affectedGuestFields = getGuestAffectedFields(
                    guestSnapshot.data(),
                    mutation.guestUpdate
                );
                const existingCheckin = await transaction.get(checkinRef);
                if (existingCheckin.exists()) throw new CheckInError('checkin/id-conflict');

                const updatedGuest = {
                    ...mutation.guest,
                    estado: 'llego',
                    confirmado: true,
                    llegadaRegistrada: true,
                    horaLlegada: guestSnapshot.data().horaLlegada ?? mutation.checkinRecord.fechaHora
                };
                transaction.update(guestRef, mutation.guestUpdate);
                transaction.set(checkinRef, mutation.checkinRecord);
                return {
                    guest: { ...updatedGuest, id: guestId },
                    passesRegistered: mutation.passesRegistered,
                    result: mutation.result,
                    checkinId: mutation.checkinId
                };
            });
        } catch (error) {
            if (isCheckinDebugMode()) {
                console.error('[CheckIn Transaction]', {
                    code: error?.code,
                    message: error?.message,
                    eventId,
                    guestId,
                    uid: userId,
                    checkinId: transactionDebug.checkinId,
                    affectedGuestFields: transactionDebug.affectedGuestFields,
                    updatesEventStats: transactionDebug.updatesEventStats
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
