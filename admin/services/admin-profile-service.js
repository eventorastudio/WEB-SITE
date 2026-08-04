// services/admin-profile-service.js
// Adaptador de perfil interno: combina campos reales de Firebase Auth con preferencias locales.

import { auth } from '../firebase.js';
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updateEmail,
    updatePassword,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getUserPreferences, saveUserPreferences } from './admin-preferences-service.js';

const PROFILE_DEFAULTS = Object.freeze({
    phone: '',
    company: 'Eventora Studio',
    website: '',
    instagram: '',
    whatsappBusiness: '',
    brandLogo: ''
});

/** @returns {Object} Perfil combinado del usuario autenticado. */
export function getAdminProfile() {
    const user = auth.currentUser;
    if (!user) throw new Error('profile/auth-required');

    return {
        uid: user.uid,
        name: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        emailVerified: Boolean(user.emailVerified),
        creationTime: user.metadata?.creationTime || null,
        lastSignInTime: user.metadata?.lastSignInTime || null,
        ...getUserPreferences(user.uid, 'profile', PROFILE_DEFAULTS)
    };
}

/**
 * Actualiza solo los campos permitidos por Firebase Auth y la ficha local interna.
 * @param {Object} input
 * @returns {Promise<Object>}
 */
export async function saveAdminProfile(input) {
    const user = auth.currentUser;
    if (!user) throw new Error('profile/auth-required');

    const name = String(input?.name ?? '').trim();
    if (name !== (user.displayName || '')) {
        await updateProfile(user, { displayName: name || null });
    }

    const profileExtras = {
        phone: String(input?.phone ?? '').trim(),
        company: String(input?.company ?? PROFILE_DEFAULTS.company).trim() || PROFILE_DEFAULTS.company,
        website: String(input?.website ?? '').trim(),
        instagram: String(input?.instagram ?? '').trim(),
        whatsappBusiness: String(input?.whatsappBusiness ?? '').trim(),
        brandLogo: String(input?.brandLogo ?? '').trim()
    };

    saveUserPreferences(user.uid, 'profile', profileExtras);
    return getAdminProfile();
}

/**
 * Cambia la contraseña tras reautenticación explícita del propietario de la cuenta.
 * @param {{currentPassword: string, newPassword: string}} input
 * @returns {Promise<void>}
 */
export async function changeAdminPassword({ currentPassword, newPassword }) {
    const user = requirePasswordUser();
    await reauthenticate(user, currentPassword);
    await updatePassword(user, newPassword);
}

/**
 * Cambia el correo tras reautenticación; Firebase puede exigir verificación adicional.
 * @param {{currentPassword: string, newEmail: string}} input
 * @returns {Promise<void>}
 */
export async function changeAdminEmail({ currentPassword, newEmail }) {
    const user = requirePasswordUser();
    await reauthenticate(user, currentPassword);
    await updateEmail(user, String(newEmail ?? '').trim());
}

/**
 * Firebase Client SDK no expone revocación global de refresh tokens. El método
 * explícito evita simular una acción que requiere Admin SDK en un servidor seguro.
 * @returns {{available: false, reason: string}}
 */
export function getGlobalSessionSignOutCapability() {
    return {
        available: false,
        reason: 'Requiere Firebase Admin SDK en un entorno de servidor seguro.'
    };
}

function requirePasswordUser() {
    const user = auth.currentUser;
    if (!user?.email) throw new Error('profile/password-provider-required');
    return user;
}

async function reauthenticate(user, currentPassword) {
    if (!currentPassword) throw new Error('profile/current-password-required');
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
}
