// admin/modules/event-controller.js
import { EVENT_TYPES } from '../core/event-types.js';
import { getEventStatusPresentation } from '../../shared/event-status.js';
import {
    createGuestRsvpOperationalElement,
    indexRsvpOperationalDocuments
} from './guests/rsvp-operational-view.js';

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

/** @type {Object|null} Datos de evento recibidos en una actualización tipada. */
let eventDataOverride = null;

/** Desuscripción del listener realtime de invitados. */
let guestSubscriptionCleanup = null;
let rsvpOperationsSubscriptionCleanup = null;

/** Estado de carga independiente de la subcolección de invitados. */
let guestLoadState = 'idle';
let guestLoadError = null;
let rsvpOperationsLoadState = 'idle';
let rsvpStatesByGuestId = new Map();
let rsvpConflictGuestIds = new Set();

/** Filtros visuales efímeros; las listas completas nunca se guardan en State. */
let guestFilters = { search: '', status: 'all', table: 'all', sort: 'name-asc' };
let guestVisibleLimit = 50;
let guestSearchTimer = null;
let activeGuestMode = 'create';


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
    console.log('[EVENT_CONTROLLER] init()');
    destroy();

    if (!hasRequiredDependencies(container)) {
        const error = new Error('[Event Controller] No se recibieron las dependencias requeridas.');
        console.error(error);
        throw error;
    }

    deps = container;
    try {
        initialize();
        console.log('[EVENT_CONTROLLER] init() completed');
    } catch (error) {
        console.error('[EVENT_CONTROLLER] init() failed:', error);
        throw error;
    }
}

/**
 * Elimina todos los listeners y referencias para permitir una nueva inicialización segura.
 * @returns {void}
 */
