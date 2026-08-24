import { authService } from '../services/auth-service.js';
import { eventService } from '../services/event-service.js';
import { state as adminState } from '../core/state.js';
import { ui } from '../core/ui.js';
import { eventBus } from '../core/event-bus.js';
import { EVENT_TYPES } from '../core/event-types.js';
import { hasPermission, PERMISSIONS } from '../core/roles.js';
import { initThemeManager } from '../core/theme-manager.js';
import { builderState } from './core/builder-state.js?v=phase126-accommodation-icons-place-library-20260824';
import { createBuilderUrl, readBuilderRoute } from './core/builder-routing.js?v=phase3-logistics-20260813';
import {
    BUILDER_DESKTOP_MIN_WIDTH,
    BUILDER_PLATFORM_STATUS,
    initBuilderPlatformAccess
} from './core/builder-platform.js?v=phase3-logistics-20260813';
import { createBuilderDebugLogger } from './core/builder-debug.js?v=phase3-logistics-20260813';
import { initIdentityEditor } from './editors/identity-editor.js?v=phase94-opening-cover-20260821';
import { initSectionCopyEditors } from './editors/section-copy-editor.js?v=phase54a-rsvp-time-20260817';
import { initLogisticsEditors } from './editors/logistics-editor.js?v=phase93-package-sections-format-20260821';
import { initAccessPassEditor } from './editors/access-pass-editor.js?v=phase88-qr2-20260820';
import { initMediaEditor } from './editors/media-editor.js?v=phase89-dress-code-media-20260820';
import { initAppearanceEditor } from './editors/appearance-editor.js?v=phase86-appearance-20260820';
import { initReviewEditor } from './editors/review-editor.js?v=phase86-review-20260820';
import { invitationMediaService } from './services/invitation-media-service.js?v=phase89-dress-code-media-20260820';
import { invitationRsvpService } from './services/invitation-rsvp-service.js?v=phase54-public-rsvp-20260817';
import { invitationDraftService } from './services/invitation-draft-service.js?v=phase126-accommodation-icons-place-library-20260824';
import { invitationPublicationService } from './services/invitation-publication-service.js?v=phase63-public-invitation-20260817';
import { renderEventSelector } from './modules/event-selector.js?v=phase3-logistics-20260813';
import { initPackageSelector } from './modules/package-selector.js?v=phase94-format-gating-20260821';
import { initThemeSelector } from './modules/theme-selector.js?v=phase3-logistics-20260813';
import { initPreviewController } from './modules/preview-controller.js?v=phase112-aloha-access-tabs-20260822';
import { initBuilderEventBridge } from './modules/state-event-bridge.js?v=phase3-logistics-20260813';
import { initRsvpPersistenceController } from './modules/rsvp-persistence-controller.js?v=phase52-rsvp-persistence-20260816';
import { initDraftPersistenceController } from './modules/draft-persistence-controller.js?v=phase61-draft-persistence-20260817';
import { initInvitationPublicationController } from './modules/invitation-publication-controller.js?v=phase63-public-invitation-20260817';

const dom = {
    guard: document.getElementById('builder-auth-guard'),
    root: document.getElementById('invitation-builder-root'),
    shell: document.getElementById('invitation-builder-root'),
    platformGate: document.getElementById('builder-platform-gate'),
    platformTitle: document.getElementById('builder-platform-title'),
    platformDescription: document.getElementById('builder-platform-description'),
    windowGuard: document.getElementById('builder-window-guard'),
    windowGuardTitle: document.getElementById('builder-window-guard-title'),
    windowGuardDescription: document.getElementById('builder-window-guard-description'),
    gate: document.getElementById('builder-gate'),
    gateTitle: document.getElementById('builder-gate-title'),
    gateDescription: document.getElementById('builder-gate-description'),
    gateContent: document.getElementById('builder-gate-content'),
    workspace: document.getElementById('builder-workspace'),
    editor: document.getElementById('builder-editor'),
    eventLabel: document.getElementById('builder-event-label'),
    activeEvent: document.getElementById('builder-active-event'),
    activeEventMeta: document.getElementById('builder-active-event-meta'),
    draftStatus: document.getElementById('builder-draft-status'),
    saveDraft: document.getElementById('builder-save-draft'),
    saveDraftStatus: document.getElementById('builder-save-draft-status'),
    publish: document.getElementById('builder-publish'),
    publishStatus: document.getElementById('builder-publish-status'),
    saveRsvp: document.getElementById('builder-save-rsvp'),
    saveRsvpStatus: document.getElementById('builder-save-rsvp-status'),
    runtimeError: document.getElementById('builder-runtime-error'),
    runtimeErrorTitle: document.getElementById('builder-runtime-error-title'),
    runtimeErrorMessage: document.getElementById('builder-runtime-error-message'),
    runtimeErrorRetry: document.getElementById('builder-runtime-error-retry')
};

