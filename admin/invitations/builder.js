import { authService } from '../services/auth-service.js';
import { eventService } from '../services/event-service.js';
import { state as adminState } from '../core/state.js';
import { ui } from '../core/ui.js';
import { eventBus } from '../core/event-bus.js';
import { EVENT_TYPES } from '../core/event-types.js';
import { hasPermission, PERMISSIONS } from '../core/roles.js';
import { initThemeManager } from '../core/theme-manager.js';
import { builderState } from './core/builder-state.js';
import { createBuilderUrl, readBuilderRoute } from './core/builder-routing.js';
import { renderEventSelector } from './modules/event-selector.js';
import { initPackageSelector } from './modules/package-selector.js';
import { initThemeSelector } from './modules/theme-selector.js';
import { initSectionSelector } from './modules/section-selector.js';
import { initBasicInformation } from './modules/basic-information.js';
import { initPreviewController } from './modules/preview-controller.js';

const dom = {
    guard: document.getElementById('builder-auth-guard'),
    shell: document.getElementById('builder-shell'),
    gate: document.getElementById('builder-gate'),
    gateTitle: document.getElementById('builder-gate-title'),
    gateDescription: document.getElementById('builder-gate-description'),
    gateContent: document.getElementById('builder-gate-content'),
    workspace: document.getElementById('builder-workspace'),
    editor: document.getElementById('builder-editor'),
    eventLabel: document.getElementById('builder-event-label'),
    activeEvent: document.getElementById('builder-active-event'),
    activeEventMeta: document.getElementById('builder-active-event-meta'),
    draftStatus: document.getElementById('builder-draft-status')
};

let roleContext = null;
let modulesMounted = false;
let stateBridgeCleanup = null;
const moduleCleanups = [];

initThemeManager();
registerManualErrorBoundary();
boot();

async function boot() {
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

        const route = readBuilderRoute(window.location.search);
        if (route.invalidEventParameter) {
            renderGateError('El identificador del evento no es válido.', 'Usa el acceso del Dashboard o de Administrar evento para abrir el Builder.', showEventSelection);
            return;
        }

        if (route.eventId) await loadEvent(route.eventId);
        else await showEventSelection();
    } catch (error) {
        revealShell();
        renderGateError('No fue posible iniciar el Invitation Builder.', friendlyError(error), () => window.location.reload());
        console.error('[Invitation Builder] Error de arranque:', error);
    }
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
    dom.guard.hidden = true;
    dom.shell.hidden = false;
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
        eventBus.emit(EVENT_TYPES.BUILDER_EVENT_SELECTED, { eventId, timestamp: Date.now() });
        updateEventChrome(eventData);
        mountModules();
        history.replaceState(null, '', createBuilderUrl(eventId));
        dom.gate.hidden = true;
        dom.workspace.hidden = false;
    } catch (error) {
        renderGateError('No fue posible abrir este evento.', friendlyError(error), showEventSelection);
        console.error('[Invitation Builder] Error cargando evento:', error);
    }
}

function mountModules() {
    if (modulesMounted) return;
    modulesMounted = true;

    moduleCleanups.push(initPackageSelector({
        container: document.querySelector('.event-context-card'),
        state: builderState
    }));
    moduleCleanups.push(initThemeSelector({
        container: document.getElementById('theme-selector'),
        state: builderState
    }));
    moduleCleanups.push(initSectionSelector({
        container: document.getElementById('section-selector'),
        summary: document.getElementById('section-summary'),
        state: builderState,
        ui
    }));
    moduleCleanups.push(initBasicInformation({
        form: document.getElementById('basic-information-form'),
        state: builderState
    }));
    moduleCleanups.push(initPreviewController({
        frame: document.getElementById('invitation-preview-frame'),
        controls: document.getElementById('preview-device-controls'),
        status: document.getElementById('preview-status'),
        dimension: document.getElementById('preview-dimension'),
        stage: document.getElementById('preview-stage'),
        state: builderState,
        eventBus,
        eventTypes: EVENT_TYPES
    }));

    bindStepper();
    bridgeBuilderState();
    syncDraftChrome(builderState.getSnapshot());
}

function bridgeBuilderState() {
    stateBridgeCleanup = builderState.subscribe(({ snapshot, reason }) => {
        syncDraftChrome(snapshot);
        eventBus.emit(EVENT_TYPES.BUILDER_DRAFT_UPDATED, {
            eventId: snapshot.draft.eventId,
            reason,
            isDirty: snapshot.ui.isDirty,
            timestamp: Date.now()
        });
        if (reason === 'theme-changed') {
            eventBus.emit(EVENT_TYPES.BUILDER_THEME_CHANGED, { themeId: snapshot.draft.themeId, timestamp: Date.now() });
        }
        if (reason === 'sections-changed') {
            eventBus.emit(EVENT_TYPES.BUILDER_SECTIONS_CHANGED, { enabledSections: snapshot.draft.enabledSections, timestamp: Date.now() });
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
            document.querySelector(`[data-builder-panel="${target}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    dom.draftStatus.lastChild.textContent = snapshot.ui.isDirty ? ' Cambios locales' : ' Borrador local';
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

function registerManualErrorBoundary() {
    window.addEventListener('unhandledrejection', (event) => {
        console.error('[Invitation Builder] Promesa no controlada:', event.reason);
        ui.showToast({ message: 'Ocurrió un error inesperado en el Builder.', type: 'error' });
    });
    window.addEventListener('error', (event) => {
        console.error('[Invitation Builder] Error de ejecución:', event.error || event.message);
    });
    window.addEventListener('pagehide', () => {
        moduleCleanups.splice(0).forEach((cleanup) => {
            try { cleanup?.(); } catch (error) { console.warn('[Invitation Builder] Error liberando módulo:', error); }
        });
    }, { once: true });
}