export function destroy() {
    closeEventEditModal();
    closeEventDeleteModal();
    closeGuestModal();
    runCleanups(domCleanups);
    runCleanups(eventBusCleanups);
    guestSubscriptionCleanup?.();
    rsvpOperationsSubscriptionCleanup?.();
    if (guestSearchTimer) window.clearTimeout(guestSearchTimer);

    domCleanups = [];
    eventBusCleanups = [];
    guestSubscriptionCleanup = null;
    rsvpOperationsSubscriptionCleanup = null;
    guestSearchTimer = null;
    guestsById.clear();
    hasGuestSnapshot = false;
    eventDataOverride = null;
    guestLoadState = 'idle';
    guestLoadError = null;
    rsvpOperationsLoadState = 'idle';
    rsvpStatesByGuestId.clear();
    rsvpConflictGuestIds.clear();
    guestFilters = { search: '', status: 'all', table: 'all', sort: 'name-asc' };
    guestVisibleLimit = 50;
    activeGuestMode = 'create';
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

    renderHeader(eventData);
    renderInformation(eventData);
    renderStatistics(eventData);
    renderGuests(eventData);
    renderConfiguration(eventData);
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
    const status = formatEventStatus(eventData);

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
    setText('info-estado', formatEventStatus(eventData).label);
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

    if (!guestsList) return;

    if (guestLoadState === 'idle' || guestLoadState === 'loading') {
        if (emptyState) emptyState.style.display = 'none';
        renderGuestSkeleton(guestsList);
        return;
    }

    if (guestLoadState === 'error') {
        if (emptyState) emptyState.style.display = 'none';
        renderGuestLoadError(guestsList);
        return;
    }

    const guests = Array.from(guestsById.values());
    syncGuestTableFilter(guests);

    if (guests.length === 0) {
        guestsList.replaceChildren();
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    const filteredGuests = getFilteredGuests(guests);

    if (filteredGuests.length === 0) {
        renderGuestNoResults(guestsList);
        return;
    }

    renderGuestCollection(guestsList, filteredGuests);
}

/** Carga la subcolección una sola vez al abrir la pestaña Invitados. */
async function ensureGuestsLoaded() {
    if (guestLoadState === 'loading' || guestLoadState === 'loaded') return;

    if (typeof deps.services.guest?.getGuestsByEventId !== 'function') {
        guestLoadState = 'error';
        guestLoadError = 'El servicio de invitados no está disponible.';
        renderGuests(getEventData());
        return;
    }

    guestLoadState = 'loading';
    guestLoadError = null;
    renderGuests(getEventData());

    try {
        const guests = await deps.services.guest.getGuestsByEventId(deps.eventContext.eventId);
        replaceGuests(guests);
        guestLoadState = 'loaded';
        startGuestSubscription();
        startRsvpOperationsSubscription();
        renderGuestsAndStatistics();
    } catch (error) {
        console.error('[Event Controller] Error cargando invitados:', error);
        guestLoadState = 'error';
        guestLoadError = error?.message || 'No fue posible consultar los invitados.';
        renderGuests(getEventData());
        deps.ui.showToast({
            title: 'No se pudieron cargar los invitados',
            message: 'Verifica tu conexión e inténtalo nuevamente.',
            type: 'error'
        });
    }
}

/** Mantiene la proyección RSVP privada y sus conflictos separada del guest. */
function startRsvpOperationsSubscription() {
    if (rsvpOperationsSubscriptionCleanup) return;
    const subscribe = deps.services.rsvpOperations?.subscribeToGuestRsvpOperations;
    if (typeof subscribe !== 'function') {
        rsvpOperationsLoadState = 'error';
        return;
    }

    rsvpOperationsLoadState = 'loading';
    rsvpOperationsSubscriptionCleanup = subscribe(
        deps.eventContext.eventId,
        (documents) => {
            const index = indexRsvpOperationalDocuments(documents);
            rsvpStatesByGuestId = index.statesByGuestId;
            rsvpConflictGuestIds = index.conflictGuestIds;
            rsvpOperationsLoadState = 'loaded';
            renderGuests(getEventData());
        },
        (error) => {
            console.error('[Event Controller] Error cargando estado RSVP:', error);
            const firstFailure = rsvpOperationsLoadState !== 'error';
            rsvpOperationsLoadState = 'error';
            rsvpStatesByGuestId.clear();
            rsvpConflictGuestIds.clear();
            renderGuests(getEventData());
            if (firstFailure) {
                deps.ui.showToast({
                    title: 'Estado RSVP no disponible',
                    message: 'La lista de invitados continúa disponible sin datos operativos RSVP.',
                    type: 'warning'
                });
            }
        }
    );
}

/** Mantiene la lista actualizada sin consultas adicionales desde la interfaz. */
function startGuestSubscription() {
    if (guestSubscriptionCleanup || typeof deps.services.guest?.subscribeToGuests !== 'function') return;

    guestSubscriptionCleanup = deps.services.guest.subscribeToGuests(
        deps.eventContext.eventId,
        (guests) => {
            replaceGuests(guests);
            guestLoadState = 'loaded';
            guestLoadError = null;
            renderGuestsAndStatistics();
        },
        (error) => {
            console.error('[Event Controller] Error realtime de invitados:', error);
            if (!hasGuestSnapshot) {
                guestLoadState = 'error';
                guestLoadError = error?.message || 'No fue posible mantener la lista sincronizada.';
                renderGuests(getEventData());
            }
        }
    );
}

/** Integra invitados recién creados o importados sin sustituir el snapshot vigente. */
function mergeGuests(guests) {
    guests.forEach((guest, index) => {
        if (isPlainObject(guest)) {
            guestsById.set(guest.id ?? `event-guest-${guestsById.size + index}`, guest);
        }
    });
}

function renderGuestSkeleton(container) {
    const skeleton = document.createElement('section');
    skeleton.className = 'guest-list-skeleton';
    skeleton.setAttribute('aria-label', 'Cargando invitados');

    for (let index = 0; index < 5; index += 1) {
        const row = document.createElement('div');
        row.className = 'guest-skeleton-row';
        for (let column = 0; column < 6; column += 1) {
            const block = document.createElement('span');
            block.className = 'guest-skeleton-block';
            row.appendChild(block);
        }
        skeleton.appendChild(row);
    }

    container.replaceChildren(skeleton);
}

function renderGuestLoadError(container) {
    const state = createGuestListState(
        'No fue posible cargar los invitados',
        'La lista no pudo obtenerse desde Firestore. Inténtalo nuevamente.',
        'Reintentar',
        () => {
            guestLoadState = 'idle';
            ensureGuestsLoaded();
        }
    );
    container.replaceChildren(state);
}

function renderGuestNoResults(container) {
    const state = createGuestListState(
        'No hay coincidencias',
        'Prueba con otro texto de búsqueda o ajusta los filtros activos.',
        'Limpiar filtros',
        clearGuestFilters
    );
    container.replaceChildren(state);
}

function createGuestListState(title, description, actionLabel, onAction) {
    const state = document.createElement('section');
    state.className = 'guest-list-state';
    const heading = document.createElement('h3');
    const copy = document.createElement('p');
    const action = document.createElement('button');

    heading.textContent = title;
    copy.textContent = description;
    action.type = 'button';
    action.className = 'btn-secondary';
    action.textContent = actionLabel;
    action.addEventListener('click', onAction);
    state.append(heading, copy, action);
    return state;
}

function renderGuestCollection(container, guests) {
    const visibleGuests = guests.slice(0, guestVisibleLimit);
    const fragment = document.createDocumentFragment();
    fragment.append(createGuestTable(visibleGuests));
    fragment.append(createGuestCards(visibleGuests));

    if (visibleGuests.length < guests.length) {
        const moreButton = document.createElement('button');
        moreButton.type = 'button';
        moreButton.className = 'btn-secondary guest-load-more';
        moreButton.textContent = `Mostrar más invitados (${guests.length - visibleGuests.length})`;
        moreButton.addEventListener('click', () => {
            guestVisibleLimit += 50;
            renderGuests(getEventData());
        });
        fragment.append(moreButton);
    }

    container.replaceChildren(fragment);
}

function createGuestTable(guests) {
    const wrapper = document.createElement('div');
    wrapper.className = 'guest-table-wrapper';
    const table = document.createElement('table');
    table.className = 'guest-table';
    table.setAttribute('aria-label', 'Lista de invitados');
    const headers = ['Invitado', 'Contacto', 'Pases', 'Estado', 'RSVP', 'Mesa', 'Código', 'Llegada', 'Acciones'];
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach((label) => {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = label;
        headerRow.appendChild(cell);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    guests.forEach((guest) => tbody.appendChild(createGuestTableRow(guest)));
    table.append(thead, tbody);
    wrapper.appendChild(table);
    return wrapper;
}

function createGuestTableRow(guest) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const name = document.createElement('strong');
    const date = document.createElement('small');
    name.textContent = getGuestName(guest);
    date.textContent = formatGuestDate(guest.fechaCreacion);
    nameCell.append(name, date);

    const contactCell = document.createElement('td');
    const email = document.createElement('span');
    const phone = document.createElement('small');
    email.textContent = getDisplayValue(guest.correo ?? guest.email, '—');
    phone.textContent = getDisplayValue(guest.telefono ?? guest.tel ?? guest.phone, '—');
    contactCell.append(email, phone);

    const passesCell = document.createElement('td');
    passesCell.textContent = formatNumber(getGuestPasses(guest));

    const statusCell = document.createElement('td');
    statusCell.appendChild(createGuestStatusBadge(guest));

    const rsvpCell = document.createElement('td');
    rsvpCell.appendChild(createGuestRsvpSummary(guest));

    const tableCell = document.createElement('td');
    tableCell.textContent = getGuestTable(guest) || 'Sin mesa';

    const codeCell = document.createElement('td');
    codeCell.className = 'guest-code-cell';
    codeCell.textContent = getGuestCode(guest) || '—';

    const arrivalCell = document.createElement('td');
    arrivalCell.textContent = hasGuestArrival(guest) ? 'Registrada' : 'Pendiente';

    const actionsCell = document.createElement('td');
    actionsCell.className = 'guest-actions-cell';
    actionsCell.append(
        createGuestActionButton('view', 'Ver', guest),
        createGuestActionButton('edit', 'Editar', guest),
        createGuestActionButton('delete', 'Eliminar', guest, true)
    );

    row.append(nameCell, contactCell, passesCell, statusCell, rsvpCell, tableCell, codeCell, arrivalCell, actionsCell);
    return row;
}

function createGuestCards(guests) {
    const list = document.createElement('div');
    list.className = 'guest-cards';
    guests.forEach((guest) => {
        const card = document.createElement('article');
        card.className = 'guest-card';
        const header = document.createElement('header');
        const title = document.createElement('h3');
        title.textContent = getGuestName(guest);
        header.append(title, createGuestStatusBadge(guest));

        const details = document.createElement('dl');
        appendGuestCardDetail(details, 'Correo', getDisplayValue(guest.correo ?? guest.email, '—'));
        appendGuestCardDetail(details, 'Teléfono', getDisplayValue(guest.telefono ?? guest.tel ?? guest.phone, '—'));
        appendGuestCardDetail(details, 'Pases', formatNumber(getGuestPasses(guest)));
        appendGuestCardRsvpDetail(details, guest);
        appendGuestCardDetail(details, 'Mesa', getGuestTable(guest) || 'Sin mesa');
        appendGuestCardDetail(details, 'Código', getGuestCode(guest) || '—');
        appendGuestCardDetail(details, 'Llegada', hasGuestArrival(guest) ? 'Registrada' : 'Pendiente');

        const actions = document.createElement('footer');
        actions.className = 'guest-card-actions';
        actions.append(
            createGuestActionButton('view', 'Ver', guest),
            createGuestActionButton('edit', 'Editar', guest),
            createGuestActionButton('delete', 'Eliminar', guest, true)
        );
        card.append(header, details, actions);
        list.appendChild(card);
    });
    return list;
}

function appendGuestCardRsvpDetail(list, guest) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = 'RSVP';
    detail.appendChild(createGuestRsvpSummary(guest));
    row.append(term, detail);
    list.appendChild(row);
}

function createGuestRsvpSummary(guest) {
    const guestId = String(guest?.id ?? '');
    return createGuestRsvpOperationalElement(
        document,
        rsvpStatesByGuestId.get(guestId) ?? null,
        {
            hasConflict: rsvpConflictGuestIds.has(guestId),
            availability: rsvpOperationsLoadState
        }
    );
}

function appendGuestCardDetail(list, label, value) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    list.appendChild(row);
}