let roleContext = null;
let modulesMounted = false;
let builderStarted = false;
let bootStarted = false;
let accessReady = false;
let shellUnlocked = false;
let currentPlatformStatus = null;
let runtimeRetry = null;
const moduleCleanups = [];
const immutableBuilderRoot = dom.root;
const debugBuilder = createBuilderDebugLogger({
    targetWindow: window,
    targetDocument: document,
    getSnapshot: () => builderState.getSnapshot()
});

initThemeManager();
registerGlobalDiagnostics();
moduleCleanups.push(initUnsavedChangesGuard());
moduleCleanups.push(initBuilderPlatformAccess({
    targetWindow: window,
    onStatusChange: handlePlatformStatus,
    onReady: () => void boot()
}));

async function boot() {
    if (bootStarted) return;
    bootStarted = true;

    try {
        const user = await waitForSession();
        if (!user) {
            window.location.replace('../index.html');
            return;
        }

        roleContext = await authService.getRoleContext({ forceRefresh: true });
        if (!roleContext.isInternal || !hasPermission(roleContext, PERMISSIONS.INVITATIONS_EDIT)) {
            revealShell();
            renderGateError('No tienes permisos para editar invitaciones.', 'El acceso requiere un rol interno con el permiso invitations:edit.');
            return;
        }

        adminState.setState('auth', {
            user,
            isAuthenticated: true,
            role: roleContext.role
        });
        revealShell();
        watchSession();
        accessReady = true;
        if (currentPlatformStatus === BUILDER_PLATFORM_STATUS.SUPPORTED) await startBuilder();
    } catch (error) {
        revealShell();
        renderGateError('No fue posible iniciar el Invitation Builder.', friendlyError(error));
        console.error('[Invitation Builder] Error de arranque:', error);
        debugBuilder.captureError('boot-error', error);
    }
}

async function startBuilder() {
    if (builderStarted) return;
    builderStarted = true;
    debugBuilder.trace('builder-start');

    const route = readBuilderRoute(window.location.search);
    if (route.invalidEventParameter) {
        renderGateError('El identificador del evento no es válido.', 'Usa el acceso del Dashboard o de Administrar evento para abrir el Builder.', showEventSelection);
        return;
    }

    if (route.eventId) await loadEvent(route.eventId);
    else await showEventSelection();
}

function handlePlatformStatus(status, { hasStarted }) {
    currentPlatformStatus = status;
    document.documentElement.dataset.builderPlatformStatus = status;
    dom.root.dataset.builderPlatformStatus = status;
    debugBuilder.trace('platform-status', { status, minimumWidth: BUILDER_DESKTOP_MIN_WIDTH, hasStarted });

    if (status !== BUILDER_PLATFORM_STATUS.SUPPORTED && !builderStarted) {
        dom.root.hidden = true;
        dom.windowGuard.hidden = true;
        dismissAuthGuard();
        configureInitialPlatformGate(status);
        dom.platformGate.hidden = false;
        return;
    }

    if (!builderStarted) {
        dom.platformGate.hidden = true;
        dom.windowGuard.hidden = true;
        dom.root.hidden = !shellUnlocked;
        dom.guard.hidden = shellUnlocked;
        if (accessReady) void startBuilder();
        return;
    }

    dom.platformGate.hidden = true;
    dom.root.hidden = false;
    const blocked = status !== BUILDER_PLATFORM_STATUS.SUPPORTED;
    dom.windowGuard.hidden = !blocked;
    if (blocked) configureActiveWindowGuard(status);
}

