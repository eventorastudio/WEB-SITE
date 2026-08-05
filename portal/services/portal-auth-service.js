import { auth } from '../firebase.js';
import {
    browserLocalPersistence,
    browserSessionPersistence,
    onAuthStateChanged,
    sendPasswordResetEmail,
    setPersistence,
    signInWithEmailAndPassword,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

function sanitizeUser(user) {
    if (!user) return null;
    return {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        emailVerified: Boolean(user.emailVerified)
    };
}

export const portalAuthService = {
    async login(email, password, keepSession) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail || !password) throw new Error('portal-auth/credentials-required');
        await setPersistence(auth, keepSession ? browserLocalPersistence : browserSessionPersistence);
        try {
            const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
            return sanitizeUser(credential.user);
        } catch (error) {
            throw new Error(error?.code || 'portal-auth/login-failed');
        }
    },

    async sendRecovery(email) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail) throw new Error('portal-auth/email-required');
        try {
            await sendPasswordResetEmail(auth, normalizedEmail);
        } catch (error) {
            throw new Error(error?.code || 'portal-auth/recovery-failed');
        }
    },

    async logout() {
        try {
            await signOut(auth);
        } catch (error) {
            throw new Error(error?.code || 'portal-auth/logout-failed');
        }
    },

    getCurrentUser() {
        return sanitizeUser(auth.currentUser);
    },

    observe(callback) {
        return onAuthStateChanged(auth, (user) => callback(sanitizeUser(user)));
    },

    waitForSession() {
        if (auth.currentUser) return Promise.resolve(sanitizeUser(auth.currentUser));
        return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                unsubscribe();
                resolve(sanitizeUser(user));
            });
        });
    }
};