function createGuestStatusBadge(guest) {
    const status = getGuestStatus(guest);
    const badge = document.createElement('span');
    badge.className = `guest-status guest-status--${status}`;
    badge.textContent = getGuestStatusLabel(status);
    return badge;
}

function createGuestActionButton(action, label, guest, isDanger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `guest-action${isDanger ? ' guest-action--danger' : ''}`;
    button.dataset.guestAction = action;
    button.dataset.guestId = String(guest.id || '');
    button.textContent = label;
    button.setAttribute('aria-label', `${label}: ${getGuestName(guest)}`);
    return button;
}

function getFilteredGuests(guests) {
    const search = normalizeText(guestFilters.search).replace(/\s+/g, '');
    const filtered = guests.filter((guest) => {
        const statusMatches = guestFilters.status === 'all' || getGuestStatus(guest) === guestFilters.status;
        if (!statusMatches) return false;

        const table = getGuestTable(guest);
        const tableMatches = guestFilters.table === 'all'
            || (guestFilters.table === 'without' && !table)
            || (guestFilters.table === 'with' && Boolean(table))
            || (guestFilters.table.startsWith('table:') && normalizeText(table) === guestFilters.table.slice(6));
        if (!tableMatches) return false;

        if (!search) return true;
        const searchable = [getGuestName(guest), guest.correo, guest.email, guest.telefono, guest.tel, guest.phone, getGuestCode(guest)]
            .map((value) => normalizeText(value).replace(/\s+/g, ''))
            .join('|');
        return searchable.includes(search);
    });

    return filtered.sort(compareGuestsBySelectedOrder);
}

function compareGuestsBySelectedOrder(left, right) {
    const nameComparison = getGuestName(left).localeCompare(getGuestName(right), 'es', { sensitivity: 'base', numeric: true });
    switch (guestFilters.sort) {
        case 'name-desc': return -nameComparison;
        case 'date-desc': return getGuestTimestamp(right) - getGuestTimestamp(left) || nameComparison;
        case 'date-asc': return getGuestTimestamp(left) - getGuestTimestamp(right) || nameComparison;
        case 'status': return getGuestStatusRank(left) - getGuestStatusRank(right) || nameComparison;
        case 'table': return (getGuestTable(left) || 'zzzz').localeCompare(getGuestTable(right) || 'zzzz', 'es', { sensitivity: 'base', numeric: true }) || nameComparison;
        case 'name-asc':
        default: return nameComparison;
    }
}

