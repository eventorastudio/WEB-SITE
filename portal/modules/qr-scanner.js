import {
    getCheckinErrorMessage,
    isCheckinDebugMode,
    parseQrPayload
} from '../services/checkin-service.js';
import { portalEventBus } from '../core/portal-event-bus.js';
import { PORTAL_EVENTS } from '../core/portal-event-types.js';

const CAMERA_CONSTRAINTS = Object.freeze({
    audio: false,
    video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
    }
});
const QR_COOLDOWN_MS = 2_500;

let stream = null;
let detector = null;
let frameId = null;
let zxingReader = null;
let zxingControls = null;
let processing = false;
let activeDeviceId = null;
let cameraDevices = [];
let engine = null;
let lastRawValue = '';
let lastReadAt = 0;
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
    const onVisibility = () => {
        if (document.hidden) pauseScanner({ announce: false });
    };
    const onPageHide = () => stopCamera();
    const onPause = () => pauseScanner();
    const onPassesInput = () => syncRegisterButton();

    start?.addEventListener('click', startScanner);
    pause?.addEventListener('click', onPause);
    resume?.addEventListener('click', startScanner);
    switchCamera?.addEventListener('click', switchScannerCamera);
    close?.addEventListener('click', destroyQrScanner);
    manualForm?.addEventListener('submit', handleManualCode);
    register?.addEventListener('click', registerSelectedEntry);
    passes?.addEventListener('input', onPassesInput);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    cleanups = [
        () => start?.removeEventListener('click', startScanner),
        () => pause?.removeEventListener('click', onPause),
        () => resume?.removeEventListener('click', startScanner),
        () => switchCamera?.removeEventListener('click', switchScannerCamera),
        () => close?.removeEventListener('click', destroyQrScanner),
        () => manualForm?.removeEventListener('submit', handleManualCode),
        () => register?.removeEventListener('click', registerSelectedEntry),
        () => passes?.removeEventListener('input', onPassesInput),
        () => document.removeEventListener('visibilitychange', onVisibility),
        () => window.removeEventListener('pagehide', onPageHide)
    ];
    updateCameraControls();
}

export function destroyQrScanner() {
    stopCamera();
    processing = false;
    selected = null;
    cameraDevices = [];
    activeDeviceId = null;
    lastRawValue = '';
    lastReadAt = 0;
    containerRef = null;
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    renderSelectedGuest();
}

async function startScanner() {
    if (!containerRef) return;
    if (!window.isSecureContext) {
        setScannerState('error', 'La cámara solo está disponible mediante una conexión segura.');
        return;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setScannerState('error', 'Este navegador no ofrece acceso a la cámara. Puedes validar el token manualmente.');
        return;
    }
    if (processing) return;

    stopCamera();
    const video = getVideoElement();
    if (!video) return;
    try {
        stream = await openCameraStream();
        video.srcObject = stream;
        await video.play();
        await refreshCameraDevices();
        setScannerState('scanning', 'Cámara abierta. Preparando lector QR…');

        if (await supportsNativeQrDetector()) {
            try {
                detector = new window.BarcodeDetector({ formats: ['qr_code'] });
                engine = 'native';
                setScannerState('scanning', 'Escaneando QR con el lector del dispositivo…');
                scanNativeFrame();
                return;
            } catch (error) {
                logScannerError('No se pudo iniciar BarcodeDetector; se usará ZXing.', error);
            }
        }
        await startZxingScanner();
    } catch (error) {
        stopCamera();
        setScannerState('error', getCameraErrorMessage(error));
    }
}

