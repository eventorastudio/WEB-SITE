// admin/modules/event-controller.js
import { EVENT_TYPES } from '../core/event-types.js';

/* ========================================================================== 
 * Variables privadas
 * ========================================================================== */

/** @type {Object|null} Dependencias inyectadas por el orquestador. */
let deps = null;

/** @type {{ byId: Map<string, HTMLElement>, tabButtons: HTMLButtonElement[], tabPanels: HTMLElement[] }} */
let dom = createEmptyDomCache();

/** @type {Array<Function>} Funciones que eliminan listeners del DOM. */
let domCleanups = [];

/** @type {Array<Function>} Funciones que eliminan suscripciones del Event Bus. */
let eventBusCleanups = [];

/** @type {Map<string, Object>} Invitados recibidos mediante eventos del sistema. */
let guestsById = new Map();

/** @type {boolean} Indica si guestsById contiene una lista completa y no sólo cambios incrementales. */
let hasGuestSnapshot = false;

/** @type {{ total: number, confirmed: number, noAttendance: number, arrivals: number, pending: number }} */
let statsAdjustments = createEmptyStats();

/** @type {Object|null} Datos de evento recibidos en una actualización tipada. */
let eventDataOverride = null;


/* ========================================================================== 
 * API Pública
 * ========================================================================== */

/**
 * Inicializa el controlador de interfaz de la vista de administración de un evento.
 * @param {Object} container - Contenedor de dependencias creado por admin/event.js.
 * @param {Object} container.state - Administrador de estado global.
 * @param {Object} container.ui - Administrador de interfaz global.
 * @param {Object} container.eventBus - Bus de eventos tipados.
 * @param {Object} container.services - Servicios de dominio disponibles para la vista.
 * @param {Object} container.eventContext - Contexto del evento activo.
 * @returns {void}
 */
export function initEventController(container) {
    destroy();

    if (!hasRequiredDependencies(container)) {
        console.error('[Event Controller] No se recibieron las dependencias requeridas.');
        return;
    }

    deps = container;
    initialize();
}

/**
 * Elimina todos los listeners y referencias para permitir una nueva inicialización segura.
 * @returns {void}
 */
export function destroy() {
    runCleanups(domCleanups);
    runCleanups(eventBusCleanups);

    domCleanups = [];
    eventBusCleanups = [];
    guestsById.clear();
    hasGuestSnapshot = false;
    statsAdjustments = createEmptyStats();
    eventDataOverride = null;
    dom = createEmptyDomCache();
    deps = null;
}


/* ========================================================================== 
 * Inicialización
 * ========================================================================== */

/**
 * Prepara las referencias de interfaz, el render inicial y todos los listeners.
 * @returns {void}
 */
function initialize() {
    cacheDom();
    render();
    bindButtons();
    bindTabs();
    registerEventBusListeners();
}


/* ========================================================================== 
 * Cache DOM
 * ========================================================================== */

/**
 * Detecta los IDs, pestañas y paneles que realmente existen en event.html.
 * @returns {void}
 */
function cacheDom() {
    dom = createEmptyDomCache();

    document.querySelectorAll('[id]').forEach((element) => {
        dom.byId.set(element.id, element);
    });

    dom.tabButtons = Array.from(document.querySelectorAll('.tab-btn[data-target]'));
    dom.tabPanels = Array.from(document.querySelectorAll('.tab-pane'));
}


/* ========================================================================== 
 * Render
 * ========================================================================== */

/**
 * Actualiza toda la información administrada por el controlador.
 * @returns {void}
 */
function render() {
    const eventData = getEventData();

    renderMainView();
    renderHeader(eventData);
    renderInformation(eventData);
    renderStatistics(eventData);
    renderGuests(eventData);
    renderConfiguration(eventData);
}

/**
 * Cambia del skeleton inicial a la vista principal cuando el evento ya está disponible.
 * @returns {void}
 */
function renderMainView() {
    const loadingView = getElement('loading-view');
    const errorView = getElement('error-view');
    const mainView = getElement('main-view');

    if (loadingView) loadingView.style.display = 'none';
    if (errorView) errorView.style.display = 'none';
    if (mainView) {
        mainView.style.display = 'block';
        mainView.style.opacity = '1';
    }
}


