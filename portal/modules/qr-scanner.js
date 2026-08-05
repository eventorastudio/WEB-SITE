import { parseQrPayload } from '../services/checkin-service.js';
import { portalEventBus } from '../core/portal-event-bus.js';
import { PORTAL_EVENTS } from '../core/portal-event-types.js';

let stream = null;
let detector = null;
let frameId = null;
let processing = false;
let activeFacingMode = 'environment';
let cleanups = [];
let containerRef = null;
let selected = null;

export function initQrScanner(container) {
    destroyQrScanner();
    containerRef = container;
    const start = document.getElementById('scanner-start');
    const pause = document.getElementById('scanner-pause');
    const resume = document.getElementById('scanner-resume');
    const switchCamera = document.getElementById('scanner-switch');
    const close = document.getElementById('scanner-close');
    const manualForm = document.getElementById('scanner-manual-form');
    const register = document.getElementById('scanner-register');
    const passes = document.getElementById('scanner-passes');
    const onVisibility = () => { if (document.hidden) pauseScanner(); };
    const onPassesInput = () => syncRegisterButton();
    start?.addEventListener('click', startScanner);
    pause?.addEventListener('click', pauseScanner);
    resume?.addEventListener('click', startScanner);
    switchCamera?.addEventListener('click', switchScannerCamera);
    close?.addEventListener('click', destroyQrScanner);
    manualForm?.addEventListener('submit', handleManualCode);
    register?.addEventListener('click', registerSelectedEntry);
    document.addEventListener('visibilitychange', onVisibility);
    cleanups = [
        () => start?.removeEventListener('click', startScanner),
        () => pause?.removeEventListener('click', pauseScanner),
        () => resume?.removeEventListener('click', startScanner),
        () => switchCamera?.removeEventListener('click', switchScannerCamera),
        () => close?.removeEventListener('click', destroyQrScanner),
        () => manualForm?.removeEventListener('submit', handleManualCode),
        () => register?.removeEventListener('click', registerSelectedEntry),
        () => document.removeEventListener('visibilitychange', onVisibility),
        () => passes?.removeEventListener('input', onPassesInput)
    ];
    if (!('BarcodeDetector' in window)) {
        setScannerState('compatibility', 'Este navegador no admite el lector nativo. Usa el ingreso manual seguro.');
        start?.setAttribute('disabled', '');
    }
    passes?.addEventListener('input', onPassesInput);
}

export function destroyQrScanner() {
    window.cancelAnimationFrame(frameId);
    frameId = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    detector = null;
    processing = false;
    selected = null;
    containerRef = null;
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    const video = document.getElementById('scanner-video');
    if (video) video.srcObject = null;
}

async function startScanner() {
    if (!containerRef || !navigator.onLine) {
        setScannerState('offline', 'Recupera conexión antes de registrar accesos.');
        return;
    }
    if (!('BarcodeDetector' in window)) return;
    pauseScanner();
    try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: activeFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        const video = document.getElementById('scanner-video');
        video.srcObject = stream;
        await video.play();
        setScannerState('scanning', 'Escaneando QR…');
        scanFrame();
    } catch (error) {
        const denied = error?.name === 'NotAllowedError';
        setScannerState('error', denied ? 'Permiso de cámara denegado. Puedes ingresar el código manualmente.' : 'No fue posible iniciar la cámara.');
    }
}

function pauseScanner() {
    window.cancelAnimationFrame(frameId);
    frameId = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const video = document.getElementById('scanner-video');
    if (video) video.srcObject = null;
    if (!processing) setScannerState('paused', 'Escáner en pausa.');
}

async function switchScannerCamera() {
    activeFacingMode = activeFacingMode === 'environment' ? 'user' : 'environment';
    await startScanner();
}

async function scanFrame() {
    const video = document.getElementById('scanner-video');
    if (!stream || !video || processing) return;
    try {
        const codes = await detector.detect(video);
        if (codes.length) {
            processing = true;
            pauseScanner();
            await validatePayload(codes[0].rawValue);
            processing = false;
            return;
        }
    } catch (error) {
        console.warn('[QR Scanner] Frame not decoded', error);
    }
    frameId = window.requestAnimationFrame(scanFrame);
}

async function handleManualCode(event) {
    event.preventDefault();
    const input = document.getElementById('scanner-manual-code');
    if (!input?.value.trim()) return;
    processing = true;
    await validatePayload(input.value);
    processing = false;
}