function configureInitialPlatformGate(status) {
    const smallWindow = status === BUILDER_PLATFORM_STATUS.WINDOW_TOO_SMALL;
    dom.platformTitle.textContent = 'Invitation Builder disponible solo en computadora';
    dom.platformDescription.textContent = smallWindow
        ? `Para crear y editar invitaciones utiliza una pantalla de escritorio de al menos ${BUILDER_DESKTOP_MIN_WIDTH} px. Si ya estás en una computadora, amplía la ventana para continuar.`
        : 'Para crear y editar invitaciones utiliza una computadora con mouse o trackpad y una pantalla de escritorio.';
}

function configureActiveWindowGuard(status) {
    const unsupportedDevice = status === BUILDER_PLATFORM_STATUS.UNSUPPORTED_DEVICE;
    dom.windowGuardTitle.textContent = unsupportedDevice ? 'Disponible en computadora' : 'Amplía la ventana para continuar';
    dom.windowGuardDescription.textContent = unsupportedDevice
        ? 'Conservamos tu borrador local. Conecta un mouse o trackpad y utiliza una pantalla de computadora para continuar.'
        : `Tu borrador local permanece intacto. Amplía la ventana a ${BUILDER_DESKTOP_MIN_WIDTH} px o más para continuar.`;
}

async function waitForSession() {
    const current = authService.getCurrentUser();
    if (current) return current;

    return new Promise((resolve) => {
        let unsubscribe = null;
        unsubscribe = authService.onAuthStateChange((user) => {
            unsubscribe?.();
            resolve(user);
        });
    });
}

function watchSession() {
    const unsubscribe = authService.onAuthStateChange((user) => {
        if (!user) window.location.replace('../index.html');
    });
    moduleCleanups.push(unsubscribe);
}

function revealShell() {
    shellUnlocked = true;
    dismissAuthGuard();
    dom.shell.hidden = currentPlatformStatus !== BUILDER_PLATFORM_STATUS.SUPPORTED;
}

function dismissAuthGuard() {
    dom.guard.hidden = true;
}

async function showEventSelection() {
    showGate('Selecciona el evento de esta invitación', 'Cada borrador debe permanecer vinculado a un evento real.');
    dom.gateContent.innerHTML = '<div class="builder-empty-state"><strong>Cargando eventos…</strong><p>Consultando la colección eventos mediante el servicio administrativo.</p></div>';

    try {
        const events = await eventService.getAllEvents();
        renderEventSelector(dom.gateContent, events, { onSelect: loadEvent });
    } catch (error) {
        renderGateError('No fue posible cargar los eventos.', friendlyError(error), showEventSelection);
    }
}

async function loadEvent(eventId) {
    showGate('Preparando el Builder', 'Leyendo la información existente del evento. No se realizará ningún write.');
    dom.gateContent.innerHTML = '<div class="builder-empty-state"><strong>Cargando evento…</strong><p>Nombre, fecha, hora, tipo y ciudad se usarán como contenido inicial.</p></div>';

    try {
        const eventData = await eventService.getEventById(eventId);
        if (!eventData) {
            renderGateError('El evento no existe o fue eliminado.', `No se encontró eventos/${eventId}.`, showEventSelection);
            return;
        }

        adminState.setState('event', { id: eventId, data: eventData, stats: null, isLoaded: true });
        builderState.initialize(eventId, eventData);
        dom.gateContent.innerHTML = '<div class="builder-empty-state"><strong>Restaurando borrador…</strong><p>Validando el draft general guardado para este evento.</p></div>';
        await invitationDraftService.hydrateState(builderState, eventId);
        dom.gateContent.innerHTML = '<div class="builder-empty-state"><strong>Restaurando RSVP…</strong><p>Validando la configuración interna guardada para este evento.</p></div>';
        await invitationRsvpService.hydrateState(builderState, eventId);
        if (invitationMediaService.getStatus().canUpload) {
            dom.gateContent.innerHTML = '<div class="builder-empty-state"><strong>Restaurando multimedia…</strong><p>Resolviendo los archivos guardados para este evento.</p></div>';
            try {
                const persisted = await invitationMediaService.loadMedia(eventId);
                if (persisted.exists) builderState.hydrateMedia(persisted.media, { persisted: true });
            } catch (mediaError) {
                debugBuilder.captureError('media-hydration-failed', mediaError, { eventId });
            }
        }
        eventBus.emit(EVENT_TYPES.BUILDER_EVENT_SELECTED, { eventId, timestamp: Date.now() });
        updateEventChrome(eventData);
        mountModules();
        const builderUrl = createBuilderUrl(eventId);
        history.replaceState(null, '', debugBuilder.enabled ? `${builderUrl}&debugBuilder=1` : builderUrl);
        dom.gate.hidden = true;
        dom.workspace.hidden = false;
        assertBuilderRootInvariant('event-loaded');
        debugBuilder.trace('event-loaded', { eventId });
    } catch (error) {
        renderGateError('No fue posible abrir este evento.', friendlyError(error), showEventSelection);
        console.error('[Invitation Builder] Error cargando evento:', error);
    }
}