/* ========================================================================== 
 * Render Header
 * ========================================================================== */

/**
 * Renderiza el resumen visible en el encabezado del evento.
 * @param {Object} eventData - Datos normalizados del evento activo.
 * @returns {void}
 */
function renderHeader(eventData) {
    const name = getEventName(eventData);
    const city = getDisplayValue(eventData.ciudad, 'Por definir');
    const date = formatEventDate(eventData.fecha);
    const status = formatEventStatus(eventData.estadoEvento ?? eventData.estado);

    setText('val-nombre', name);
    setText('val-ciudad', city);
    setText('val-fecha', date);
    setText('val-estado-badge', status.label);
    setStatusClass(getElement('val-estado-badge'), status.className);
    setText('editor-event-name', name);
}


/* ========================================================================== 
 * Render Información
 * ========================================================================== */

/**
 * Renderiza los datos informativos del evento en la pestaña Información.
 * @param {Object} eventData - Datos normalizados del evento activo.
 * @returns {void}
 */
function renderInformation(eventData) {
    setText('info-nombre', getEventName(eventData));
    setText('info-tipo', getDisplayValue(eventData.tipoEvento, 'Por definir'));
    setText('info-fecha', formatEventDate(eventData.fecha));
    setText('info-hora', formatEventTime(eventData.hora));
    setText('info-ubicacion', formatLocation(eventData));
    setText('info-estado', formatEventStatus(eventData.estadoEvento ?? eventData.estado).label);
    setText('info-descripcion', getDisplayValue(eventData.descripcion, 'Sin descripción.'));
}


/* ========================================================================== 
 * Render Estadísticas
 * ========================================================================== */

/**
 * Renderiza las tarjetas de resumen y las estadísticas detalladas disponibles.
 * @param {Object} eventData - Datos normalizados del evento activo.
 * @returns {void}
 */
function renderStatistics(eventData) {
    const stats = getStatistics(eventData);
    const confirmationPercentage = stats.total > 0
        ? Math.round((stats.confirmed / stats.total) * 100)
        : 0;

    setText('count-invitados', formatNumber(stats.total));
    setText('count-confirmados', formatNumber(stats.confirmed));
    setText('count-pendientes', formatNumber(stats.pending));
    setText('count-llegadas', formatNumber(stats.arrivals));

    setText('stat-porcentaje', `${confirmationPercentage}%`);
    setWidth('stat-progress-bar', confirmationPercentage);
    setText('stat-total', formatNumber(stats.total));
    setText('stat-confirmados', formatNumber(stats.confirmed));
    setText('stat-pendientes', formatNumber(stats.pending));
    setText('stat-noasiste', formatNumber(stats.noAttendance));
    setText('stat-llegadas', formatNumber(stats.arrivals));
}


/* ========================================================================== 
 * Render Invitados
 * ========================================================================== */

/**
 * Actualiza el resumen de invitados y el estado vacío sin realizar consultas.
 * @param {Object} eventData - Datos normalizados del evento activo.
 * @returns {void}
 */
function renderGuests(eventData) {
    const stats = getStatistics(eventData);
    const emptyState = getElement('guests-empty-state');
    const guestsList = getElement('guests-list');

    setText('g-stat-total', formatNumber(stats.total));
    setText('g-stat-conf', formatNumber(stats.confirmed));
    setText('g-stat-pend', formatNumber(stats.pending));
    setText('g-stat-no', formatNumber(stats.noAttendance));
    setText('g-stat-llegaron', formatNumber(stats.arrivals));

    if (emptyState) {
        emptyState.style.display = stats.total > 0 ? 'none' : 'block';
    }

    if (guestsList && stats.total === 0) {
        guestsList.replaceChildren();
    }
}


/* ========================================================================== 
 * Render Configuración
 * ========================================================================== */

/**
 * Renderiza la configuración operativa existente del evento.
 * @param {Object} eventData - Datos normalizados del evento activo.
 * @returns {void}
 */
