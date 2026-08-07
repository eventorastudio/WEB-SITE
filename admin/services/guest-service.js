// Persistencia de invitados. Toda creación/importación cruza el contrato puro
// compartido antes de llegar a Firestore.

import { db } from '../firebase.js';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    serverTimestamp,
    updateDoc,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
    GUEST_ACCESS_TYPES,
    GUEST_STATUSES,
    GuestContractError,
    normalizeGuestData,
    normalizeGuestForCreate,
    normalizeGuestForUpdate,
    normalizeStoredGuestData,
    resolveGuestPassState,
    supportsQrAccess
} from '../../shared/guest-contract.js';

export {
    GUEST_ACCESS_TYPES,
    GUEST_STATUSES,
    normalizeGuestData,
    normalizeGuestForCreate,
    normalizeGuestForUpdate,
    normalizeStoredGuestData,
    resolveGuestPassState,
    supportsQrAccess
} from '../../shared/guest-contract.js';

const IMPORT_BATCH_SIZE = 400;

function sanitizeGuestDoc(docSnap) {
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return {
        ...normalizeStoredGuestData(data, { documentId: docSnap.id }),
        id: docSnap.id,
        fechaCreacion: toIsoString(data.fechaCreacion),
        fechaActualizacion: toIsoString(data.fechaActualizacion),
        horaLlegada: toIsoString(data.horaLlegada)
    };
}

function toIsoString(value) {
    return value?.toDate ? value.toDate().toISOString() : value ?? null;
}

function cleanGuestInput(guest) {
    const payload = {};
    Object.entries(guest || {}).forEach(([key, value]) => {
        if (['id', 'fechaCreacion', 'fechaActualizacion'].includes(key) || value === undefined) return;
        if (key === 'codigoInvitado' && value === '') return;
        payload[key] = value;
    });
    return payload;
}

function toFirestoreGuest(guest) {
    return {
        codigoInvitado: guest.codigoInvitado,
        nombre: guest.nombre,
        correo: guest.correo,
        telefono: guest.telefono,
        pases: guest.pases,
        pasesUtilizados: guest.pasesUtilizados,
        pasesDisponibles: guest.pasesDisponibles,
        mesa: guest.mesa,
        estado: guest.estado,
        confirmado: guest.confirmado,
        llegadaRegistrada: guest.llegadaRegistrada,
        horaLlegada: guest.llegadaRegistrada ? (guest.horaLlegada || serverTimestamp()) : null,
        tipoAcceso: guest.tipoAcceso,
        qrToken: guest.qrToken,
        qrActivo: guest.qrActivo,
        notas: guest.notas
    };
}

function sortGuestsByName(guests) {
    return [...guests].sort((left, right) => String(left.nombre || '').localeCompare(
        String(right.nombre || ''),
        'es',
        { sensitivity: 'base', numeric: true }
    ));
}

function createImportError(error, summary) {
    const importError = new Error(`guest/batch-import-failed: ${error.message}`);
    importError.completedBatches = summary.completedBatches;
    importError.totalBatches = summary.totalBatches;
    importError.importedCount = summary.guests.length;
    importError.guests = summary.guests;
    return importError;
}

function notifyProgress(callback, payload) {
    if (typeof callback !== 'function') return;
    try {
        callback(payload);
    } catch (error) {
        console.warn('[GuestService] El callback de progreso falló:', error);
    }
}

function wrapGuestServiceError(operation, error) {
    if (error instanceof GuestContractError || String(error?.code || error?.message || '').startsWith('guest/')) {
        throw error;
    }
    throw new Error(`guest/${operation}-failed: ${error?.message || 'unknown'}`);
}

