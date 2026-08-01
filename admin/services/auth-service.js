// services/auth-service.js
// Servicio exclusivo para la gestión de Autenticación de Firebase

import { auth } from '../firebase.js';
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    setPersistence, 
    browserLocalPersistence, 
    browserSessionPersistence 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/**
 * Transforma un objeto User nativo de Firebase en un POJO limpio y seguro.
 * @param {import('firebase/auth').User|null} firebaseUser 
 * @returns {Object|null}
 */
function sanitizeUser(firebaseUser) {
    if (!firebaseUser) return null;
    return {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || null,
        emailVerified: firebaseUser.emailVerified,
        photoURL: firebaseUser.photoURL || null
    };
}

export const authService = {
    /**
     * Inicia sesión con correo y contraseña, configurando la persistencia.
     * @param {string} email 
     * @param {string} password 
     * @param {boolean} keepSession - True para persistencia local, false para sesión.
     * @returns {Promise<Object>} Usuario autenticado limpio.
     */
    async login(email, password, keepSession = false) {
        try {
            const persistenceType = keepSession ? browserLocalPersistence : browserSessionPersistence;
            await setPersistence(auth, persistenceType);
            
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return sanitizeUser(userCredential.user);
        } catch (error) {
            // Se lanza el error limpio sin manipular UI ni mostrar alertas
            throw new Error(error.code || 'auth/unknown-error');
        }
    },

    /**
     * Cierra la sesión activa del usuario.
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            await signOut(auth);
        } catch (error) {
            throw new Error(error.code || 'auth/logout-failed');
        }
    },

    /**
     * Obtiene el usuario autenticado actual de forma síncrona.
     * @returns {Object|null}
     */
    getCurrentUser() {
        return sanitizeUser(auth.currentUser);
    },

    /**
     * Observa los cambios de estado de autenticación en tiempo real.
     * @param {Function} callback - Recibe el usuario limpio (o null).
     * @returns {Function} Función de desuscripción.
     */
    onAuthStateChange(callback) {
        return onAuthStateChanged(auth, (user) => {
            callback(sanitizeUser(user));
        });
    }
};
