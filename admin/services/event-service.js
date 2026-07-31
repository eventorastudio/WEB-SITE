// services/event-service.js
// Servicio exclusivo para la gestión de Eventos en Firestore

import { db } from '../firebase.js';
import { 
    collection, 
    doc, 
    getDocs, 
    getDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    orderBy, 
    limit, 
    serverTimestamp,
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Transforma un DocumentSnapshot de Firestore en un POJO limpio.
 * @param {import('firebase/firestore').DocumentSnapshot} docSnap 
 * @returns {Object|null}
 */
function sanitizeEventDoc(docSnap) {
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return {
        id: docSnap.id,
        ...data,
        // Normalización opcional de marcas de tiempo de Firestore a milisegundos si fuera necesario
        fechaCreacion: data.fechaCreacion?.toDate ? data.fechaCreacion.toDate().toISOString() : null,
        fechaActualizacion: data.fechaActualizacion?.toDate ? data.fechaActualizacion.toDate().toISOString() : null
    };
}

export const eventService = {
    /**
     * Obtiene la lista completa de eventos ordenada por fecha descendente.
     * @returns {Promise<Array<Object>>} Lista de eventos limpios.
     */
    async getAllEvents() {
        try {
            const eventosRef = collection(db, 'eventos');
            const q = query(eventosRef, orderBy('fecha', 'desc'));
            const snapshot = await getDocs(q);
            
            const events = [];
            snapshot.forEach(docSnap => {
                const cleaned = sanitizeEventDoc(docSnap);
                if (cleaned) events.push(cleaned);
            });
            return events;
        } catch (error) {
            throw new Error(`event/fetch-all-failed: ${error.message}`);
        }
    },

    /**
     * Obtiene un evento específico por su ID.
     * @param {string} eventId 
     * @returns {Promise<Object|null>} Datos limpios del evento o null.
     */
    async getEventById(eventId) {
        if (!eventId) throw new Error('event/invalid-id');
        try {
            const docRef = doc(db, 'eventos', eventId);
            const docSnap = await getDoc(docRef);
            return sanitizeEventDoc(docSnap);
        } catch (error) {
            throw new Error(`event/fetch-one-failed: ${error.message}`);
        }
    },

    /**
     * Crea un nuevo evento en Firestore.
     * @param {Object} eventData - Datos limpios del formulario.
     * @returns {Promise<string>} ID del documento recién creado.
     */
    async createEvent(eventData) {
        try {
            const payload = {
                ...eventData,
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, 'eventos'), payload);
            return docRef.id;
        } catch (error) {
            throw new Error(`event/create-failed: ${error.message}`);
        }
    },

    /**
     * Actualiza un evento existente en Firestore.
     * @param {string} eventId 
     * @param {Object} eventData - Campos a modificar.
     * @returns {Promise<void>}
     */
    async updateEvent(eventId, eventData) {
        if (!eventId) throw new Error('event/invalid-id');
        try {
            const docRef = doc(db, 'eventos', eventId);
            const payload = {
                ...eventData,
                fechaActualizacion: serverTimestamp()
            };
            await updateDoc(docRef, payload);
        } catch (error) {
            throw new Error(`event/update-failed: ${error.message}`);
        }
    },

    /**
     * Elimina un evento de Firestore por su ID.
     * @param {string} eventId 
     * @returns {Promise<void>}
     */
    async deleteEvent(eventId) {
        if (!eventId) throw new Error('event/invalid-id');
        try {
            const docRef = doc(db, 'eventos', eventId);
            await deleteDoc(docRef);
        } catch (error) {
            throw new Error(`event/delete-failed: ${error.message}`);
        }
    },

    /**
     * Obtiene el código de evento secuencial más reciente para autoincremento.
     * @returns {Promise<string|null>} Último código (ej. 'EVT-0005') o null.
     */
    async getLastEventCode() {
        try {
            const eventosRef = collection(db, 'eventos');
            const q = query(eventosRef, orderBy('codigoEvento', 'desc'), limit(1));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) return null;
            return snapshot.docs[0].data().codigoEvento || null;
        } catch (error) {
            throw new Error(`event/last-code-failed: ${error.message}`);
        }
    }
};