function buildCameraConstraints() {
    if (!activeDeviceId) return CAMERA_CONSTRAINTS;
    return {
        audio: false,
        video: {
            deviceId: { exact: activeDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };
}

async function openCameraStream() {
    try {
        return await navigator.mediaDevices.getUserMedia(buildCameraConstraints());
    } catch (error) {
        // An ideal rear-facing preference must never make a device with another
        // usable camera unavailable. A selected device remains explicit instead.
        if (!activeDeviceId && error?.name === 'OverconstrainedError') {
            return navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
        }
        throw error;
    }
}

async function supportsNativeQrDetector() {
    if (!('BarcodeDetector' in window) || typeof window.BarcodeDetector?.getSupportedFormats !== 'function') return false;
    try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        return Array.isArray(formats) && formats.includes('qr_code');
    } catch (error) {
        logScannerError('BarcodeDetector no pudo confirmar soporte QR.', error);
        return false;
    }
}

async function startZxingScanner() {
    const ZxingReader = window.ZXingBrowser?.BrowserQRCodeReader;
    if (!stream || !ZxingReader) {
        throw new Error('scanner/zxing-unavailable');
    }
    engine = 'zxing';
    zxingReader = new ZxingReader();
    const controls = await zxingReader.decodeFromStream(stream, getVideoElement(), (result, error) => {
        if (result) {
            handleDecodedValue(result.getText());
        } else if (error && !isExpectedZxingDecodeMiss(error)) {
            logScannerError('ZXing no pudo decodificar el cuadro.', error);
        }
    });
    if (!stream || engine !== 'zxing') {
        controls.stop?.();
        return;
    }
    zxingControls = controls;
    setScannerState('scanning', 'Escaneando QR con el lector compatible…');
}

function scanNativeFrame() {
    const video = getVideoElement();
    if (!stream || !detector || !video || processing || engine !== 'native') return;
    const detect = async () => {
        try {
            const codes = await detector.detect(video);
            if (codes.length) {
                handleDecodedValue(codes[0].rawValue);
                return;
            }
        } catch (error) {
            await fallbackToZxing(error);
            return;
        }
        if (stream && engine === 'native' && !processing) frameId = window.requestAnimationFrame(scanNativeFrame);
    };
    void detect();
}

async function fallbackToZxing(nativeError) {
    if (!stream || engine !== 'native') return;
    logScannerError('BarcodeDetector falló durante la lectura; se cambia a ZXing.', nativeError);
    window.cancelAnimationFrame(frameId);
    frameId = null;
    detector = null;
    try {
        await startZxingScanner();
    } catch (fallbackError) {
        stopCamera();
        setScannerState('error', getCameraErrorMessage(fallbackError));
    }
}

function handleDecodedValue(rawValue) {
    const now = Date.now();
    const value = String(rawValue ?? '').trim();
    if (!value || processing || (value === lastRawValue && now - lastReadAt < QR_COOLDOWN_MS)) return;
    lastRawValue = value;
    lastReadAt = now;
    processing = true;
    stopCamera();
    void validatePayload(value).finally(() => { processing = false; });
}

function pauseScanner({ announce = true } = {}) {
    const wasActive = Boolean(stream || detector || zxingControls);
    stopCamera();
    if (announce && wasActive) setScannerState('paused', 'Escáner en pausa. Puedes reanudar cuando quieras.');
}

function stopCamera() {
    window.cancelAnimationFrame(frameId);
    frameId = null;
    detector = null;
    try { zxingControls?.stop?.(); } catch (error) { logScannerError('No se pudo detener el control ZXing.', error); }
    zxingControls = null;
    try { zxingReader?.reset?.(); } catch (error) { logScannerError('No se pudo reiniciar ZXing.', error); }
    zxingReader = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    engine = null;
    const video = document.getElementById('scanner-video');
    if (video) video.srcObject = null;
}

async function refreshCameraDevices() {
    if (typeof navigator.mediaDevices?.enumerateDevices !== 'function') return;
    cameraDevices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    const currentTrack = stream?.getVideoTracks?.()[0];
    const currentId = currentTrack?.getSettings?.().deviceId;
    if (currentId && cameraDevices.some((device) => device.deviceId === currentId)) activeDeviceId = currentId;
    updateCameraControls();
}

async function switchScannerCamera() {
    if (cameraDevices.length < 2) {
        setScannerState('paused', 'Solo hay una cámara disponible en este dispositivo.');
        return;
    }
    const currentIndex = cameraDevices.findIndex((device) => device.deviceId === activeDeviceId);
    activeDeviceId = cameraDevices[(currentIndex + 1 + cameraDevices.length) % cameraDevices.length].deviceId;
    await startScanner();
}

function updateCameraControls() {
    const switchCamera = document.getElementById('scanner-switch');
    if (switchCamera) switchCamera.disabled = cameraDevices.length < 2;
}

function getVideoElement() {
    const video = document.getElementById('scanner-video');
    if (video) {
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
    }
    return video;
}

async function handleManualCode(event) {
    event.preventDefault();
    const input = document.getElementById('scanner-manual-code');
    if (!input?.value.trim() || processing) return;
    processing = true;
    try {
        pauseScanner({ announce: false });
        await validatePayload(input.value);
    } finally {
        processing = false;
    }
}

async function validatePayload(rawValue) {
    try {
        if (!navigator.onLine) throw new Error('offline');
        setScannerState('validating', 'Validando pase…');
        const payload = parseQrPayload(rawValue);
        if (payload.eventId && payload.eventId !== containerRef?.context.event.id) throw new Error('other-event');
        const guest = await containerRef?.services.guest.getGuestByQrToken(containerRef.context.event.id, payload.token);
        if (!guest) throw new Error('not-found');
        if (!guest.qrToken) throw new Error('qr-not-generated');
        if (!guest.qrActivo) throw new Error('disabled');
        selected = { guest, token: payload.token };
        renderSelectedGuest();
        const hasAvailability = guest.pasesDisponibles > 0;
        setScannerState(hasAvailability ? 'approved' : 'used', hasAvailability
            ? 'Pase validado. Indica los pases a registrar o reanuda para otro QR.'
            : 'Todos los pases de este invitado ya fueron utilizados. Puedes reanudar para otro QR.');
        if (hasAvailability) document.getElementById('scanner-passes')?.focus();
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
            userId: containerRef.context.user.uid
        });
        portalEventBus.emit(PORTAL_EVENTS.CHECKIN_COMPLETED, result);
        setScannerState('approved', `${result.passesRegistered} pase(s) registrados para ${result.guest.nombre}.`);
        navigator.vibrate?.(35);
        selected = null;
        renderSelectedGuest();
    } catch (error) {
        setScannerState('denied', getCheckinErrorMessage(error));
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
    details.textContent = `${guest.codigoInvitado || 'Pase seguro'} · Mesa ${guest.mesa ?? 'sin asignar'}`;
    const passState = document.createElement('span');
    passState.textContent = `Usados: ${guest.pasesUtilizados} · Disponibles: ${guest.pasesDisponibles}`;
    const note = document.createElement('small');
    note.textContent = guest.notas || 'Sin notas operativas.';
    panel.append(name, details, passState, note);
    syncRegisterButton();
}

