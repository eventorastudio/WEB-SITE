// modules/profile/profile-module.js
// Controlador de interfaz del perfil interno del panel administrativo.

import { ui } from '../../core/ui.js';
import {
    changeAdminEmail,
    changeAdminPassword,
    getAdminProfile,
    getGlobalSessionSignOutCapability,
    saveAdminProfile
} from '../../services/admin-profile-service.js';
import { CONFIG } from '../../config.js';
import { collectSystemSnapshot } from '../system/system-diagnostics.js';

let cleanups = [];
let activeRoleContext = null;

/**
 * Inicializa el perfil del administrador autenticado.
 * @param {{user: Object, roleContext: Object}} context
 * @returns {void}
 */
export function initProfileModule(context) {
    destroyProfileModule();
    activeRoleContext = context.roleContext;
    const profile = getAdminProfile();
    renderProfile(profile, context.roleContext);
    bindProfileEvents();
}

/** Libera los listeners del perfil al abandonar la página. */
export function destroyProfileModule() {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    activeRoleContext = null;
}

function renderProfile(profile, roleContext) {
    const name = profile.name || profile.email.split('@')[0] || 'Administrador';
    const creation = formatDate(profile.creationTime);
    const lastSignIn = formatDate(profile.lastSignInTime);

    setText('profile-header-name', name);
    setText('profile-header-role', roleContext.role === 'CEO' ? 'CEO · Eventora Studio' : roleContext.role);
    setText('profile-header-email', profile.email || 'No disponible');
    setText('profile-header-uid', profile.uid || 'No disponible');
    setText('profile-account-created', creation);
    setText('profile-last-signin', lastSignIn);
    setText('profile-last-device', 'No disponible');
    setText('company-name-value', profile.company || CONFIG.APP_NAME);
    setText('company-panel-version', CONFIG.VERSION);
    setText('company-system-version', CONFIG.VERSION);

    setInputValue('profile-name', profile.name);
    setInputValue('profile-email', profile.email);
    setInputValue('profile-phone', profile.phone);
    setInputValue('profile-company', profile.company);
    setInputValue('profile-website', profile.website);
    setInputValue('profile-instagram', profile.instagram);
    setInputValue('profile-whatsapp', profile.whatsappBusiness);
    setInputValue('profile-brand-logo', profile.brandLogo || CONFIG.LOGO);

    updateAvatar(name, profile.photoURL);
    updateBrandLogo(profile.brandLogo || CONFIG.LOGO);
    void renderCompanyStatuses();
}

async function renderCompanyStatuses() {
    try {
        const snapshot = await collectSystemSnapshot();
        const statusIds = {
            Firebase: 'company-status-firebase',
            Firestore: 'company-status-firestore',
            'Firebase Authentication': 'company-status-authentication',
            Hosting: 'company-status-hosting'
        };
        snapshot.services.forEach((service) => {
            const element = document.getElementById(statusIds[service.name]);
            if (!element) return;
            element.textContent = service.status;
            element.dataset.status = service.status === 'Disponible' || service.status === 'Conectado' ? 'available' : 'unavailable';
        });
    } catch (error) {
        console.warn('[Profile] No se pudo comprobar el estado de la empresa.', error);
    }
}

function bindProfileEvents() {
    listen(document.getElementById('profile-form'), 'submit', handleProfileSubmit);
    listen(document.getElementById('profile-brand-logo'), 'input', (event) => updateBrandLogo(event.target.value));
    listen(document.getElementById('btn-open-password-modal'), 'click', () => openModal('password-modal'));
    listen(document.getElementById('btn-open-email-modal'), 'click', () => openModal('email-modal'));
    listen(document.getElementById('btn-close-all-sessions'), 'click', handleGlobalSessionRequest);
    listen(document.getElementById('password-form'), 'submit', handlePasswordSubmit);
    listen(document.getElementById('email-form'), 'submit', handleEmailSubmit);
    document.querySelectorAll('[data-close-profile-modal]').forEach((button) => listen(button, 'click', closeActiveModal));
    document.querySelectorAll('.profile-modal').forEach((modal) => listen(modal, 'click', handleModalOverlayClick));
    listen(document, 'keydown', handleEscape);
}