function renderConfiguration(eventData) {
    const eventId = getDisplayValue(eventData.codigoEvento ?? eventData.id ?? deps.eventContext.eventId, '--');

    setText('conf-estado', formatEventStatus(eventData.estadoEvento ?? eventData.estado).label);
    setText('conf-acceso', getDisplayValue(eventData.tipoAcceso, 'Por definir'));
    setText('conf-codigo', eventId);
    setText('conf-clave', getDisplayValue(eventData.claveAcceso, 'No configurada'));
}


/* ========================================================================== 
 * Eventos
 * ========================================================================== */

/**
 * Registra las suscripciones tipadas requeridas para mantener la interfaz sincronizada.
 * @returns {void}
 */
function registerEventBusListeners() {
    subscribeToEvent(EVENT_TYPES.EVENT_LOADED, handleEventLoaded);
    subscribeToEvent(EVENT_TYPES.EVENT_UPDATED, handleEventUpdated);
    subscribeToEvent(EVENT_TYPES.GUEST_CREATED, handleGuestCreated);
    subscribeToEvent(EVENT_TYPES.GUEST_UPDATED, handleGuestUpdated);
    subscribeToEvent(EVENT_TYPES.GUEST_DELETED, handleGuestDeleted);
    subscribeToEvent(EVENT_TYPES.GUEST_IMPORTED, handleGuestsImported);
    subscribeToEvent(EVENT_TYPES.RSVP_CONFIRMED, handleGuestUpdated);
    subscribeToEvent(EVENT_TYPES.CHECKIN_COMPLETED, handleGuestUpdated);
}

/**
 * Refresca la vista al finalizar la carga orquestada del evento actual.
 * @param {Object} payload - Metadatos de carga emitidos por el orquestador.
 * @returns {void}
 */
function handleEventLoaded(payload) {
    if (isCurrentEventPayload(payload)) {
        render();
    }
}

/**
 * Actualiza la interfaz cuando otro módulo comunica datos nuevos del evento.
 * @param {Object} payload - Carga tipada de actualización de evento.
 * @returns {void}
 */
function handleEventUpdated(payload) {
    if (!isCurrentEventPayload(payload)) return;

    const nextEventData = payload?.eventData ?? payload?.data;
    if (isPlainObject(nextEventData)) {
        eventDataOverride = nextEventData;
        statsAdjustments = createEmptyStats();
    }

    render();
}

/**
 * Incorpora un invitado creado que haya sido publicado a través del Event Bus.
 * @param {Object} payload - Carga con el invitado creado o sus estadísticas.
 * @returns {void}
 */
function handleGuestCreated(payload) {
    if (!isCurrentEventPayload(payload)) return;

    registerGuestFromPayload(payload);
    renderGuestsAndStatistics();
}

/**
 * Sincroniza un invitado actualizado, confirmación RSVP o llegada registrada.
 * @param {Object} payload - Carga con el invitado actualizado o sus estadísticas.
 * @returns {void}
 */
function handleGuestUpdated(payload) {
    if (!isCurrentEventPayload(payload)) return;

    const guest = getGuestFromPayload(payload);
    if (guest?.id && guestsById.has(guest.id)) {
        const previousGuest = guestsById.get(guest.id);
        guestsById.set(guest.id, guest);
        if (!hasGuestSnapshot) {
            applyGuestAdjustment(previousGuest, -1);
            applyGuestAdjustment(guest, 1);
        }
    } else if (guest?.id && hasGuestSnapshot) {
        guestsById.set(guest.id, guest);
    }

    applyStatisticsPayload(payload);
    renderGuestsAndStatistics();
}

/**
 * Elimina del registro local un invitado notificado como eliminado.
 * @param {Object} payload - Carga con el ID o el invitado eliminado.
 * @returns {void}
 */
function handleGuestDeleted(payload) {
    if (!isCurrentEventPayload(payload)) return;

    const guest = getGuestFromPayload(payload);
    const guestId = guest?.id ?? payload?.guestId;
    if (guestId) {
        const previousGuest = guestsById.get(guestId);
        guestsById.delete(guestId);
        if (previousGuest && !hasGuestSnapshot) {
            applyGuestAdjustment(previousGuest, -1);
        }
    } else {
        applyImportedGuestAdjustment(-toSafeNumber(payload?.count, 0));
    }

    applyStatisticsPayload(payload);
    renderGuestsAndStatistics();
}