async function validatePayload(rawValue) {
    try {
        if (!navigator.onLine) throw new Error('offline');
        setScannerState('validating', 'Validando pase…');
        const payload = parseQrPayload(rawValue);
        if (payload.eventId && payload.eventId !== containerRef.context.event.id) throw new Error('other-event');
        const guest = await containerRef.services.guest.getGuestByQrToken(containerRef.context.event.id, payload.token);
        if (!guest) throw new Error('not-found');
        if (!guest.qrActivo) throw new Error('disabled');
        selected = { guest, token: payload.token };
        renderSelectedGuest();
        setScannerState(guest.pasesDisponibles > 0 ? 'approved' : 'used', guest.pasesDisponibles > 0 ? 'Pase validado. Indica los pases a registrar.' : 'Todos los pases de este invitado ya fueron utilizados.');
        if (guest.pasesDisponibles > 0) document.getElementById('scanner-passes')?.focus();
    } catch (error) {
        selected = null;
        renderSelectedGuest();
        setScannerState('denied', getValidationMessage(error));
        navigator.vibrate?.(80);
    }
}

async function registerSelectedEntry() {
    if (!selected || !containerRef || !navigator.onLine) return;
    const input = document.getElementById('scanner-passes');
    const passes = Number(input?.value);
    if (!Number.isInteger(passes) || passes < 1 || passes > selected.guest.pasesDisponibles) {
        setScannerState('denied', 'Indica una cantidad disponible.');
        input?.focus();
        return;
    }
    const button = document.getElementById('scanner-register');
    containerRef.ui.setBusy(button, true, 'Registrando...');
    try {
        const result = await containerRef.services.checkin.registerEntry({
            eventId: containerRef.context.event.id,
            guestId: selected.guest.id,
            passes,
            method: 'qr',
            qrToken: selected.token,
            userId: containerRef.context.user.uid,
            device: getDeviceLabel()
        });
        portalEventBus.emit(PORTAL_EVENTS.CHECKIN_COMPLETED, result);
        setScannerState('approved', `${result.passesRegistered} pase(s) registrados para ${result.guest.nombre}.`);
        navigator.vibrate?.(35);
        selected = null;
        renderSelectedGuest();
    } catch (error) {
        setScannerState('denied', getRegistrationMessage(error));
        navigator.vibrate?.(90);
    } finally {
        containerRef.ui.setBusy(button, false);
    }
}

function renderSelectedGuest() {
    const panel = document.getElementById('scanner-guest-panel');
    const register = document.getElementById('scanner-register');
    if (!panel || !register) return;
    panel.replaceChildren();
    if (!selected) {
        panel.hidden = true;
        register.disabled = true;
        return;
    }
    const guest = selected.guest;
    panel.hidden = false;
    const name = document.createElement('strong');
    name.textContent = guest.nombre;
    const details = document.createElement('span');
    details.textContent = `${guest.codigoInvitado || 'Pase seguro'} · Mesa ${guest.mesa ?? 'sin asignar'} · ${guest.pasesDisponibles} disponible(s)`;
    const note = document.createElement('small');
    note.textContent = guest.notas || 'Sin notas operativas.';
    panel.append(name, details, note);
    syncRegisterButton();
}

function syncRegisterButton() {
    const register = document.getElementById('scanner-register');
    const passes = Number(document.getElementById('scanner-passes')?.value);
    register.disabled = !selected || !Number.isInteger(passes) || passes < 1 || passes > selected.guest.pasesDisponibles;
}

function setScannerState(state, message) {
    const target = document.getElementById('scanner-status');
    if (!target) return;
    target.dataset.state = state;
    target.textContent = message;
}

function getValidationMessage(error) {
    const code = String(error?.code || error?.message || '');
    if (code.includes('other-event')) return 'Este QR pertenece a otro evento.';
    if (code.includes('disabled')) return 'Este QR está desactivado.';
    if (code.includes('not-found')) return 'Código inválido o no autorizado para este evento.';
    if (code.includes('invalid-qr')) return 'El QR no tiene un formato de pase seguro.';
    if (code.includes('offline')) return 'Sin conexión. No confirmamos accesos sin conexión.';
    return 'No fue posible validar el pase.';
}

function getRegistrationMessage(error) {
    const code = String(error?.code || error?.message || '');
    if (code.includes('passes-already-used')) return 'YA UTILIZADO: no hay pases disponibles.';
    if (code.includes('insufficient-passes')) return 'La cantidad supera los pases disponibles.';
    if (code.includes('invalid-token')) return 'El QR cambió o ya no es válido.';
    return 'No se pudo confirmar la entrada. Inténtalo nuevamente.';
}

function getDeviceLabel() {
    return `${navigator.platform || 'web'} · ${navigator.userAgent.slice(0, 80)}`;
}
