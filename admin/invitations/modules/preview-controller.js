import { PREVIEW_DEVICES, PREVIEW_MESSAGE_TYPES, isPreviewMessage } from '../core/builder-events.js?v=phase21-normalization-20260813';
import { SECTION_REGISTRY } from '../core/section-registry.js?v=phase21-normalization-20260813';
import { createTemplateSectionContract } from '../core/template-binding-registry.js?v=phase21-normalization-20260813';
import { getThemeById } from '../core/theme-registry.js?v=phase21-normalization-20260813';

const CONTENT_UPDATE_DEBOUNCE_MS = 80;

export function initPreviewController({
    frame,
    controls,
    status,
    dimension,
    stage,
    state,
    eventBus,
    eventTypes,
    onError,
    onTrace,
    updateDebounceMs = CONTENT_UPDATE_DEBOUNCE_MS
}) {
    if (!frame || !state) return () => {};

    const targetOrigin = window.location.origin;
    let shellReady = false;
    let queuedRender = null;
    let queuedUpdate = null;
    let requestSequence = 0;
    let responseTimeout = null;
    let updateTimer = null;
    let renderedThemeId = null;
    let pendingThemeId = null;

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

    const createPayload = (snapshot, type) => {
        const theme = getThemeById(snapshot.draft?.themeId);
        if (!theme) return null;
        const sectionContract = createTemplateSectionContract(theme.id, SECTION_REGISTRY);
        return {
            type,
            requestId: ++requestSequence,
            payload: {
                theme: {
                    id: theme.id,
                    name: theme.name,
                    templatePath: theme.templatePath,
                    palette: theme.palette
                },
                draft: {
                    schemaVersion: snapshot.draft.schemaVersion,
                    contentSchemaVersion: snapshot.draft.contentSchemaVersion,
                    content: snapshot.draft.content,
                    locations: snapshot.draft.locations,
                    meta: { touchedPaths: snapshot.draft.meta?.touchedPaths ?? [] }
                },
                enabledSections: snapshot.draft.enabledSections,
                sections: sectionContract.sections,
                sectionGroups: sectionContract.groups,
                renderMode: 'builder'
            }
        };
    };

    const sendFullRender = (snapshot) => {
        const message = createPayload(snapshot, PREVIEW_MESSAGE_TYPES.RENDER);
        if (!message) {
            setStatus('Selecciona una colección para iniciar la preview.', 'empty');
            return;
        }
        queuedRender = message;
        queuedUpdate = null;
        window.clearTimeout(updateTimer);
        updateTimer = null;
        pendingThemeId = message.payload.theme.id;
        setStatus(`Preparando ${message.payload.theme.name}…`, 'loading');
        window.clearTimeout(responseTimeout);
        responseTimeout = window.setTimeout(() => {
            setStatus('No pudimos actualizar la vista previa.', 'error');
            onTrace?.('preview-timeout', { requestId: message.requestId });
        }, 8000);
        if (shellReady) postToFrame(message, 'post-render-message');
        onTrace?.('preview-render-sent', {
            requestId: message.requestId,
            themeId: message.payload.theme.id,
            shellReady
        });
    };

    const flushUpdate = () => {
        updateTimer = null;
        if (!queuedUpdate || queuedUpdate.payload.theme.id !== renderedThemeId) return;
        const message = queuedUpdate;
        queuedUpdate = null;
        postToFrame(message, 'post-update-message');
        onTrace?.('preview-update-sent', {
            requestId: message.requestId,
            themeId: message.payload.theme.id,
            enabledSections: [...message.payload.enabledSections]
        });
    };

    const scheduleUpdate = (snapshot) => {
        const message = createPayload(snapshot, PREVIEW_MESSAGE_TYPES.UPDATE);
        if (!message) return;
        queuedUpdate = message;
        if (message.payload.theme.id !== renderedThemeId) return;
        window.clearTimeout(updateTimer);
        updateTimer = window.setTimeout(flushUpdate, updateDebounceMs);
    };

    const sendSnapshot = (snapshot, reason = 'initialized') => {
        try {
            const themeId = snapshot.draft?.themeId;
            if (!themeId) {
                setStatus('Selecciona una colección para iniciar la preview.', 'empty');
                return;
            }
            if (reason === 'theme-changed' || (themeId !== renderedThemeId && themeId !== pendingThemeId)) {
                sendFullRender(snapshot);
            } else {
                scheduleUpdate(snapshot);
            }
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
            if (queuedRender) postToFrame(queuedRender, 'post-shell-ready-message');
        } else if (event.data.type === PREVIEW_MESSAGE_TYPES.RENDERED) {
            const themeId = event.data.payload?.themeId ?? null;
            renderedThemeId = themeId;
            if (pendingThemeId === themeId) pendingThemeId = null;
            window.clearTimeout(responseTimeout);
            setStatus(`${event.data.payload?.themeName ?? 'Colección'} lista · Preview segura`, 'ready');
            onTrace?.('preview-rendered', {
                requestId: event.data.requestId,
                themeId,
                update: event.data.payload?.update === true
            });
            eventBus?.emit?.(eventTypes.BUILDER_PREVIEW_READY, event.data.payload);
            if (queuedUpdate?.payload.theme.id === renderedThemeId && updateTimer == null) {
                updateTimer = window.setTimeout(flushUpdate, updateDebounceMs);
            }
        } else if (event.data.type === PREVIEW_MESSAGE_TYPES.ERROR) {
            window.clearTimeout(responseTimeout);
            setStatus(event.data.payload?.message || 'La preview no está disponible.', 'error');
        }
    };

    window.addEventListener('message', handleMessage);
    const handleFrameLoad = () => {
        shellReady = true;
        if (queuedRender) postToFrame(queuedRender, 'post-frame-load-message');
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
            sendSnapshot(snapshot, reason);
        }
    }, { source: 'preview-controller' });

    return () => {
        unsubscribe();
        window.clearTimeout(responseTimeout);
        window.clearTimeout(updateTimer);
        window.removeEventListener('message', handleMessage);
        frame.removeEventListener('load', handleFrameLoad);
    };
}
