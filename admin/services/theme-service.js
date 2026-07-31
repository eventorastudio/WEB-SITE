// services/theme-service.js
/**
 * @fileoverview Servicio exclusivo para la gestión de Temas y Plantillas en Firestore.
 * 
 * Responsabilidad:
 * - Administrar el ciclo de vida CRUD de los temas visuales en la colección raíz 'themes'.
 * - Proveer utilidades de duplicación, exportación y sincronización de temas.
 * 
 * Qué tiene prohibido hacer:
 * - Tener acceso directo a la interfaz de usuario, DOM o notificaciones.
 * - Importar ui.js, state.js, helpers.js, event-bus.js u otros servicios.
 * - Devolver objetos internos de Firebase.
 * 
 * Cómo debe utilizarse:
 * - Invocarse desde themes.js, theme-builder.js o invitation-editor.js para guardar/cargar configuraciones de diseño.
 */

import { db } from '../firebase.js';
import { 
    collection, 
    doc, 
    getDocs, 
    getDoc, 
    setDoc, 
    deleteDoc, 
    query, 
    orderBy, 
    serverTimestamp,
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Transforma un DocumentSnapshot de Firestore en un POJO limpio de tema.
 * @private
 * @param {import('firebase/firestore').DocumentSnapshot} docSnap 
 * @returns {Object|null}
 */
function sanitizeThemeDoc(docSnap) {
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return {
        id: docSnap.id,
        ...data,
        fechaCreacion: data.fechaCreacion?.toDate ? data.fechaCreacion.toDate().toISOString() : null,
        fechaActualizacion: data.fechaActualizacion?.toDate ? data.fechaActualizacion.toDate().toISOString() : null
    };
}

export const themeService = {
    // 1. Funciones públicas CRUD

    /**
     * Obtiene todos los temas disponibles en la plataforma.
     * @returns {Promise<Array<Object>>} Lista limpia de temas.
     */
    async getAllThemes() {
        try {
            const themesRef = collection(db, 'themes');
            const q = query(themesRef, orderBy('nombre', 'asc'));
            const snapshot = await getDocs(q);

            const themes = [];
            snapshot.forEach(docSnap => {
                const cleaned = sanitizeThemeDoc(docSnap);
                if (cleaned) themes.push(cleaned);
            });
            return themes;
        } catch (error) {
            throw new Error(`theme/fetch-all-failed: ${error.message}`);
        }
    },

    /**
     * Obtiene un tema específico por su ID.
     * @param {string} themeId 
     * @returns {Promise<Object|null>}
     */
    async getThemeById(themeId) {
        if (!themeId) throw new Error('theme/invalid-id');
        try {
            const docRef = doc(db, 'themes', themeId);
            const docSnap = await getDoc(docRef);
            return sanitizeThemeDoc(docSnap);
        } catch (error) {
            throw new Error(`theme/fetch-one-failed: ${error.message}`);
        }
    },

    /**
     * Guarda o crea un tema utilizando un ID específico o generando uno nuevo.
     * @param {string|null} themeId - ID opcional. Si es null/nuevo, se genera referencia automática.
     * @param {Object} themeData 
     * @returns {Promise<string>} ID del documento guardado.
     */
    async saveTheme(themeId, themeData) {
        try {
            const themesRef = collection(db, 'themes');
            const docRef = themeId ? doc(themesRef, themeId) : doc(themesRef);
            
            const payload = {
                ...themeData,
                fechaActualizacion: serverTimestamp()
            };

            // Si es nuevo documento, agregamos fecha de creación
            if (!themeId) {
                payload.fechaCreacion = serverTimestamp();
            }

            await setDoc(docRef, payload, { merge: true });
            return docRef.id;
        } catch (error) {
            throw new Error(`theme/save-failed: ${error.message}`);
        }
    },

    /**
     * Elimina un tema de la base de datos por su ID.
     * @param {string} themeId 
     * @returns {Promise<void>}
     */
    async deleteTheme(themeId) {
        if (!themeId) throw new Error('theme/invalid-id');
        try {
            const docRef = doc(db, 'themes', themeId);
            await deleteDoc(docRef);
        } catch (error) {
            throw new Error(`theme/delete-failed: ${error.message}`);
        }
    },

    /**
     * Duplica un tema existente creando uno nuevo con sufijo en el nombre.
     * @param {Object} sourceTheme - Objeto de tema limpio original.
     * @returns {Promise<string>} ID del nuevo tema duplicado.
     */
    async duplicateTheme(sourceTheme) {
        if (!sourceTheme) throw new Error('theme/invalid-source');
        try {
            const newThemeData = JSON.parse(JSON.stringify(sourceTheme));
            delete newThemeData.id;
            newThemeData.nombre = `${newThemeData.nombre || 'Tema'} (Copia)`;
            
            return await this.saveTheme(null, newThemeData);
        } catch (error) {
            throw new Error(`theme/duplicate-failed: ${error.message}`);
        }
    },

    // 2. Funciones de suscripción (Realtime)

    /**
     * Escucha en tiempo real los cambios en la colección global de temas.
     * @param {Function} callback - Recibe la lista limpia de temas actualizada.
     * @returns {Function} Función de desuscripción.
     */
    subscribeToThemes(callback) {
        const themesRef = collection(db, 'themes');
        const q = query(themesRef, orderBy('nombre', 'asc'));

        return onSnapshot(q, (snapshot) => {
            const themes = [];
            snapshot.forEach(docSnap => {
                const cleaned = sanitizeThemeDoc(docSnap);
                if (cleaned) themes.push(cleaned);
            });
            callback(themes);
        }, (error) => {
            console.error('[ThemeService] Error en suscripción realtime de temas:', error);
        });
    }
};