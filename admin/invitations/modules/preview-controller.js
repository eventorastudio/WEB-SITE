import { PREVIEW_DEVICES, PREVIEW_MESSAGE_TYPES, isPreviewMessage } from '../core/builder-events.js?v=phase3-logistics-20260813';
import { SECTION_REGISTRY, isSectionAllowed } from '../core/section-registry.js?v=phase93-package-sections-format-20260821';
import { createTemplateSectionContract } from '../core/template-binding-registry.js?v=phase86-aloha-a2-20260820';
import { getThemeById } from '../core/theme-registry.js?v=phase3-logistics-20260813';
import { isRsvpEnabled } from '../core/rsvp-schema.js?v=phase54a-rsvp-time-20260817';

const CONTENT_UPDATE_DEBOUNCE_MS = 80;

export function initPreviewController({
    openButton,
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
    if (!state) return () => {};

    const targetOrigin = window.location.origin;
    const previewUrl = new URL('./preview/frame.html?v=phase102-aloha-mobile-music-20260822', document.baseURI).href;
    let previewWindow = null;
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

    const postToPreview = (message, phase) => {
        if (!message || !previewWindow || previewWindow.closed || !shellReady) return false;
        try {
            previewWindow.postMessage(message, targetOrigin);
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
                    packageId: snapshot.draft.packageId,
                    settings: snapshot.draft.settings,
                    content: snapshot.draft.content,
                    media: snapshot.draft.media,
                    locations: snapshot.draft.locations,
                    itinerary: snapshot.draft.itinerary,
                    gifts: snapshot.draft.gifts,
                    accommodations: snapshot.draft.accommodations,
                    links: snapshot.draft.links,
                    appearance: snapshot.draft.appearance,
                    meta: {
                        touchedPaths: snapshot.draft.meta?.touchedPaths ?? [],
                        touchedCollections: snapshot.draft.meta?.touchedCollections ?? [],
                        touchedMediaRoles: snapshot.draft.meta?.touchedMediaRoles ?? []
                    }
                },
                enabledSections: snapshot.draft.enabledSections.filter((sectionId) => (
                    isSectionAllowed(sectionId, snapshot.draft.packageId)
                    && (sectionId !== 'rsvp' || isRsvpEnabled(snapshot.draft.content?.rsvp))
                )),
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
        if (shellReady) postToPreview(message, 'post-render-message');
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
        postToPreview(message, 'post-update-message');
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
        if (stage) stage.dataset.device = device.id;
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
        if (event.origin !== targetOrigin || event.source !== previewWindow || !isPreviewMessage(event.data)) return;
        if (event.data.type === PREVIEW_MESSAGE_TYPES.SHELL_READY) {
            shellReady = true;
            sendFullRender(state.getSnapshot());
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
    const openPreview = () => {
        if (previewWindow && !previewWindow.closed) {
            previewWindow.focus();
            sendSnapshot(state.getSnapshot(), 'initialized');
            return;
        }
        previewWindow = window.open(previewUrl, 'eventora-invitation-preview', 'popup,width=1280,height=900,resizable=yes,scrollbars=yes');
        if (!previewWindow) {
            setStatus('Permite ventanas emergentes para abrir el preview.', 'error');
            return;
        }
        shellReady = false;
        renderedThemeId = null;
        pendingThemeId = null;
        sendSnapshot(state.getSnapshot(), 'initialized');
        previewWindow.focus();
    };
    openButton?.addEventListener('click', openPreview);
    syncDevice(state.getSnapshot());

    const unsubscribe = state.subscribe(({ snapshot, reason }) => {
        if (reason === 'preview-device-changed') syncDevice(snapshot);
        if (['initialized', 'theme-changed', 'sections-changed', 'content-changed', 'entities-changed', 'media-changed', 'appearance-changed', 'package-changed', 'format-changed'].includes(reason)) {
            sendSnapshot(snapshot, reason);
        }
    }, { source: 'preview-controller' });

    return () => {
        unsubscribe();
        window.clearTimeout(responseTimeout);
        window.clearTimeout(updateTimer);
        window.removeEventListener('message', handleMessage);
        openButton?.removeEventListener('click', openPreview);
    };
}
