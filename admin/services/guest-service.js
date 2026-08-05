// services/guest-service.js
// Servicio exclusivo para la gestión de invitados en Firestore.

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

const IMPORT_BATCH_SIZE = 400;

/** Convierte un DocumentSnapshot en un POJO sin referencias de Firebase. */
function sanitizeGuestDoc(docSnap) {
    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    return {
        ...data,
        id: docSnap.id,
        fechaCreacion: toIsoString(data.fechaCreacion),
        fechaActualizacion: toIsoString(data.fechaActualizacion)
    };
}

function toIsoString(value) {
    return value?.toDate ? value.toDate().toISOString() : value ?? null;
}

/**
 * Evita enviar undefined, IDs internos o timestamps del cliente a Firestore.
 * Los módulos visuales entregan POJOs ya validados; esta limpieza es una segunda barrera.
 */
function toWritableGuest(guest) {
    const payload = {};
    Object.entries(guest || {}).forEach(([key, value]) => {
        if (['id', 'fechaCreacion', 'fechaActualizacion'].includes(key) || value === undefined) return;
        payload[key] = value;
    });
    return payload;
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

export const guestService = {
    /** Obtiene todos los invitados de un evento como POJOs ordenados en el cliente. */
    async getGuestsByEventId(eventId) {
        if (!eventId) throw new Error('guest/invalid-event-id');

        try {
            const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
            const snapshot = await getDocs(invitadosRef);
            const guests = [];

            snapshot.forEach((docSnap) => {
                const cleaned = sanitizeGuestDoc(docSnap);
                if (cleaned) guests.push(cleaned);
            });

            return sortGuestsByName(guests);
        } catch (error) {
            throw new Error(`guest/fetch-all-failed: ${error.message}`);
        }
    },

    /** Obtiene un invitado específico por su ID. */
    async getGuestById(eventId, guestId) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');

        try {
            const docRef = doc(db, 'eventos', eventId, 'invitados', guestId);
            return sanitizeGuestDoc(await getDoc(docRef));
        } catch (error) {
            throw new Error(`guest/fetch-one-failed: ${error.message}`);
        }
    },

    /** Crea un invitado y devuelve el ID del documento creado. */
    async createGuest(eventId, guestData) {
        if (!eventId) throw new Error('guest/invalid-event-id');

        try {
            const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
            const docRef = await addDoc(invitadosRef, {
                ...toWritableGuest(guestData),
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            });
            return docRef.id;
        } catch (error) {
            throw new Error(`guest/create-failed: ${error.message}`);
        }
    },

    /** Actualiza los campos editables de un invitado existente. */
    async updateGuest(eventId, guestId, guestData) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');

        try {
            const docRef = doc(db, 'eventos', eventId, 'invitados', guestId);
            await updateDoc(docRef, {
                ...toWritableGuest(guestData),
                fechaActualizacion: serverTimestamp()
            });
        } catch (error) {
            throw new Error(`guest/update-failed: ${error.message}`);
        }
    },

    /** Elimina un invitado del evento activo. */
    async deleteGuest(eventId, guestId) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');

        try {
            await deleteDoc(doc(db, 'eventos', eventId, 'invitados', guestId));
        } catch (error) {
            throw new Error(`guest/delete-failed: ${error.message}`);
        }
    },

    /**
     * Importa invitados en lotes de 400 operaciones, por debajo del límite de Firestore.
     * @returns {Promise<{guests: Object[], importedCount: number, completedBatches: number, totalBatches: number}>}
     */
    async importGuestsBatch(eventId, guestsArray, { onProgress } = {}) {
        if (!eventId || !Array.isArray(guestsArray)) throw new Error('guest/invalid-batch-params');

        const guests = guestsArray
            .filter((guest) => guest && typeof guest === 'object')
            .map(toWritableGuest);
        const totalBatches = Math.ceil(guests.length / IMPORT_BATCH_SIZE);
        const summary = { guests: [], completedBatches: 0, totalBatches };

        if (guests.length === 0) {
            return { ...summary, importedCount: 0 };
        }

        const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
        const createdAt = new Date().toISOString();

        try {
            for (let offset = 0; offset < guests.length; offset += IMPORT_BATCH_SIZE) {
                const chunk = guests.slice(offset, offset + IMPORT_BATCH_SIZE);
                const batch = writeBatch(db);
                const createdInBatch = [];

                chunk.forEach((guest) => {
                    const guestRef = doc(invitadosRef);
                    batch.set(guestRef, {
                        ...guest,
                        fechaCreacion: serverTimestamp(),
                        fechaActualizacion: serverTimestamp()
                    });
                    createdInBatch.push({
                        ...guest,
                        id: guestRef.id,
                        fechaCreacion: createdAt,
                        fechaActualizacion: createdAt
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

    /** Escucha cambios en tiempo real y devuelve una función de desuscripción. */
    subscribeToGuests(eventId, callback, onError) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        if (typeof callback !== 'function') throw new Error('guest/invalid-subscriber');

        const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
        return onSnapshot(invitadosRef, (snapshot) => {
            const guests = [];
            snapshot.forEach((docSnap) => {
                const cleaned = sanitizeGuestDoc(docSnap);
                if (cleaned) guests.push(cleaned);
            });
            callback(sortGuestsByName(guests));
        }, (error) => {
            if (typeof onError === 'function') {
                onError(error);
                return;
            }
            console.error('[GuestService] Error en suscripción realtime:', error);
        });
    }
};