/**
 * Procesa la señal emitida por excel-import.js sin consultar servicios.
 * @param {Object} payload - Carga de importación con conteo o lista de invitados.
 * @returns {void}
 */
function handleGuestsImported(payload) {
    if (!isCurrentEventPayload(payload)) return;

    if (Array.isArray(payload?.guests)) {
        replaceGuests(payload.guests);
    } else {
        applyImportedGuestAdjustment(toSafeNumber(payload?.count, 0));
    }

    applyStatisticsPayload(payload);
    renderGuestsAndStatistics();
}


/* ========================================================================== 
 * Botones
 * ========================================================================== */

/**
 * Conecta los botones propios de la cabecera sin duplicar listeners.
 * @returns {void}
 */
function bindButtons() {
    listen(getElement('btn-back'), 'click', handleBackClick);
    listen(getElement('btn-edit-info'), 'click', handleEditInformationClick);
}

/**
 * Regresa a la vista de tablero respetando la ruta existente del proyecto.
 * @param {MouseEvent} event - Evento de clic del botón Volver.
 * @returns {void}
 */
function handleBackClick(event) {
    event.preventDefault();
    document.location.assign('./dashboard.html');
}

/**
 * Lleva al usuario a la información del evento y comunica el estado de la acción disponible.
 * @param {MouseEvent} event - Evento de clic del botón Editar información.
 * @returns {void}
 */
function handleEditInformationClick(event) {
    event.preventDefault();
    activateTab('info');

    const infoPanel = getTabPanel('info');
    infoPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    deps.ui.showToast({
        title: 'Información del evento',
        message: 'La vista de edición no está registrada en este proyecto.',
        type: 'info'
    });
}


/* ========================================================================== 
 * Tabs
 * ========================================================================== */

/**
 * Registra el cambio de pestañas usando los atributos data-target existentes.
 * @returns {void}
 */
function bindTabs() {
    dom.tabButtons.forEach((button) => {
        listen(button, 'click', () => activateTab(button.dataset.target));
    });
}

/**
 * Activa exclusivamente el botón y panel asociados al target solicitado.
 * @param {string|undefined} target - Valor del atributo data-target del botón.
 * @returns {void}
 */
function activateTab(target) {
    const panel = getTabPanel(target);
    if (!panel) return;

    dom.tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.target === target);
    });

    dom.tabPanels.forEach((tabPanel) => {
        tabPanel.classList.toggle('active', tabPanel === panel);
    });
}


/* ========================================================================== 
 * Helpers
 * ========================================================================== */

/**
 * Crea la estructura vacía de la caché de elementos del DOM.
 * @returns {{ byId: Map<string, HTMLElement>, tabButtons: HTMLButtonElement[], tabPanels: HTMLElement[] }}
 */
function createEmptyDomCache() {
    return { byId: new Map(), tabButtons: [], tabPanels: [] };
}

/**
 * Crea un objeto de estadísticas con valores seguros.
 * @returns {{ total: number, confirmed: number, noAttendance: number, arrivals: number, pending: number }}
 */
function createEmptyStats() {
    return { total: 0, confirmed: 0, noAttendance: 0, arrivals: 0, pending: 0 };
}

/**
 * Comprueba que el contenedor incluya las únicas dependencias permitidas para el módulo.
 * @param {Object} container - Contenedor candidato.
 * @returns {boolean} True cuando todas las dependencias obligatorias existen.
 */
function hasRequiredDependencies(container) {
    return Boolean(
        container
        && container.state
        && container.ui
        && container.eventBus
        && container.services
        && container.eventContext
    );
}

/**
 * Obtiene un elemento previamente detectado por su ID real.
 * @param {string} id - ID presente en event.html.
 * @returns {HTMLElement|null} Elemento detectado o null.
 */
function getElement(id) {
    return dom.byId.get(id) ?? null;
}