function mountModules() {
    if (modulesMounted) return;
    modulesMounted = true;

    moduleCleanups.push(builderState.subscribeToErrors(({ error, source, reason, retry }) => {
        reportRuntimeError(error, { source, reason, retry });
    }));
    dom.runtimeErrorRetry?.addEventListener('click', retryRuntimeUpdate);

    moduleCleanups.push(initPackageSelector({
        container: document,
        state: builderState
    }));
    moduleCleanups.push(initThemeSelector({
        container: document.getElementById('theme-selector'),
        state: builderState
    }));
    moduleCleanups.push(initIdentityEditor({
        container: document.getElementById('general-information-editor'),
        openingContainer: document.getElementById('opening-information-editor'),
        state: builderState
    }));
    moduleCleanups.push(initSectionCopyEditors({
        container: document.getElementById('section-content-editors'),
        state: builderState
    }));
    moduleCleanups.push(initLogisticsEditors({
        container: document.getElementById('phase3-location-editors'),
        state: builderState,
        editorIds: ['locations'],
        emptyMessage: 'Activa la secci\u00f3n Ubicaci\u00f3n para configurar sus datos.'
    }));
    moduleCleanups.push(initAccessPassEditor({
        container: document.getElementById('access-pass-editor'),
        state: builderState
    }));
    moduleCleanups.push(initLogisticsEditors({
        container: document.getElementById('phase3-details-editors'),
        state: builderState,
        editorIds: ['itinerary', 'dress-code', 'gifts', 'accommodations', 'links'],
        emptyMessage: 'Activa Itinerario, Dress Code, Mesa de regalos o Ubicaci\u00f3n para agregar detalles.'
    }));
    moduleCleanups.push(initMediaEditor({
        container: document.getElementById('phase4-media-editor'),
        state: builderState
    }));
    moduleCleanups.push(initAppearanceEditor({
        container: document.getElementById('appearance-editor'),
        state: builderState
    }));
    moduleCleanups.push(initReviewEditor({
        container: document.getElementById('review-editor'),
        state: builderState,
        publishButton: dom.publish
    }));
    moduleCleanups.push(initDraftPersistenceController({
        button: dom.saveDraft,
        status: dom.saveDraftStatus,
        state: builderState,
        service: invitationDraftService,
        onError: reportRuntimeError,
        onTrace: (event, details) => debugBuilder.trace(event, details)
    }));
    moduleCleanups.push(initInvitationPublicationController({
        button: dom.publish,
        status: dom.publishStatus,
        state: builderState,
        service: invitationPublicationService,
        onError: reportRuntimeError,
        onTrace: (event, details) => debugBuilder.trace(event, details)
    }));
    moduleCleanups.push(initRsvpPersistenceController({
        button: dom.saveRsvp,
        status: dom.saveRsvpStatus,
        state: builderState,
        service: invitationRsvpService,
        onError: reportRuntimeError,
        onTrace: (event, details) => debugBuilder.trace(event, details)
    }));
    moduleCleanups.push(initPreviewController({
        openButton: document.getElementById('builder-open-preview'),
        controls: document.getElementById('preview-device-controls'),
        status: document.getElementById('preview-status'),
        dimension: document.getElementById('preview-dimension'),
        stage: document.getElementById('preview-stage'),
        state: builderState,
        eventBus,
        eventTypes: EVENT_TYPES,
        onError: (error, context) => debugBuilder.captureError('preview-panel-error', error, context),
        onTrace: (event, details) => debugBuilder.trace(event, details)
    }));

    bindStepper();
    bridgeBuilderState();
    syncDraftChrome(builderState.getSnapshot());
    assertBuilderRootInvariant('modules-mounted');
    debugBuilder.trace('modules-mounted');
}