function syncGuestTableFilter(guests) {
    const select = getElement('guest-filter-table');
    if (!select) return;

    const previousValue = guestFilters.table;
    Array.from(select.querySelectorAll('[data-guest-table-option]')).forEach((option) => option.remove());
    const tables = [...new Map(guests
        .map(getGuestTable)
        .filter(Boolean)
        .map((table) => [normalizeText(table), table])).values()]
        .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base', numeric: true }));

    tables.forEach((table) => {
        const option = document.createElement('option');
        option.value = `table:${normalizeText(table)}`;
        option.textContent = `Mesa: ${table}`;
        option.dataset.guestTableOption = 'true';
        select.appendChild(option);
    });

    const hasPreviousValue = Array.from(select.options).some((option) => option.value === previousValue);
    guestFilters.table = hasPreviousValue ? previousValue : 'all';
    select.value = guestFilters.table;
}

function handleGuestSearchInput(event) {
    const value = event.target?.value || '';
    if (guestSearchTimer) window.clearTimeout(guestSearchTimer);
    guestSearchTimer = window.setTimeout(() => {
        guestFilters.search = value;
        guestVisibleLimit = 50;
        renderGuests(getEventData());
    }, 160);
}

function handleGuestFilterChange() {
    guestFilters.status = getElement('guest-filter-status')?.value || 'all';
    guestFilters.table = getElement('guest-filter-table')?.value || 'all';
    guestFilters.sort = getElement('guest-sort')?.value || 'name-asc';
    guestVisibleLimit = 50;
    renderGuests(getEventData());
}

function clearGuestFilters() {
    guestFilters = { search: '', status: 'all', table: 'all', sort: 'name-asc' };
    guestVisibleLimit = 50;
    setInputValue('guest-search', '');
    setSelectValue('guest-filter-status', 'all', 'all');
    setSelectValue('guest-filter-table', 'all', 'all');
    setSelectValue('guest-sort', 'name-asc', 'name-asc');
    renderGuests(getEventData());
}

function handleGuestListAction(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-guest-action]') : null;
    if (!button) return;

    event.preventDefault();
    const guest = guestsById.get(button.dataset.guestId);
    if (!guest) return;

    if (button.dataset.guestAction === 'view') {
        openGuestModal('view', guest);
    } else if (button.dataset.guestAction === 'edit') {
        openGuestModal('edit', guest);
    } else if (button.dataset.guestAction === 'delete') {
        deleteGuestWithConfirmation(guest, button);
    }
}

function openGuestModal(mode, guest = null) {
    activeGuestMode = mode;
    const form = getElement('form-guest');
    const saveButton = getElement('btn-submit-guest');
    const title = getElement('modal-guest-title');

    form?.reset();
    setInputValue('g-doc-id', guest?.id || '');
    setInputValue('g-nombre', guest?.nombre ?? guest?.name);
    setInputValue('g-telefono', guest?.telefono ?? guest?.tel ?? guest?.phone);
    setInputValue('g-correo', guest?.correo ?? guest?.email);
    setInputValue('g-pases', guest ? getGuestPasses(guest) : 1);
    setInputValue('g-mesa', getGuestTable(guest));
    setSelectValue('g-estado', getGuestStatus(guest), 'pendiente');
    setSelectValue('g-acceso', guest?.tipoAcceso, 'ambos');
    setInputValue('g-notas', guest?.notas ?? guest?.comentarios ?? guest?.observaciones);

    const isView = mode === 'view';
    if (title) title.textContent = isView ? 'Detalle del invitado' : mode === 'edit' ? 'Editar invitado' : 'Agregar invitado';
    setGuestFormReadOnly(isView);
    if (saveButton) {
        saveButton.hidden = isView;
        saveButton.dataset.idleLabel = mode === 'edit' ? 'Guardar cambios' : 'Guardar invitado';
        setGuestSaveButtonBusy(false);
    }

    openModal('modal-guest');
    if (!isView) window.setTimeout(() => getElement('g-nombre')?.focus(), 0);
}

function closeGuestModal() {
    closeModal('modal-guest');
    activeGuestMode = 'create';
    setGuestFormReadOnly(false);
}

function handleGuestOverlayClick(event) {
    if (event.target === getElement('modal-guest')) closeGuestModal();
}

function setGuestFormReadOnly(isReadOnly) {
    const form = getElement('form-guest');
    if (!form) return;
    Array.from(form.elements).forEach((field) => {
        if (field.id !== 'g-doc-id') field.disabled = isReadOnly;
    });
}