async function handleProfileSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const saveButton = document.getElementById('btn-save-profile');
    setButtonBusy(saveButton, true);

    try {
        const savedProfile = await saveAdminProfile({
            name: getValue('profile-name'),
            phone: getValue('profile-phone'),
            company: getValue('profile-company'),
            website: getValue('profile-website'),
            instagram: getValue('profile-instagram'),
            whatsappBusiness: getValue('profile-whatsapp'),
            brandLogo: getValue('profile-brand-logo')
        });

        renderProfile(savedProfile, activeRoleContext ?? { role: 'CEO' });
        ui.showToast({ title: 'Perfil actualizado', message: 'Los cambios se guardaron correctamente.', type: 'success' });
    } catch (error) {
        console.error('[Profile] No se pudo guardar el perfil.', error);
        ui.showError({ title: 'No se pudo guardar', description: 'Revisa los datos e inténtalo nuevamente.', code: 'ERR_PROFILE_SAVE' });
    } finally {
        setButtonBusy(saveButton, false);
    }
}

async function handlePasswordSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const newPassword = getValue('new-password');

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    if (newPassword !== getValue('confirm-password')) {
        ui.showToast({ title: 'Contraseñas distintas', message: 'La confirmación no coincide con la nueva contraseña.', type: 'warning' });
        return;
    }

    const button = document.getElementById('btn-save-password');
    setButtonBusy(button, true);
    try {
        await changeAdminPassword({ currentPassword: getValue('current-password'), newPassword });
        form.reset();
        closeModal('password-modal');
        ui.showToast({ title: 'Contraseña actualizada', message: 'La nueva contraseña ya está activa.', type: 'success' });
    } catch (error) {
        console.error('[Profile] No se pudo cambiar la contraseña.', error);
        ui.showError({ title: 'No se pudo cambiar la contraseña', description: 'Confirma tu contraseña actual y vuelve a intentarlo.', code: error.message || 'ERR_PASSWORD_UPDATE' });
    } finally {
        setButtonBusy(button, false);
    }
}

async function handleEmailSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const button = document.getElementById('btn-save-email');
    const newEmail = getValue('new-email');
    setButtonBusy(button, true);
    try {
        await changeAdminEmail({ currentPassword: getValue('current-email-password'), newEmail });
        form.reset();
        closeModal('email-modal');
        setInputValue('profile-email', newEmail);
        ui.showToast({ title: 'Correo actualizado', message: 'Firebase puede solicitar verificación adicional para el nuevo correo.', type: 'success' });
    } catch (error) {
        console.error('[Profile] No se pudo cambiar el correo.', error);
        ui.showError({ title: 'No se pudo cambiar el correo', description: 'Confirma tu contraseña actual y vuelve a intentarlo.', code: error.message || 'ERR_EMAIL_UPDATE' });
    } finally {
        setButtonBusy(button, false);
    }
}

function handleGlobalSessionRequest() {
    const capability = getGlobalSessionSignOutCapability();
    ui.showToast({ title: 'No disponible', message: capability.reason, type: 'info', duration: 6000 });
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    modal.querySelector('input')?.focus();
}

function closeActiveModal() {
    document.querySelectorAll('.profile-modal.active').forEach((modal) => closeModal(modal.id));
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.profile-modal.active')) document.body.classList.remove('modal-open');
}

function handleModalOverlayClick(event) {
    if (event.target === event.currentTarget) closeModal(event.currentTarget.id);
}

function handleEscape(event) {
    if (event.key === 'Escape') closeActiveModal();
}

function updateAvatar(name, photoUrl) {
    const avatar = document.getElementById('profile-header-avatar');
    const image = document.getElementById('profile-header-avatar-image');
    if (!avatar || !image) return;

    avatar.textContent = (name || 'A').charAt(0).toUpperCase();
    if (isSafeImageUrl(photoUrl)) {
        image.src = photoUrl;
        image.hidden = false;
        avatar.classList.add('has-image');
    } else {
        image.removeAttribute('src');
        image.hidden = true;
        avatar.classList.remove('has-image');
    }
}

function updateBrandLogo(value) {
    const image = document.getElementById('profile-brand-logo-preview');
    const fallback = document.getElementById('profile-brand-logo-fallback');
    if (!image || !fallback) return;

    if (isSafeImageUrl(value)) {
        image.src = value;
        image.hidden = false;
        fallback.hidden = true;
    } else {
        image.removeAttribute('src');
        image.hidden = true;
        fallback.hidden = false;
    }
}

function isSafeImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
        const url = new URL(value, window.location.origin);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
}

function formatDate(value) {
    if (!value) return 'No disponible';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No disponible';
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

function getValue(id) {
    return String(document.getElementById(id)?.value ?? '').trim();
}

function setInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? '';
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function setButtonBusy(button, isBusy) {
    if (!button) return;
    button.disabled = isBusy;
    button.setAttribute('aria-busy', String(isBusy));
}

function listen(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    cleanups.push(() => target.removeEventListener(eventName, handler));
}