export const guestService = {
    normalizeGuestData,
    normalizeGuestForCreate,
    normalizeGuestForUpdate,

    async getGuestsByEventId(eventId) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        try {
            const snapshot = await getDocs(collection(db, 'eventos', eventId, 'invitados'));
            return sortGuestsByName(snapshot.docs.map(sanitizeGuestDoc).filter(Boolean));
        } catch (error) {
            wrapGuestServiceError('fetch-all', error);
        }
    },

    async getGuestById(eventId, guestId) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            return sanitizeGuestDoc(await getDoc(doc(db, 'eventos', eventId, 'invitados', guestId)));
        } catch (error) {
            wrapGuestServiceError('fetch-one', error);
        }
    },

    async createGuest(eventId, guestData) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        try {
            const guest = normalizeGuestForCreate(guestData);
            const docRef = await addDoc(collection(db, 'eventos', eventId, 'invitados'), {
                ...toFirestoreGuest(guest),
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            });
            return docRef.id;
        } catch (error) {
            wrapGuestServiceError('create', error);
        }
    },

    async updateGuest(eventId, guestId, guestData) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            const docRef = doc(db, 'eventos', eventId, 'invitados', guestId);
            const current = await getDoc(docRef);
            if (!current.exists()) throw new Error('guest/not-found');

            const guest = normalizeGuestForUpdate(cleanGuestInput(guestData), current.data());
            await updateDoc(docRef, {
                ...toFirestoreGuest(guest),
                fechaActualizacion: serverTimestamp()
            });
        } catch (error) {
            wrapGuestServiceError('update', error);
        }
    },

    async deleteGuest(eventId, guestId) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            await deleteDoc(doc(db, 'eventos', eventId, 'invitados', guestId));
        } catch (error) {
            wrapGuestServiceError('delete', error);
        }
    },

    async importGuestsBatch(eventId, guestsArray, { onProgress } = {}) {
        if (!eventId || !Array.isArray(guestsArray)) throw new Error('guest/invalid-batch-params');
        let guests;
        try {
            // This is the Excel creation boundary too: every row receives the
            // exact same counters/code/QR initialization as manual creation.
            guests = guestsArray
                .filter((guest) => guest && typeof guest === 'object')
                .map((guest) => normalizeGuestForCreate(guest));
        } catch (error) {
            wrapGuestServiceError('batch-import', error);
        }

        const totalBatches = Math.ceil(guests.length / IMPORT_BATCH_SIZE);
        const summary = { guests: [], completedBatches: 0, totalBatches };
        if (guests.length === 0) return { ...summary, importedCount: 0 };

        const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
        try {
            for (let offset = 0; offset < guests.length; offset += IMPORT_BATCH_SIZE) {
                const chunk = guests.slice(offset, offset + IMPORT_BATCH_SIZE);
                const batch = writeBatch(db);
                const createdInBatch = [];

                chunk.forEach((guest) => {
                    const guestRef = doc(invitadosRef);
                    batch.set(guestRef, {
                        ...toFirestoreGuest(guest),
                        fechaCreacion: serverTimestamp(),
                        fechaActualizacion: serverTimestamp()
                    });
                    createdInBatch.push({
                        ...guest,
                        id: guestRef.id,
                        fechaCreacion: null,
                        fechaActualizacion: null,
                        horaLlegada: null
                    });
                });

                await batch.commit();
                summary.completedBatches += 1;
                summary.guests.push(...createdInBatch);
                notifyProgress(onProgress, {
                    completedBatches: summary.completedBatches,
                    totalBatches,
                    importedCount: summary.guests.length,
                    totalCount: guests.length
                });
            }
            return { ...summary, importedCount: summary.guests.length };
        } catch (error) {
            throw createImportError(error, summary);
        }
    },

    subscribeToGuests(eventId, callback, onError) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        if (typeof callback !== 'function') throw new Error('guest/invalid-subscriber');

        return onSnapshot(collection(db, 'eventos', eventId, 'invitados'), (snapshot) => {
            callback(sortGuestsByName(snapshot.docs.map(sanitizeGuestDoc).filter(Boolean)));
        }, (error) => {
            if (typeof onError === 'function') return onError(error);
            console.error('[GuestService] Error en suscripción realtime:', error);
        });
    }
};