async function handleGuestFormSubmit(event) {
    event.preventDefault();
    if (activeGuestMode === 'view') return;

    const payload = getGuestFormPayload();
    if (!payload) return;

    const eventId = deps.eventContext.eventId;
    const guestId = getFieldValue('g-doc-id');
    const isEditing = Boolean(guestId);
    if (!eventId || typeof deps.services.guest?.[isEditing ? 'updateGuest' : 'createGuest'] !== 'function') {
        deps.ui.showError({
            title: 'No se puede guardar el invitado',
            description: 'El servicio de invitados no está disponible para esta vista.',
            code: 'ERR_GUEST_SERVICE_UNAVAILABLE'
        });
        return;
    }

    let canonicalPayload;
    try {
        canonicalPayload = deps.services.guest.normalizeGuestData(payload, { requireName: true, strict: true });
    } catch (error) {
        console.error('[Event Controller] Datos de invitado no vÃ¡lidos:', error);
        deps.ui.showToast({ title: 'Revisa el formulario', message: 'Los datos del invitado no cumplen el formato requerido.', type: 'warning' });
        return;
    }

    setGuestSaveButtonBusy(true);
    try {
        if (isEditing) {
            await deps.services.guest.updateGuest(eventId, guestId, canonicalPayload);
            const previous = guestsById.get(guestId) || {};
            const guest = { ...previous, ...canonicalPayload, id: guestId, fechaActualizacion: new Date().toISOString() };
            deps.eventBus.emit(EVENT_TYPES.GUEST_UPDATED, { eventId, guest, timestamp: Date.now() });
            deps.ui.showToast({ title: 'Invitado actualizado', message: 'Los cambios se guardaron correctamente.', type: 'success' });
        } else {
            const id = await deps.services.guest.createGuest(eventId, canonicalPayload);
            const now = new Date().toISOString();
            const guest = { ...canonicalPayload, id, fechaCreacion: now, fechaActualizacion: now };
            deps.eventBus.emit(EVENT_TYPES.GUEST_CREATED, { eventId, guest, timestamp: Date.now() });
            deps.ui.showToast({ title: 'Invitado agregado', message: 'El invitado se agregó correctamente.', type: 'success' });
        }
        guestLoadState = 'loaded';
        closeGuestModal();
    } catch (error) {
        console.error('[Event Controller] Error guardando invitado:', error);
        if (String(error?.code || error?.message || '').includes('guest/passes-below-used')) {
            deps.ui.showToast({
                title: 'No se pueden reducir los pases',
                message: 'El total no puede quedar por debajo de los pases que ya registraron entrada.',
                type: 'warning'
            });
            return;
        }
        deps.ui.showError({
            title: 'No se pudo guardar el invitado',
            description: 'Verifica los datos y tu conexión antes de intentarlo de nuevo.',
            code: isEditing ? 'ERR_GUEST_UPDATE' : 'ERR_GUEST_CREATE'
        });
    } finally {
        setGuestSaveButtonBusy(false);
    }
}

async function deleteGuestWithConfirmation(guest, trigger) {
    if (!guest?.id || typeof deps.services.guest?.deleteGuest !== 'function') return;

    const confirmed = await deps.ui.confirm({
        title: '¿Eliminar invitado?',
        message: `Eliminarás a ${getGuestName(guest)}. Esta acción no se puede deshacer.`,
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
        isDanger: true
    });
    if (!confirmed) return;

    setButtonBusy(trigger, true);
    try {
        await deps.services.guest.deleteGuest(deps.eventContext.eventId, guest.id);
        deps.eventBus.emit(EVENT_TYPES.GUEST_DELETED, { eventId: deps.eventContext.eventId, guest, guestId: guest.id, timestamp: Date.now() });
        deps.ui.showToast({ title: 'Invitado eliminado', message: 'El invitado se eliminó correctamente.', type: 'success' });
    } catch (error) {
        console.error('[Event Controller] Error eliminando invitado:', error);
        deps.ui.showError({
            title: 'No se pudo eliminar el invitado',
            description: 'Verifica tu conexión e inténtalo nuevamente.',
            code: 'ERR_GUEST_DELETE'
        });
    } finally {
        setButtonBusy(trigger, false);
    }
}

function getGuestFormPayload() {
    const nombre = cleanGuestText(getFieldValue('g-nombre'), 160);
    const correo = cleanGuestText(getFieldValue('g-correo'), 160).toLowerCase();
    const telefono = sanitizeGuestPhone(getFieldValue('g-telefono'));
    const pasesRaw = getFieldValue('g-pases');
    const pases = Number(pasesRaw);
    const selectedStatus = getFieldValue('g-estado');
    const estado = ({
        pendiente: 'Pendiente',
        confirmado: 'Confirmado',
        no_asistira: 'No asistirá',
        llego: 'Llegó'
    })[selectedStatus] ?? selectedStatus;
    const mesa = cleanGuestText(getFieldValue('g-mesa'), 80);
    const notas = cleanGuestText(getFieldValue('g-notas'), 1000);
    const tipoAcceso = cleanGuestText(getFieldValue('g-acceso'), 80) || 'Ambos';

    if (!nombre) return showGuestValidationError('El nombre del invitado es obligatorio.', 'g-nombre');
    if (correo && !isValidGuestEmail(correo)) return showGuestValidationError('Ingresa un correo electrónico válido.', 'g-correo');
    if (telefono && !isValidGuestPhone(telefono)) return showGuestValidationError('Ingresa un teléfono válido.', 'g-telefono');
    if (!Number.isInteger(pases) || pases < 1 || pases > 999) return showGuestValidationError('Los pases deben ser un número entero entre 1 y 999.', 'g-pases');
    if (!['Pendiente', 'Confirmado', 'No asistirá', 'Llegó'].includes(estado)) return showGuestValidationError('Selecciona un estado de asistencia válido.', 'g-estado');

    return { nombre, correo, telefono, pases, estado, mesa, notas, tipoAcceso };
}

function showGuestValidationError(message, fieldId) {
    const field = getElement(fieldId);
    field?.focus();
    deps.ui.showToast({ title: 'Revisa el formulario', message, type: 'warning' });
    return null;
}

