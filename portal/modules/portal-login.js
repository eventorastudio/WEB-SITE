import { buildPortalUrl, PORTAL_CONFIG } from '../config.js';
import { portalAuthService } from '../services/portal-auth-service.js';
import { portalUi } from '../core/portal-ui.js';

document.addEventListener('DOMContentLoaded', initLogin);

function initLogin() {
    const form = document.getElementById('portal-login-form');
    const recover = document.getElementById('portal-recover');
    const loginButton = document.getElementById('portal-login-submit');
    portalAuthService.observe((user) => {
        if (user) redirectAfterLogin();
    });
    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFeedback();
        portalUi.setBusy(loginButton, true, 'Verificando acceso...');
        try {
            await portalAuthService.login(
                document.getElementById('portal-email')?.value,
                document.getElementById('portal-password')?.value,
                Boolean(document.getElementById('portal-keep-session')?.checked)
            );
        } catch (error) {
            showFeedback(getAuthMessage(error));
            portalUi.setBusy(loginButton, false);
        }
    });
    recover?.addEventListener('click', async () => {
        const email = document.getElementById('portal-email')?.value;
        if (!email) {
            showFeedback('Ingresa tu correo para enviarte el enlace de recuperación.');
            document.getElementById('portal-email')?.focus();
            return;
        }
        portalUi.setBusy(recover, true, 'Enviando...');
        try {
            await portalAuthService.sendRecovery(email);
            showFeedback('Si el correo está registrado, recibirás las instrucciones de recuperación.', 'success');
        } catch (error) {
            showFeedback(getAuthMessage(error));
        } finally {
            portalUi.setBusy(recover, false);
        }
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).catch(() => {});
}

function redirectAfterLogin() {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next && /^[-./?=&a-zA-Z0-9_%]+$/.test(next)) {
        window.location.assign(next);
        return;
    }
    window.location.assign(buildPortalUrl(PORTAL_CONFIG.defaultPage, ''));
}

function clearFeedback() {
    const feedback = document.getElementById('portal-login-feedback');
    if (feedback) { feedback.hidden = true; feedback.textContent = ''; }
}

function showFeedback(message, type = 'error') {
    const feedback = document.getElementById('portal-login-feedback');
    if (!feedback) return;
    feedback.hidden = false;
    feedback.dataset.type = type;
    feedback.textContent = message;
}

function getAuthMessage(error) {
    const code = String(error?.message || '');
    if (code.includes('credentials-required')) return 'Ingresa tu correo y contraseña.';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'El correo o la contraseña no son correctos.';
    if (code.includes('too-many-requests')) return 'Demasiados intentos. Espera un momento antes de volver a intentarlo.';
    if (code.includes('network-request-failed')) return 'No hay conexión disponible para iniciar sesión.';
    return 'No fue posible iniciar sesión. Inténtalo nuevamente.';
}