function bridgeBuilderState() {
    const stateBridgeCleanup = initBuilderEventBridge({
        state: builderState,
        eventBus,
        eventTypes: EVENT_TYPES,
        onSnapshot: (snapshot, reason) => {
            assertBuilderRootInvariant(reason);
            syncDraftChrome(snapshot);
            debugBuilder.trace('state-notified', { reason });
        }
    });
    moduleCleanups.push(stateBridgeCleanup);
}

function bindStepper() {
    document.querySelectorAll('.builder-step[data-step-target]').forEach((button) => {
        button.addEventListener('click', () => {
            const target = button.dataset.stepTarget;
            document.querySelectorAll('.builder-step[data-step-target]').forEach((item) => item.classList.toggle('is-active', item === button));
            builderState.setActiveStep(target);
            const panel = document.querySelector(`[data-builder-panel="${target}"]`);
            if (panel) {
                const editorTop = dom.editor.getBoundingClientRect().top;
                const panelTop = panel.getBoundingClientRect().top;
                const scrollMargin = Number.parseFloat(getComputedStyle(panel).scrollMarginTop) || 0;
                dom.editor.scrollTo({
                    top: dom.editor.scrollTop + panelTop - editorTop - scrollMargin,
                    behavior: 'smooth'
                });
            }
        });
    });

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
            if (!visible) return;
            const target = visible.target.dataset.builderPanel;
            document.querySelectorAll('.builder-step[data-step-target]').forEach((button) => button.classList.toggle('is-active', button.dataset.stepTarget === target));
        }, { root: dom.editor, threshold: [0.35, 0.6] });
        document.querySelectorAll('[data-builder-panel]').forEach((panel) => observer.observe(panel));
        moduleCleanups.push(() => observer.disconnect());
    }
}

function syncDraftChrome(snapshot) {
    if (!snapshot.draft) return;
    dom.draftStatus.classList.toggle('is-dirty', snapshot.ui.isDirty);
    dom.draftStatus.lastChild.textContent = snapshot.ui.mediaDirty
        ? ' Multimedia pendiente'
        : (snapshot.ui.rsvpDirty ? ' RSVP pendiente' : (snapshot.ui.generalDraftDirty ? ' Cambios locales' : ' Borrador local'));
}

function assertBuilderRootInvariant(context) {
    const currentRoot = document.getElementById('invitation-builder-root');
    const requiredRegions = ['sidebar', 'editor'];
    const regionsPresent = requiredRegions.every((region) => immutableBuilderRoot?.querySelector(`[data-builder-region="${region}"]`));
    if (currentRoot !== immutableBuilderRoot || !immutableBuilderRoot?.isConnected || !regionsPresent) {
        throw new Error(`builder/root-invariant-violated:${context}`);
    }
    return true;
}

function updateEventChrome(eventData) {
    const name = eventData.nombreEvento || eventData.nombre || 'Evento sin título';
    const code = eventData.codigoEvento || eventData.codigo || eventData.id;
    const city = eventData.ciudad || 'Ciudad por definir';
    const date = typeof eventData.fecha === 'string' ? eventData.fecha.slice(0, 10) : 'Fecha por definir';
    dom.eventLabel.textContent = `${name} · ${code}`;
    dom.activeEvent.textContent = name;
    dom.activeEventMeta.textContent = `${date} · ${city} · ${code}`;
}

function showGate(title, description) {
    dom.workspace.hidden = true;
    dom.gate.hidden = false;
    dom.gateTitle.textContent = title;
    dom.gateDescription.textContent = description;
    dom.gateContent.replaceChildren();
}

function renderGateError(title, description, retry) {
    showGate(title, description);
    const error = document.createElement('div');
    error.className = 'builder-gate-error';
    error.textContent = description;
    dom.gateContent.append(error);
    if (typeof retry === 'function') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'builder-gate-button';
        button.textContent = 'Intentar otra opción';
        button.addEventListener('click', retry);
        dom.gateContent.append(button);
    }
}