function cleanGuestText(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeGuestPhone(value) {
    const text = String(value || '').trim();
    const digits = text.replace(/\D/g, '');
    if (!digits) return '';
    return `${text.startsWith('+') ? '+' : ''}${digits}`;
}

function isValidGuestEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidGuestPhone(value) {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
}

function setGuestSaveButtonBusy(isBusy) {
    const button = getElement('btn-submit-guest');
    if (!button) return;
    setButtonBusy(button, isBusy);
    const label = button.querySelector('.btn-text');
    const loader = button.querySelector('.btn-loader');
    if (label) label.textContent = isBusy ? 'Guardando...' : (button.dataset.idleLabel || 'Guardar');
    if (loader) loader.style.display = isBusy ? 'block' : 'none';
}

function getGuestName(guest) {
    return getDisplayValue(guest?.nombre ?? guest?.name, 'Invitado sin nombre');
}

function getGuestTable(guest) {
    return cleanGuestText(guest?.mesa ?? guest?.table, 80);
}

function getGuestCode(guest) {
    return cleanGuestText(guest?.codigoInvitado ?? guest?.codigo ?? guest?.codigoInvitacion ?? guest?.folio ?? guest?.token ?? guest?.code, 160);
}

function hasGuestArrival(guest) {
    return getGuestStatus(guest) === 'llego';
}

function getGuestStatusLabel(status) {
    if (status === 'confirmado') return 'Confirmado';
    if (status === 'no_asistira') return 'No asistirá';
    if (status === 'llego') return 'Llegó';
    if (status === 'confirmed') return 'Confirmado';
    if (status === 'no-attendance') return 'No asistirá';
    if (status === 'arrived') return 'Llegó';
    return 'Pendiente';
}

function getGuestStatusRank(guest) {
    return ({ confirmado: 1, pendiente: 2, no_asistira: 3, llego: 4 })[getGuestStatus(guest)] || 5;
}

function getGuestTimestamp(guest) {
    const date = toDate(guest?.fechaCreacion ?? guest?.createdAt);
    return date ? date.getTime() : 0;
}

function formatGuestDate(value) {
    const date = toDate(value);
    return date ? new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : 'Sin fecha';
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

    setText('conf-estado', formatEventStatus(eventData).label);
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
    subscribeToEvent(EVENT_TYPES.EVENT_STATS_UPDATED, handleEventStatsUpdated);
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
    }

    render();
}

function handleEventStatsUpdated(payload) {
    if (!isCurrentEventPayload(payload) || !isPlainObject(payload?.stats)) return;
    deps.state.updateState('event.stats', payload.stats);
    renderGuestsAndStatistics();
}

/**
 * Incorpora un invitado creado que haya sido publicado a través del Event Bus.
 * @param {Object} payload - Carga con el invitado creado o sus estadísticas.
 * @returns {void}
 */
function handleGuestCreated(payload) {
    if (!isCurrentEventPayload(payload)) return;

    registerGuestFromPayload(payload);
    publishStatsFromGuests();
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
        guestsById.set(guest.id, guest);
    } else if (guest?.id && hasGuestSnapshot) {
        guestsById.set(guest.id, guest);
    }

    publishStatsFromGuests();
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
        guestsById.delete(guestId);
    }

    publishStatsFromGuests();
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
        mergeGuests(payload.guests);
    }

    publishStatsFromGuests();
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
    listen(getElement('btn-close-edit-event'), 'click', closeEventEditModal);
    listen(getElement('btn-cancel-edit-event'), 'click', closeEventEditModal);
    listen(getElement('form-edit-event'), 'submit', handleEditEventSubmit);
    listen(getElement('modal-edit-event'), 'click', handleEventEditOverlayClick);
    listen(getElement('btn-delete-event'), 'click', handleDeleteEventClick);
    listen(getElement('btn-cancel-delete-event'), 'click', closeEventDeleteModal);
    listen(getElement('btn-confirm-delete-event'), 'click', handleDeleteEventConfirm);
    listen(getElement('modal-delete-event'), 'click', handleEventDeleteOverlayClick);
    listen(getElement('btn-open-add-guest'), 'click', () => openGuestModal('create'));
    listen(getElement('btn-empty-add-guest'), 'click', () => openGuestModal('create'));
    listen(getElement('btn-close-modal-guest'), 'click', closeGuestModal);
    listen(getElement('btn-cancel-modal-guest'), 'click', closeGuestModal);
    listen(getElement('modal-guest'), 'click', handleGuestOverlayClick);
    listen(getElement('form-guest'), 'submit', handleGuestFormSubmit);
    listen(getElement('guests-list'), 'click', handleGuestListAction);
    listen(getElement('guest-search'), 'input', handleGuestSearchInput);
    listen(getElement('guest-filter-status'), 'change', handleGuestFilterChange);
    listen(getElement('guest-filter-table'), 'change', handleGuestFilterChange);
    listen(getElement('guest-sort'), 'change', handleGuestFilterChange);
    listen(document, 'keydown', handleModalEscape);
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
    populateEventEditForm(getEventData());
    openModal('modal-edit-event');
}

/**
 * Completa el formulario de edición con los datos actuales del evento.
 * @param {Object} eventData - Datos activos del evento.
 * @returns {void}
 */
