import { PREVIEW_DEVICES, PREVIEW_MESSAGE_TYPES, isPreviewMessage } from '../core/builder-events.js?v=phase1-desktop-20260813';
import { SECTION_REGISTRY } from '../core/section-registry.js?v=phase1-desktop-20260813';
import { getThemeById } from '../core/theme-registry.js?v=phase1-desktop-20260813';

export function initPreviewController({ frame, controls, status, dimension, stage, state, eventBus, eventTypes, onError, onTrace }) {
    if (!frame || !state) return () => {};

    const targetOrigin = window.location.origin;
    let shellReady = false;
    let queuedPayload = null;
    let requestSequence = 0;
    let responseTimeout = null;

    const setStatus = (message, stateName = 'idle') => {
        if (!status) return;
        status.textContent = message;
        status.dataset.state = stateName;
    };

    const reportPreviewFailure = (error, phase) => {
        setStatus('No pudimos actualizar la vista previa.', 'error');
        console.error(`[InvitationBuilder Preview] Falló ${phase}.`, error);
        onTrace?.('preview-error', { phase, message: error?.message ?? String(error) });
        onError?.(error, { source: 'preview-controller', reason: phase });
    };

    const postToFrame = (message, phase) => {
        if (!message || !frame.contentWindow) return false;
        try {
            frame.contentWindow.postMessage(message, targetOrigin);
            return true;
        } catch (error) {
            reportPreviewFailure(error, phase);
            return false;
        }
    };

    const createPayload = (snapshot) => {
        const theme = getThemeById(snapshot.draft?.themeId);
        if (!theme) return null;
        return {
            type: PREVIEW_MESSAGE_TYPES.RENDER,
            requestId: ++requestSequence,
            payload: {
                theme: {
                    id: theme.id,
                    name: theme.name,
                    templatePath: theme.templatePath,
                    previewBindings: theme.previewBindings,
                    palette: theme.palette
                },
                content: snapshot.draft.content,
                enabledSections: snapshot.draft.enabledSections,
                sections: SECTION_REGISTRY.map((item) => ({ id: item.id, previewSelectors: item.previewSelectors })),
                renderMode: 'builder'
            }
        };
    };

    const sendSnapshot = (snapshot) => {
        try {
            const message = createPayload(snapshot);
            if (!message) {
                setStatus('Selecciona una colección para iniciar la preview.', 'empty');
                return;
            }
            queuedPayload = message;
            setStatus(`Preparando ${message.payload.theme.name}…`, 'loading');
            window.clearTimeout(responseTimeout);
            responseTimeout = window.setTimeout(() => {
                setStatus('No pudimos actualizar la vista previa.', 'error');
                onTrace?.('preview-timeout', { requestId: message.requestId });
            }, 8000);
            if (shellReady) postToFrame(message, 'post-render-message');
            onTrace?.('preview-update-sent', {
                requestId: message.requestId,
                themeId: message.payload.theme.id,
                enabledSections: [...message.payload.enabledSections],
                shellReady
            });
        } catch (error) {
            reportPreviewFailure(error, 'send-snapshot');
        }
    };

    const syncDevice = (snapshot) => {
        const device = PREVIEW_DEVICES[snapshot.ui.previewDevice] ?? PREVIEW_DEVICES.mobile;
        stage.dataset.device = device.id;
        if (dimension) dimension.textContent = `${device.width} × ${device.height}`;
        controls?.querySelectorAll('[data-preview-device]').forEach((button) => {
            const active = button.dataset.previewDevice === device.id;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    };

    controls?.querySelectorAll('[data-preview-device]').forEach((button) => {
        button.addEventListener('click', () => state.setPreviewDevice(button.dataset.previewDevice));
    });

    const handleMessage = (event) => {
        if (event.origin !== targetOrigin || event.source !== frame.contentWindow || !isPreviewMessage(event.data)) return;
        if (event.data.type === PREVIEW_MESSAGE_TYPES.SHELL_READY) {
            shellReady = true;
            if (queuedPayload) postToFrame(queuedPayload, 'post-shell-ready-message');
        } else if (event.data.type === PREVIEW_MESSAGE_TYPES.RENDERED) {
            window.clearTimeout(responseTimeout);
            setStatus(`${event.data.payload?.themeName ?? 'Colección'} lista · Preview segura`, 'ready');
            onTrace?.('preview-rendered', { requestId: event.data.requestId, themeId: event.data.payload?.themeId ?? null });
            eventBus?.emit?.(eventTypes.BUILDER_PREVIEW_READY, event.data.payload);
        } else if (event.data.type === PREVIEW_MESSAGE_TYPES.ERROR) {
            window.clearTimeout(responseTimeout);
            setStatus(event.data.payload?.message || 'La preview no está disponible.', 'error');
        }
    };

    window.addEventListener('message', handleMessage);
    const handleFrameLoad = () => {
        shellReady = true;
        if (queuedPayload) postToFrame(queuedPayload, 'post-frame-load-message');
    };
    frame.addEventListener('load', handleFrameLoad);
    try {
        const deferredSource = frame.dataset.src;
        if (!frame.getAttribute('src') && deferredSource) frame.setAttribute('src', deferredSource);
        if (frame.contentDocument?.readyState === 'complete') shellReady = true;
    } catch (error) {
        reportPreviewFailure(error, 'inspect-frame-readiness');
    }
    syncDevice(state.getSnapshot());
    sendSnapshot(state.getSnapshot());

    const unsubscribe = state.subscribe(({ snapshot, reason }) => {
        if (reason === 'preview-device-changed') syncDevice(snapshot);
        if (['initialized', 'theme-changed', 'sections-changed', 'content-changed', 'package-changed'].includes(reason)) {
            sendSnapshot(snapshot);
        }
    }, { source: 'preview-controller' });

    return () => {
        unsubscribe();
        window.clearTimeout(responseTimeout);
        window.removeEventListener('message', handleMessage);
        frame.removeEventListener('load', handleFrameLoad);
    };
}