/**
 * Obtiene el panel asociado a un data-target sin construir selectores de IDs supuestos.
 * @param {string|undefined} target - Target de la pestaña.
 * @returns {HTMLElement|null} Panel asociado o null.
 */
function getTabPanel(target) {
    if (!target) return null;

    return dom.tabPanels.find((panel) => (
        panel.id === target || panel.id.replace(/^tab-/, '') === target
    )) ?? null;
}

/**
 * Devuelve los datos más recientes disponibles sin mutar el State.
 * @returns {Object} Datos seguros del evento.
 */
function getEventData() {
    if (isPlainObject(eventDataOverride)) return eventDataOverride;

    if (isPlainObject(deps.eventContext.eventData)) return deps.eventContext.eventData;

    const stateData = deps.state.getState('event.data');
    return isPlainObject(stateData) ? stateData : {};
}

/**
 * Obtiene el nombre del evento compatible con las propiedades existentes del proyecto.
 * @param {Object} eventData - Datos del evento.
 * @returns {string} Nombre seguro para mostrar.
 */
function getEventName(eventData) {
    return getDisplayValue(eventData.nombreEvento ?? eventData.nombre, 'Evento sin título');
}

/**
 * Convierte un valor potencialmente vacío en un texto seguro de interfaz.
 * @param {*} value - Valor a mostrar.
 * @param {string} fallback - Texto alternativo.
 * @returns {string} Valor visible seguro.
 */
function getDisplayValue(value, fallback = '--') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text ? text : fallback;
}

/**
 * Formatea una fecha de string, Date o Timestamp sin cambiar el día por zona horaria.
 * @param {*} value - Fecha de evento.
 * @returns {string} Fecha localizada para mostrar.
 */