function populateEventEditForm(eventData) {
    setInputValue('edit-event-name', eventData.nombreEvento ?? eventData.nombre);
    setInputValue('edit-event-date', toDateInputValue(eventData.fecha));
    setInputValue('edit-event-time', toTimeInputValue(eventData.hora));
    setInputValue('edit-event-city', eventData.ciudad);
    setInputValue('edit-event-region', eventData.estado);
    setSelectValue('edit-event-type', eventData.tipoEvento, 'Otro');
    setSelectValue('edit-event-status', eventData.estadoEvento, 'Borrador');
    setInputValue('edit-event-description', eventData.descripcion);
}

/**
 * Guarda el formulario de edición mediante el servicio de eventos inyectado.
 * @param {SubmitEvent} event - Evento de envío del formulario.
 * @returns {Promise<void>}
 */
async function handleEditEventSubmit(event) {
    event.preventDefault();

    const form = getElement('form-edit-event');
    const saveButton = getElement('btn-save-edit-event');
    const eventId = deps.eventContext.eventId;

    if (!form?.checkValidity()) {
        form?.reportValidity();
        return;
    }

    if (!eventId || typeof deps.services.event?.updateEvent !== 'function') {
        deps.ui.showError({
            title: 'No se puede guardar',
            description: 'El servicio de eventos no está disponible para esta vista.',
            code: 'ERR_EVENT_SERVICE_UNAVAILABLE'
        });
        return;
    }

    const payload = getEventEditPayload();
    setButtonBusy(saveButton, true);
    deps.ui.showLoader({ text: 'Guardando información del evento...' });

    try {
        await deps.services.event.updateEvent(eventId, payload);
        eventDataOverride = { ...getEventData(), ...payload };
        render();
        closeEventEditModal();

        deps.eventBus.emit(EVENT_TYPES.EVENT_UPDATED, {
            eventId,
            eventData: eventDataOverride,
            timestamp: Date.now()
        });

        deps.ui.showToast({
            title: 'Información actualizada',
            message: 'Los cambios del evento se guardaron correctamente.',
            type: 'success'
        });
    } catch (error) {
        console.error('[Event Controller] Error al guardar el evento:', error);
        deps.ui.showError({
            title: 'No se pudieron guardar los cambios',
            description: 'Verifica tu conexión e inténtalo nuevamente.',
            code: 'ERR_EVENT_UPDATE'
        });
    } finally {
        deps.ui.hideLoader();
        setButtonBusy(saveButton, false);
    }
}

/**
 * Abre la confirmación visual antes de eliminar el evento activo.
 * @param {MouseEvent} event - Evento de clic del botón de peligro.
 * @returns {void}
 */
function handleDeleteEventClick(event) {
    event.preventDefault();
    setText('delete-event-name', getEventName(getEventData()));
    openModal('modal-delete-event');
}

/**
 * Elimina el evento después de una confirmación explícita del usuario.
 * @returns {Promise<void>}
 */
async function handleDeleteEventConfirm() {
    const eventId = deps.eventContext.eventId;
    const confirmButton = getElement('btn-confirm-delete-event');

    if (!eventId || typeof deps.services.event?.deleteEvent !== 'function') {
        deps.ui.showError({
            title: 'No se puede eliminar',
            description: 'El servicio de eventos no está disponible para esta vista.',
            code: 'ERR_EVENT_SERVICE_UNAVAILABLE'
        });
        return;
    }

    setButtonBusy(confirmButton, true);
    deps.ui.showLoader({ text: 'Eliminando evento...' });

    try {
        await deps.services.event.deleteEvent(eventId);
        deps.eventBus.emit(EVENT_TYPES.EVENT_DELETED, { eventId, timestamp: Date.now() });
        closeEventDeleteModal();
        deps.ui.showToast({
            title: 'Evento eliminado',
            message: 'El evento se eliminó correctamente.',
            type: 'success'
        });
        document.location.assign('./dashboard.html');
    } catch (error) {
        console.error('[Event Controller] Error al eliminar el evento:', error);
        deps.ui.showError({
            title: 'No se pudo eliminar el evento',
            description: 'Verifica tu conexión e inténtalo nuevamente.',
            code: 'ERR_EVENT_DELETE'
        });
    } finally {
        deps.ui.hideLoader();
        setButtonBusy(confirmButton, false);
    }
}

/**
 * Cierra el modal de edición al hacer clic fuera de su cuadro.
 * @param {MouseEvent} event - Evento de clic sobre la superposición.
 * @returns {void}
 */
function handleEventEditOverlayClick(event) {
    if (event.target === getElement('modal-edit-event')) {
        closeEventEditModal();
    }
}

/**
 * Cierra el modal de eliminación al hacer clic fuera de su cuadro.
 * @param {MouseEvent} event - Evento de clic sobre la superposición.
 * @returns {void}
 */
function handleEventDeleteOverlayClick(event) {
    if (event.target === getElement('modal-delete-event')) {
        closeEventDeleteModal();
    }
}

/**
 * Cierra cualquier modal propio abierto mediante la tecla Escape.
 * @param {KeyboardEvent} event - Evento de teclado global.
 * @returns {void}
 */
function handleModalEscape(event) {
    if (event.key !== 'Escape') return;
    closeEventEditModal();
    closeEventDeleteModal();
    closeGuestModal();
}

/**
 * Abre un modal propio del controlador y bloquea el desplazamiento de fondo.
 * @param {string} modalId - ID del modal detectado en event.html.
 * @returns {void}
 */
