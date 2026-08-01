// services/guest-service.js
/**
 * @fileoverview Servicio exclusivo para la gestión de Invitados en Firestore.
 * 
 * Responsabilidad:
 * - Administrar el ciclo de vida CRUD de los invitados asociados a un evento.
 * - Ejecutar operaciones masivas (batch/importación).
 * - Proveer canales de sincronización en tiempo real (Realtime Listeners).
 * 
 * Qué tiene prohibido hacer:
 * - Tener acceso directo a la interfaz de usuario, DOM o notificaciones (Toasts, Modales).
 * - Importar ui.js, state.js, helpers.js, event-bus.js u otros servicios.
 * - Devolver objetos internos de Firebase (DocumentSnapshot, QuerySnapshot, etc.).
 * 
 * Cómo debe utilizarse:
 * - Invocarse desde los módulos de interfaz (ej. excel-import.js) para sincronizar o consultar invitados.
 */

import { db } from '../firebase.js';
import { 
    collection, 
    doc, 
    getDocs, 
    getDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    writeBatch,
    query, 
    orderBy, 
    serverTimestamp,
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Transforma un DocumentSnapshot de Firestore en un POJO limpio de invitado.
 * @private
 * @param {import('firebase/firestore').DocumentSnapshot} docSnap 
 * @returns {Object|null}
 */
function sanitizeGuestDoc(docSnap) {
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return {
        id: docSnap.id,
        ...data,
        fechaCreacion: data.fechaCreacion?.toDate ? data.fechaCreacion.toDate().toISOString() : null,
        fechaActualizacion: data.fechaActualizacion?.toDate ? data.fechaActualizacion.toDate().toISOString() : null
    };
}

export const guestService = {
    // 1. Funciones públicas CRUD

    /**
     * Obtiene la lista de invitados de un evento específico.
     * @param {string} eventId 
     * @returns {Promise<Array<Object>>} Lista limpia de invitados.
     */
    async getGuestsByEventId(eventId) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        try {
            const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
            const q = query(invitadosRef, orderBy('nombre', 'asc'));
            const snapshot = await getDocs(q);

            const guests = [];
            snapshot.forEach(docSnap => {
                const cleaned = sanitizeGuestDoc(docSnap);
                if (cleaned) guests.push(cleaned);
            });
            return guests;
        } catch (error) {
            throw new Error(`guest/fetch-all-failed: ${error.message}`);
        }
    },

    /**
     * Obtiene un invitado específico por su ID dentro de un evento.
     * @param {string} eventId 
     * @param {string} guestId 
     * @returns {Promise<Object|null>}
     */
    async getGuestById(eventId, guestId) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            const docRef = doc(db, 'eventos', eventId, 'invitados', guestId);
            const docSnap = await getDoc(docRef);
            return sanitizeGuestDoc(docSnap);
        } catch (error) {
            throw new Error(`guest/fetch-one-failed: ${error.message}`);
        }
    },

    /**
     * Crea un nuevo invitado para un evento.
     * @param {string} eventId 
     * @param {Object} guestData 
     * @returns {Promise<string>} ID del invitado creado.
     */
    async createGuest(eventId, guestData) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        try {
            const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
            const payload = {
                ...guestData,
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            };
            const docRef = await addDoc(invitadosRef, payload);
            return docRef.id;
        } catch (error) {
            throw new Error(`guest/create-failed: ${error.message}`);
        }
    },

    /**
     * Actualiza los datos de un invitado existente.
     * @param {string} eventId 
     * @param {string} guestId 
     * @param {Object} guestData 
     * @returns {Promise<void>}
     */
    async updateGuest(eventId, guestId, guestData) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            const docRef = doc(db, 'eventos', eventId, 'invitados', guestId);
            const payload = {
                ...guestData,
                fechaActualizacion: serverTimestamp()
            };
            await updateDoc(docRef, payload);
        } catch (error) {
            throw new Error(`guest/update-failed: ${error.message}`);
        }
    },

    /**
     * Elimina un invitado de la base de datos.
     * @param {string} eventId 
     * @param {string} guestId 
     * @returns {Promise<void>}
     */
    async deleteGuest(eventId, guestId) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            const docRef = doc(db, 'eventos', eventId, 'invitados', guestId);
            await deleteDoc(docRef);
        } catch (error) {
            throw new Error(`guest/delete-failed: ${error.message}`);
        }
    },

    /**
     * Realiza una importación masiva por lotes (Batch) para múltiples invitados.
     * @param {string} eventId 
     * @param {Array<Object>} guestsArray 
     * @returns {Promise<void>}
     */
    async importGuestsBatch(eventId, guestsArray) {
        if (!eventId || !Array.isArray(guestsArray)) throw new Error('guest/invalid-batch-params');
        try {
            const batch = writeBatch(db);
            const invitadosRef = collection(db, 'eventos', eventId, 'invitados');

            guestsArray.forEach(guest => {
                const newDocRef = doc(invitadosRef);
                batch.set(newDocRef, {
                    ...guest,
                    fechaCreacion: serverTimestamp(),
                    fechaActualizacion: serverTimestamp()
                });
            });

            await batch.commit();
        } catch (error) {
            throw new Error(`guest/batch-import-failed: ${error.message}`);
        }
    },

    // 2. Funciones de suscripción (Realtime)

    /**
     * Escucha en tiempo real los cambios en la lista de invitados de un evento.
     * @param {string} eventId 
     * @param {Function} callback - Recibe la lista limpia de invitados actualizada.
     * @returns {Function} Función de desuscripción.
     */
    subscribeToGuests(eventId, callback) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
        const q = query(invitadosRef, orderBy('nombre', 'asc'));

        return onSnapshot(q, (snapshot) => {
            const guests = [];
            snapshot.forEach(docSnap => {
                const cleaned = sanitizeGuestDoc(docSnap);
                if (cleaned) guests.push(cleaned);
            });
            callback(guests);
        }, (error) => {
            console.error('[GuestService] Error en suscripción realtime:', error);
        });
    }
};