function formatEventDate(value) {
    const date = toDate(value);
    if (!date) return 'Por definir';

    return new Intl.DateTimeFormat('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

/**
 * Formatea la hora almacenada en el formato usado por el formulario de creación.
 * @param {*} value - Hora del evento.
 * @returns {string} Hora segura para mostrar.
 */
function formatEventTime(value) {
    if (typeof value !== 'string' || !/^\d{1,2}:\d{2}/.test(value.trim())) {
        return getDisplayValue(value, 'Por definir');
    }

    const [hours, minutes] = value.trim().split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 'Por definir';

    const date = new Date(2000, 0, 1, hours, minutes);
    return new Intl.DateTimeFormat('es-MX', {
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

/**
 * Convierte los campos reales de ubicación del evento en una sola cadena.
 * @param {Object} eventData - Datos del evento.
 * @returns {string} Ubicación segura para mostrar.
 */
function formatLocation(eventData) {
    const parts = [eventData.ciudad, eventData.estado, eventData.pais]
        .map((value) => getDisplayValue(value, ''))
        .filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : 'Por definir';
}

/**
 * Normaliza y presenta el estado del evento con su clase visual existente.
 * @param {*} value - Estado almacenado del evento.
 * @returns {{ label: string, className: string }} Etiqueta y clase de estado.
 */
function formatEventStatus(value) {
    const normalized = normalizeText(value);
    if (normalized.includes('activo')) return { label: 'Activo', className: 'activo' };
    if (normalized.includes('finalizado')) return { label: 'Finalizado', className: 'finalizado' };
    return { label: 'Borrador', className: 'borrador' };
}

/**
 * Calcula las estadísticas de la vista combinando datos del evento y eventos de invitados.
 * @param {Object} eventData - Datos del evento.
 * @returns {{ total: number, confirmed: number, noAttendance: number, arrivals: number, pending: number }} Estadísticas seguras.
 */
function getStatistics(eventData) {
    if (hasGuestSnapshot) {
        return calculateGuestStatistics(Array.from(guestsById.values()));
    }

    const total = toSafeNumber(eventData.totalInvitados ?? eventData.invitados, 0);
    const confirmed = clamp(toSafeNumber(eventData.confirmados, 0), 0, total);
    const noAttendance = clamp(toSafeNumber(eventData.noAsisten ?? eventData.noAsiste, 0), 0, total - confirmed);
    const arrivals = clamp(toSafeNumber(eventData.llegaron, 0), 0, total);
    const defaultPending = Math.max(total - confirmed - noAttendance, 0);
    const pending = clamp(
        toSafeNumber(eventData.pendientes, defaultPending),
        0,
        total
    );

    return normalizeStatistics({
        total: total + statsAdjustments.total,
        confirmed: confirmed + statsAdjustments.confirmed,
        noAttendance: noAttendance + statsAdjustments.noAttendance,
        arrivals: arrivals + statsAdjustments.arrivals,
        pending: pending + statsAdjustments.pending
    });
}

/**
 * Calcula estadísticas a partir de una lista recibida explícitamente por Event Bus.
 * @param {Object[]} guests - Invitados disponibles en la carga del evento.
 * @returns {{ total: number, confirmed: number, noAttendance: number, arrivals: number, pending: number }} Totales calculados.
 */
function calculateGuestStatistics(guests) {
    const statistics = guests.reduce((totals, guest) => {
        const passes = getGuestPasses(guest);
        const status = getGuestStatus(guest);

        totals.total += passes;
        if (status === 'confirmed' || status === 'arrived') totals.confirmed += passes;
        if (status === 'no-attendance') totals.noAttendance += passes;
        if (status === 'arrived') totals.arrivals += passes;
        if (status === 'pending') totals.pending += passes;
        return totals;
    }, createEmptyStats());

    return normalizeStatistics(statistics);
}

/**
 * Registra un listener del DOM y guarda una función de limpieza centralizada.
 * @param {EventTarget|null} target - Destino del listener.
 * @param {string} eventName - Nombre del evento DOM.
 * @param {EventListenerOrEventListenerObject} listener - Función escuchadora.
 * @param {boolean|AddEventListenerOptions} [options] - Opciones del listener.
 * @returns {void}
 */
function listen(target, eventName, listener, options) {
    if (!target) return;

    target.addEventListener(eventName, listener, options);
    domCleanups.push(() => target.removeEventListener(eventName, listener, options));
}

/**
 * Se suscribe a un evento oficial y registra su desuscripción para destroy().
 * @param {string} eventType - Constante de EVENT_TYPES.
 * @param {Function} handler - Manejador del evento.
 * @returns {void}
 */
function subscribeToEvent(eventType, handler) {
    const unsubscribe = deps.eventBus.on(eventType, handler);
    if (typeof unsubscribe === 'function') {
        eventBusCleanups.push(unsubscribe);
    }
}

/**
 * Determina si una carga de evento pertenece al evento actualmente abierto.
 * @param {Object} payload - Carga a validar.
 * @returns {boolean} True si pertenece al contexto activo o no declara un ID.
 */
function isCurrentEventPayload(payload) {
    const eventId = payload?.eventId;
    return !eventId || eventId === deps.eventContext.eventId;
}

/**
 * Extrae el invitado de las variantes de carga compatibles con los eventos tipados.
 * @param {Object} payload - Carga del Event Bus.
 * @returns {Object|null} Invitado contenido en la carga.
 */
function getGuestFromPayload(payload) {
    const guest = payload?.guest ?? payload?.data;
    return isPlainObject(guest) ? guest : null;
}

/**
 * Añade un invitado o una lista proporcionada por una carga de evento.
 * @param {Object} payload - Carga de Event Bus.
 * @returns {void}
 */
function registerGuestFromPayload(payload) {
    if (Array.isArray(payload?.guests)) {
        replaceGuests(payload.guests);
        return;
    }

    const guest = getGuestFromPayload(payload);
    if (guest?.id) {
        guestsById.set(guest.id, guest);
        if (!hasGuestSnapshot) {
            applyGuestAdjustment(guest, 1);
        }
        return;
    }

    applyImportedGuestAdjustment(toSafeNumber(payload?.count, 0));
}

/**
 * Reemplaza el registro local por una lista explícita recibida mediante Event Bus.
 * @param {Object[]} guests - Lista limpia de invitados.
 * @returns {void}
 */
function replaceGuests(guests) {
    guestsById.clear();
    guests.forEach((guest, index) => {
        if (isPlainObject(guest)) {
            guestsById.set(guest.id ?? `event-guest-${index}`, guest);
        }
    });
    hasGuestSnapshot = true;
    statsAdjustments = createEmptyStats();
}

/**
 * Aplica el efecto de un invitado incremental sobre las estadísticas visibles.
 * @param {Object} guest - Invitado que se agrega o retira.
 * @param {1|-1} direction - Dirección del ajuste.
 * @returns {void}
 */
function applyGuestAdjustment(guest, direction) {
    const passes = getGuestPasses(guest) * direction;
    const status = getGuestStatus(guest);

    statsAdjustments.total += passes;
    if (status === 'confirmed' || status === 'arrived') {
        statsAdjustments.confirmed += passes;
    }
    if (status === 'no-attendance') {
        statsAdjustments.noAttendance += passes;
    }
    if (status === 'arrived') {
        statsAdjustments.arrivals += passes;
    }
    if (status === 'pending') {
        statsAdjustments.pending += passes;
    }
}

/**
 * Ajusta los totales al recibir la señal resumida de importación de Excel.
 * @param {number} count - Cantidad de invitados importados.
 * @returns {void}
 */
function applyImportedGuestAdjustment(count) {
    if (!count) return;

    statsAdjustments.total += count;
    statsAdjustments.pending += count;
}

/**
 * Aplica estadísticas explícitas enviadas por futuros módulos sin asumir su estructura.
 * @param {Object} payload - Carga del Event Bus.
 * @returns {void}
 */
function applyStatisticsPayload(payload) {
    const statistics = payload?.statistics ?? payload?.stats;
    if (!isPlainObject(statistics)) return;

    const currentEvent = getEventData();
    const base = getStatisticsBase(currentEvent);
    statsAdjustments = {
        total: toSafeNumber(statistics.total ?? statistics.totalInvitados, base.total) - base.total,
        confirmed: toSafeNumber(statistics.confirmed ?? statistics.confirmados, base.confirmed) - base.confirmed,
        noAttendance: toSafeNumber(statistics.noAttendance ?? statistics.noAsisten ?? statistics.noAsiste, base.noAttendance) - base.noAttendance,
        arrivals: toSafeNumber(statistics.arrivals ?? statistics.llegaron, base.arrivals) - base.arrivals,
        pending: toSafeNumber(statistics.pending ?? statistics.pendientes, base.pending) - base.pending
    };
}

/**
 * Obtiene las estadísticas publicadas directamente por el documento del evento.
 * @param {Object} eventData - Datos del evento.
 * @returns {{ total: number, confirmed: number, noAttendance: number, arrivals: number, pending: number }} Base de cálculo.
 */
function getStatisticsBase(eventData) {
    const total = toSafeNumber(eventData.totalInvitados ?? eventData.invitados, 0);
    const confirmed = clamp(toSafeNumber(eventData.confirmados, 0), 0, total);
    const noAttendance = clamp(toSafeNumber(eventData.noAsisten ?? eventData.noAsiste, 0), 0, total - confirmed);
    const arrivals = clamp(toSafeNumber(eventData.llegaron, 0), 0, total);
    const pending = clamp(
        toSafeNumber(eventData.pendientes, Math.max(total - confirmed - noAttendance, 0)),
        0,
        total
    );

    return { total, confirmed, noAttendance, arrivals, pending };
}

/**
 * Obtiene los pases de un invitado con un valor seguro por defecto.
 * @param {Object} guest - Invitado notificado.
 * @returns {number} Cantidad válida de pases.
 */
function getGuestPasses(guest) {
    return Math.max(toSafeNumber(guest?.pases, 1), 1);
}

/**
 * Clasifica el estado de un invitado según los valores presentes en event.html.
 * @param {Object} guest - Invitado notificado.
 * @returns {'confirmed'|'no-attendance'|'arrived'|'pending'} Estado normalizado.
 */
function getGuestStatus(guest) {
    const status = normalizeText(guest?.estado ?? guest?.status);
    if (status.includes('llego')) return 'arrived';
    if (status.includes('confirm')) return 'confirmed';
    if (status.includes('no asist')) return 'no-attendance';
    return 'pending';
}

/**
 * Normaliza los límites entre contadores de estadísticas.
 * @param {{ total: number, confirmed: number, noAttendance: number, arrivals: number, pending: number }} statistics - Valores a normalizar.
 * @returns {{ total: number, confirmed: number, noAttendance: number, arrivals: number, pending: number }} Valores seguros.
 */
function normalizeStatistics(statistics) {
    const total = Math.max(toSafeNumber(statistics.total, 0), 0);
    const confirmed = clamp(toSafeNumber(statistics.confirmed, 0), 0, total);
    const noAttendance = clamp(toSafeNumber(statistics.noAttendance, 0), 0, total - confirmed);
    const arrivals = clamp(toSafeNumber(statistics.arrivals, 0), 0, total);
    const pending = clamp(toSafeNumber(statistics.pending, total - confirmed - noAttendance), 0, total);

    return { total, confirmed, noAttendance, arrivals, pending };
}

/**
 * Convierte una fecha compatible en un objeto Date válido.
 * @param {*} value - Fecha de origen.
 * @returns {Date|null} Fecha válida o null.
 */
function toDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value?.toDate === 'function') return toDate(value.toDate());

    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00`)
        : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Convierte cualquier valor numérico en un entero seguro.
 * @param {*} value - Valor a convertir.
 * @param {number} fallback - Valor alternativo.
 * @returns {number} Entero no negativo o fallback.
 */
function toSafeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(Math.round(number), 0) : fallback;
}

/**
 * Limita un número a un rango inclusivo.
 * @param {number} value - Valor a limitar.
 * @param {number} min - Mínimo permitido.
 * @param {number} max - Máximo permitido.
 * @returns {number} Valor limitado.
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Normaliza texto para comparaciones tolerantes a acentos y mayúsculas.
 * @param {*} value - Texto original.
 * @returns {string} Texto normalizado.
 */
function normalizeText(value) {
    return getDisplayValue(value, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

/**
 * Comprueba si un valor es un objeto de datos utilizable.
 * @param {*} value - Valor a validar.
 * @returns {boolean} True para objetos planos o POJOs.
 */
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Escribe texto seguro en un elemento existente.
 * @param {string} id - ID detectado en el DOM.
 * @param {*} value - Texto a mostrar.
 * @returns {void}
 */
function setText(id, value) {
    const element = getElement(id);
    if (element) element.textContent = value;
}

/**
 * Ajusta las clases de estado existentes en una insignia.
 * @param {HTMLElement|null} element - Elemento de insignia.
 * @param {string} statusClass - Clase de estado calculada.
 * @returns {void}
 */
function setStatusClass(element, statusClass) {
    if (!element) return;
    element.classList.remove('activo', 'finalizado', 'borrador');
    element.classList.add(statusClass);
}

/**
 * Actualiza el ancho porcentual de una barra existente.
 * @param {string} id - ID detectado en el DOM.
 * @param {number} percentage - Porcentaje a aplicar.
 * @returns {void}
 */
function setWidth(id, percentage) {
    const element = getElement(id);
    if (element) element.style.width = `${clamp(percentage, 0, 100)}%`;
}

/**
 * Formatea un contador usando la localización de la aplicación.
 * @param {number} value - Número a formatear.
 * @returns {string} Número visible.
 */
function formatNumber(value) {
    return new Intl.NumberFormat('es-MX').format(toSafeNumber(value, 0));
}

/**
 * Renderiza solamente las zonas que dependen de estadísticas de invitados.
 * @returns {void}
 */
function renderGuestsAndStatistics() {
    const eventData = getEventData();
    renderStatistics(eventData);
    renderGuests(eventData);
}


/* ========================================================================== 
 * Cleanup
 * ========================================================================== */

/**
 * Ejecuta de forma defensiva una colección de callbacks de limpieza.
 * @param {Function[]} cleanups - Callbacks a ejecutar.
 * @returns {void}
 */
function runCleanups(cleanups) {
    cleanups.forEach((cleanup) => {
        try {
            cleanup();
        } catch (error) {
            console.warn('[Event Controller] Error durante cleanup:', error);
        }
    });
}