function syncRegisterButton() {
    const register = document.getElementById('scanner-register');
    if (!register) return;
    const passes = Number(document.getElementById('scanner-passes')?.value);
    register.disabled = !selected || !Number.isInteger(passes) || passes < 1 || passes > selected.guest.pasesDisponibles;
}

function setScannerState(state, message) {
    const target = document.getElementById('scanner-status');
    if (!target) return;
    target.dataset.state = state;
    target.textContent = message;
}

function getCameraErrorMessage(error) {
    const code = String(error?.name || error?.code || error?.message || '');
    if (code.includes('NotAllowedError')) {
        return 'Permiso de cámara denegado. Actívalo desde la configuración del navegador. En iPhone abre Configuración, busca Safari o Chrome, entra en Cámara y permite el acceso. Después vuelve a cargar esta página.';
    }
    if (code.includes('NotFoundError')) return 'No se encontró una cámara disponible.';
    if (code.includes('NotReadableError')) return 'La cámara está siendo utilizada por otra aplicación.';
    if (code.includes('OverconstrainedError')) return 'No se encontró una cámara compatible con la configuración solicitada.';
    if (code.includes('SecurityError')) return 'La cámara solo está disponible mediante una conexión segura.';
    if (code.includes('AbortError')) return 'No fue posible iniciar la cámara.';
    if (code.includes('scanner/zxing-unavailable')) return 'El lector QR compatible no pudo cargarse. Puedes validar el token manualmente.';
    const generic = 'No fue posible iniciar la cámara.';
    return isCheckinDebugMode() && code ? `${generic} (Código: ${code})` : generic;
}

function getValidationMessage(error) {
    const code = String(error?.code || error?.message || '');
    if (code.includes('other-event')) return 'Este QR pertenece a otro evento.';
    if (code.includes('disabled')) return 'Este QR está desactivado.';
    if (code.includes('qr-not-generated')) return 'Este invitado todavía no tiene un pase QR generado.';
    if (code.includes('not-found')) return 'No encontramos un pase QR activo para este evento. El invitado podría no tener un QR generado.';
    if (code.includes('invalid-qr') || code.includes('empty-qr')) return 'El QR no tiene un formato de pase seguro.';
    if (code.includes('offline')) return 'Sin conexión. No confirmamos accesos sin conexión.';
    return isCheckinDebugMode() && code ? `No fue posible validar el pase. (Código: ${code})` : 'No fue posible validar el pase.';
}

function isExpectedZxingDecodeMiss(error) {
    const name = String(error?.name || error?.constructor?.name || '');
    return name === 'NotFoundException' || name === 'ChecksumException' || name === 'FormatException';
}

function logScannerError(message, error) {
    if (isCheckinDebugMode()) console.warn(`[Portal QR] ${message}`, error);
}