function friendlyError(error) {
    const code = error?.code || error?.message || 'builder/unknown';
    if (String(code).includes('permission-denied')) return 'Firebase rechazó la lectura. Verifica custom claims y Rules.';
    if (String(code).includes('unauthenticated')) return 'La sesión administrativa ya no es válida.';
    if (String(code).includes('network') || String(code).includes('unavailable')) return 'No hay conexión disponible para leer el evento.';
    return `Error controlado: ${code}`;
}

function registerGlobalDiagnostics() {
    window.addEventListener('unhandledrejection', (event) => {
        console.error('[Invitation Builder] Promesa no controlada:', event.reason);
        debugBuilder.captureError('unhandledrejection', event.reason);
        if (builderStarted) reportRuntimeError(event.reason, { source: 'unhandledrejection', reason: 'async-runtime' });
    });
    window.addEventListener('error', (event) => {
        console.error('[Invitation Builder] Error de ejecución:', event.error || event.message);
        debugBuilder.captureError('window-error', event.error || new Error(event.message), {
            filename: event.filename,
            line: event.lineno,
            column: event.colno
        });
        if (builderStarted) reportRuntimeError(event.error || new Error(event.message), { source: 'window', reason: 'runtime' });
    });
    window.addEventListener('pagehide', () => {
        moduleCleanups.splice(0).forEach((cleanup) => {
            try { cleanup?.(); } catch (error) { console.warn('[Invitation Builder] Error liberando módulo:', error); }
        });
    }, { once: true });
}

function initUnsavedChangesGuard() {
    const confirmationMessage = 'Tienes cambios sin guardar. ¿Seguro que quieres salir del Invitation Builder?';

    const onBeforeUnload = (event) => {
        if (!builderState.getSnapshot().ui?.isDirty) return;
        event.preventDefault();
        event.returnValue = '';
    };

    const onClick = (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest?.('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

        let destination;
        try {
            destination = new URL(link.href, window.location.href);
        } catch {
            return;
        }
        if (destination.origin !== window.location.origin
            || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
        if (!builderState.getSnapshot().ui?.isDirty) return;
        if (!window.confirm(confirmationMessage)) event.preventDefault();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);

    return () => {
        window.removeEventListener('beforeunload', onBeforeUnload);
        document.removeEventListener('click', onClick, true);
    };
}

function reportRuntimeError(error, { source = 'builder', reason = 'unknown', retry = null } = {}) {
    console.error(`[InvitationBuilder] ${source} falló durante ${reason}.`, error);
    debugBuilder.captureError('runtime-error', error, { source, reason });
    runtimeRetry = typeof retry === 'function' ? retry : null;
    if (!dom.runtimeError) return;
    const titles = {
        'theme-selector': 'No pudimos actualizar las colecciones.',
        'section-selector': 'No pudimos actualizar esta sección.',
        'identity-editor': 'No pudimos actualizar la información.',
        'section-copy-editors': 'No pudimos actualizar el contenido de esta sección.',
        'media-editor': 'No pudimos actualizar el recurso multimedia.',
        'draft-persistence': 'No pudimos guardar el borrador general.',
        'invitation-publication': 'No pudimos publicar la invitación.',
        'rsvp-persistence': 'No pudimos guardar la configuración RSVP.',
        'state-event-bridge': 'No pudimos sincronizar el Builder.'
    };
    if (dom.runtimeErrorTitle) dom.runtimeErrorTitle.textContent = titles[source] ?? 'No pudimos completar esta actualización.';
    dom.runtimeErrorMessage.textContent = runtimeRetry
        ? 'El borrador local se conservó. Puedes reintentar únicamente la actualización fallida.'
        : 'El borrador local se conservó. Revisa la consola de desarrollo para consultar el stack trace.';
    if (dom.runtimeErrorRetry) dom.runtimeErrorRetry.hidden = !runtimeRetry;
    dom.runtimeError.hidden = false;
}

function retryRuntimeUpdate() {
    if (!runtimeRetry) return;
    const retry = runtimeRetry;
    runtimeRetry = null;
    dom.runtimeError.hidden = true;
    try {
        retry();
    } catch (error) {
        reportRuntimeError(error, { source: 'runtime-retry', reason: 'manual-retry', retry });
    }
}