function openModal(modalId) {
    const modal = getElement(modalId);
    if (!modal) return;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

/**
 * Cierra el modal de edición del evento.
 * @returns {void}
 */
function closeEventEditModal() {
    closeModal('modal-edit-event');
}

/**
 * Cierra el modal de confirmación de eliminación.
 * @returns {void}
 */
function closeEventDeleteModal() {
    closeModal('modal-delete-event');
}

/**
 * Cierra un modal propio sin afectar los modales de otros módulos.
 * @param {string} modalId - ID del modal a cerrar.
 * @returns {void}
 */
function closeModal(modalId) {
    const modal = getElement(modalId);
    if (!modal) return;

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');

    const hasOpenControllerModal = ['modal-edit-event', 'modal-delete-event', 'modal-guest']
        .some((id) => getElement(id)?.classList.contains('active'));
    if (!hasOpenControllerModal) {
        document.body.classList.remove('modal-open');
    }
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

    if (target === 'invitados') {
        ensureGuestsLoaded();
    }
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
 * Asigna un valor seguro a un campo de formulario existente.
 * @param {string} id - ID detectado del campo.
 * @param {*} value - Valor a asignar.
 * @returns {void}
 */
function setInputValue(id, value) {
    const field = getElement(id);
    if (field && 'value' in field) {
        field.value = value ?? '';
    }
}

/**
 * Asigna un valor a un select y utiliza un fallback cuando no existe una opción compatible.
 * @param {string} id - ID detectado del select.
 * @param {*} value - Valor preferido.
 * @param {string} fallback - Valor alternativo disponible en el select.
 * @returns {void}
 */
function setSelectValue(id, value, fallback) {
    const field = getElement(id);
    if (!field || !('value' in field)) return;

    const desiredValue = getDisplayValue(value, fallback);
    const hasOption = Array.from(field.options ?? []).some((option) => option.value === desiredValue);
    field.value = hasOption ? desiredValue : fallback;
}

/**
 * Obtiene el valor depurado de un campo de formulario.
 * @param {string} id - ID detectado del campo.
 * @returns {string} Valor sin espacios laterales.
 */
function getFieldValue(id) {
    const field = getElement(id);
    return field && 'value' in field ? String(field.value).trim() : '';
}

/**
 * Construye el payload soportado por eventService.updateEvent().
 * @returns {Object} Campos editables del evento.
 */
function getEventEditPayload() {
    return {
        nombreEvento: getFieldValue('edit-event-name'),
        fecha: getFieldValue('edit-event-date'),
        hora: getFieldValue('edit-event-time'),
        ciudad: getFieldValue('edit-event-city'),
        estado: getFieldValue('edit-event-region'),
        tipoEvento: getFieldValue('edit-event-type'),
        descripcion: getFieldValue('edit-event-description'),
        estadoEvento: getFieldValue('edit-event-status')
    };
}

/**
 * Activa o desactiva el estado de espera visual de un botón existente.
 * @param {HTMLElement|null} button - Botón a actualizar.
 * @param {boolean} isBusy - Estado de operación asíncrona.
 * @returns {void}
 */
function setButtonBusy(button, isBusy) {
    if (!button) return;
    button.disabled = isBusy;
    button.setAttribute('aria-busy', String(isBusy));
}

/**
 * Convierte una fecha almacenada al formato requerido por un input date.
 * @param {*} value - Fecha de origen.
 * @returns {string} Fecha en formato YYYY-MM-DD.
 */
function toDateInputValue(value) {
    const date = toDate(value);
    if (!date) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Convierte una hora almacenada al formato requerido por un input time.
 * @param {*} value - Hora de origen.
 * @returns {string} Hora en formato HH:mm.
 */
function toTimeInputValue(value) {
    if (typeof value !== 'string') return '';
    const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return '';

    return `${match[1].padStart(2, '0')}:${match[2]}`;
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
function formatEventStatus(eventData) {
    return getEventStatusPresentation(eventData);
}

/**
 * Adapta el contrato canónico guardado en State al modelo visual existente.
 * @param {Object} eventData - Datos del evento.
 * @returns {{ total: number, confirmed: number, noAttendance: number, arrivals: number, pending: number }} Estadísticas seguras.
 */
function getStatistics(eventData) {
    const stats = deps.state.getState('event.stats');
    if (!isPlainObject(stats)) return createEmptyStats();
    const viewModel = deps.services.stats.toEventStatsViewModel(stats);
    return viewModel ? normalizeStatistics(viewModel) : createEmptyStats();
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
    }
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
    publishStatsFromGuests();
}

/** Publica el cálculo canónico de un snapshot completo de invitados. */
function publishStatsFromGuests() {
    if (!hasGuestSnapshot || typeof deps.services.stats?.calculateEventStats !== 'function') return;
    const stats = deps.services.stats.calculateEventStats(Array.from(guestsById.values()));
    deps.state.updateState('event.stats', stats);
    deps.eventBus.emit(EVENT_TYPES.EVENT_STATS_UPDATED, {
        eventId: deps.eventContext.eventId,
        stats,
        source: 'guest-snapshot',
        timestamp: Date.now()
    });
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
 * @returns {'pendiente'|'confirmado'|'no_asistira'|'llego'} Estado canÃ³nico.
 */
function getGuestStatus(guest) {
    if (Boolean(guest?.llegadaRegistrada || guest?.llego || guest?.checkIn || guest?.horaLlegada)) return 'llego';

    const status = normalizeText(guest?.estado ?? guest?.status);
    if (status.includes('llego')) return 'llego';
    if (status.includes('confirm')) return 'confirmado';
    if (status.includes('no asist')) return 'no_asistira';
    if (guest?.confirmado === true || guest?.asistenciaConfirmada === true) return 'confirmado';
    return 'pendiente';
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
    cleanups.forEach((cleanup) => cleanup());
}
