import { USER_ROLES } from '../../core/roles.js';
import { getGuestQrAvailability } from '../../../shared/qr-code.js';
import { generateQrCanvas } from './qr-renderer.js';
import { buildQrZip, downloadGuestQrPng, downloadQrZip } from './qr-download.js';

let context = null;
let guests = [];
let guestById = new Map();
let observer = null;
let zipController = null;
let loaded = false;
let generated = new Set();
let cleanups = [];
let sessionCleanups = [];

export function initQrManager(container) {
    destroyQrManager();
    context = container;
    const tab = document.querySelector('.tab-btn[data-target="qr"]');
    const panel = document.getElementById('tab-qr');
    if (!tab || !panel) return;

    const isCeo = container?.eventContext?.roleContext?.role === USER_ROLES.CEO
        && container?.eventContext?.roleContext?.source === 'custom-claim';
    if (!isCeo) {
        tab.hidden = true;
        renderRestricted(panel);
        if (location.hash === '#qr') activatePanel(tab, panel);
        return;
    }

    tab.hidden = false;
    bind(tab, 'click', () => ensureLoaded());
    bind(document.querySelector('.tabs-nav'), 'click', (event) => {
        const nextTab = event.target.closest('.tab-btn[data-target]');
        if (nextTab && nextTab.dataset.target !== 'qr') releaseQrSession();
    });

    if (location.hash === '#qr') {
        activatePanel(tab, panel);
        ensureLoaded();
    }
}

export function destroyQrManager() {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    releaseQrSession();
    generated.clear();
    loaded = false;
    context = null;
}

function releaseQrSession() {
    sessionCleanups.forEach((cleanup) => cleanup());
    sessionCleanups = [];
    observer?.disconnect();
    observer = null;
    zipController?.abort();
    zipController = null;
    if (document.querySelector('#ui-active-modal .qr-modal-content')) {
        context?.ui?.hideModal();
    }
    clearCanvases();
    guests = [];
    guestById.clear();
    loaded = false;
    document.getElementById('qr-list')?.replaceChildren();
    document.getElementById('qr-card-list')?.replaceChildren();
    setState('idle', 'Abre la pestaña para cargar los códigos autorizados.');
}

async function ensureLoaded() {
    if (loaded || !context) return;
    bindSessionControls();
    setState('loading', 'Cargando invitados autorizados...');
    try {
        guests = await context.services.guest.getQrGuests(context.eventContext.eventId);
        guestById = new Map(guests.map((guest) => [guest.id, guest]));
        loaded = true;
        populateTables();
        renderSummary();
        renderFiltered();
        setState(guests.length ? 'ready' : 'empty', guests.length ? '' : 'No hay invitados para mostrar.');
    } catch (error) {
        const denied = String(error?.message || error?.code).includes('permission-denied');
        setState(denied ? 'restricted' : 'error', denied
            ? 'Acceso restringido. Se requiere el custom claim CEO.'
            : 'No fue posible cargar los datos QR.');
        console.error('[Admin QR]', { code: error?.code || error?.message, message: error?.message });
    }
}

function bindSessionControls() {
    if (sessionCleanups.length) return;
    bindSession(document.getElementById('qr-search'), 'input', renderFiltered);
    bindSession(document.getElementById('qr-status-filter'), 'change', renderFiltered);
    bindSession(document.getElementById('qr-table-filter'), 'change', renderFiltered);
    bindSession(document.getElementById('qr-sort'), 'change', renderFiltered);
    bindSession(document.getElementById('qr-download-all'), 'click', handleDownloadAll);
    bindSession(document.getElementById('qr-cancel-download'), 'click', () => zipController?.abort());
    bindSession(document.getElementById('qr-list'), 'click', handleListAction);
    bindSession(document.getElementById('qr-card-list'), 'click', handleListAction);
}

function renderSummary() {
    const counts = { available: 0, disabled: 0, missing: 0 };
    guests.forEach((guest) => {
        const status = getGuestQrAvailability(guest).status;
        if (status === 'available') counts.available += 1;
        else if (status === 'disabled') counts.disabled += 1;
        else counts.missing += 1;
    });
    setText('qr-count-total', guests.length);
    setText('qr-count-available', counts.available);
    setText('qr-count-disabled', counts.disabled);
    setText('qr-count-missing', counts.missing);
    setText('qr-count-generated', generated.size);
}

function populateTables() {
    const select = document.getElementById('qr-table-filter');
    if (!select) return;
    const current = select.value;
    select.replaceChildren(new Option('Todas', 'all'));
    const tables = [...new Set(guests.map((guest) => guest.mesa).filter((value) => value !== null && value !== undefined && value !== ''))]
        .sort((left, right) => Number(left) - Number(right));
    tables.forEach((table) => select.appendChild(new Option(`Mesa ${table}`, String(table))));
    select.value = [...select.options].some((option) => option.value === current) ? current : 'all';
}

function renderFiltered() {
    if (!loaded) return;
    observer?.disconnect();
    clearCanvases();
    const filtered = filterGuests();
    renderTable(filtered);
    renderCards(filtered);
    observePreviews();
    document.getElementById('qr-empty')?.toggleAttribute('hidden', filtered.length > 0);
}

function filterGuests() {
    const needle = normalize(document.getElementById('qr-search')?.value);
    const statusFilter = document.getElementById('qr-status-filter')?.value || 'all';
    const tableFilter = document.getElementById('qr-table-filter')?.value || 'all';
    const sort = document.getElementById('qr-sort')?.value || 'code';
    const result = guests.filter((guest) => {
        const status = getGuestQrAvailability(guest).status;
        const normalizedStatus = status === 'unsupported' ? 'missing' : status;
        const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter;
        const matchesTable = tableFilter === 'all' || String(guest.mesa ?? '') === tableFilter;
        const matchesSearch = !needle || normalize(`${guest.nombre} ${guest.codigoInvitado}`).includes(needle);
        return matchesStatus && matchesTable && matchesSearch;
    });
    result.sort((left, right) => {
        if (sort === 'name') return String(left.nombre).localeCompare(String(right.nombre), 'es', { sensitivity: 'base' });
        if (sort === 'table') return Number(left.mesa ?? Number.MAX_SAFE_INTEGER) - Number(right.mesa ?? Number.MAX_SAFE_INTEGER);
        return String(left.codigoInvitado).localeCompare(String(right.codigoInvitado), 'en', { numeric: true });
    });
    return result;
}

function renderTable(items) {
    const body = document.getElementById('qr-list');
    if (!body) return;
    body.replaceChildren(...items.map((guest) => {
        const row = document.createElement('tr');
        appendCell(row, guest.nombre || 'Sin nombre');
        appendCell(row, guest.codigoInvitado || guest.id);
        appendCell(row, guest.mesa === null ? 'Sin mesa' : `Mesa ${guest.mesa}`);
        appendCell(row, `${guest.pases} pase(s)`);
        appendCell(row, accessLabel(guest.tipoAcceso));
        const previewCell = row.insertCell();
        previewCell.appendChild(createPreview(guest));
        const status = getGuestQrAvailability(guest);
        appendCell(row, statusLabel(status.status));
        const actions = row.insertCell();
        actions.appendChild(createDownloadButton(guest, status.available));
        return row;
    }));
}

function renderCards(items) {
    const container = document.getElementById('qr-card-list');
    if (!container) return;
    container.replaceChildren(...items.map((guest) => {
        const card = document.createElement('article');
        card.className = 'qr-guest-card';
        const title = document.createElement('h3');
        title.textContent = guest.nombre || 'Sin nombre';
        card.append(title, detail(guest.codigoInvitado || guest.id), detail(guest.mesa === null ? 'Sin mesa' : `Mesa ${guest.mesa}`), detail(`${guest.pases} pase(s)`));
        card.appendChild(createPreview(guest));
        const status = getGuestQrAvailability(guest);
        card.append(detail(statusLabel(status.status)), createDownloadButton(guest, status.available));
        return card;
    }));
}

function createPreview(guest) {
    const availability = getGuestQrAvailability(guest);
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'qr-preview';
    preview.dataset.guestId = guest.id;
    preview.disabled = !availability.available;
    preview.setAttribute('aria-label', availability.available ? `Ver QR de ${guest.codigoInvitado}` : statusLabel(availability.status));
    preview.textContent = availability.available ? 'Preparando preview...' : statusLabel(availability.status);
    return preview;
}

function createDownloadButton(guest, enabled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-secondary qr-download-one';
    button.dataset.guestId = guest.id;
    button.disabled = !enabled;
    button.textContent = 'Descargar PNG';
    return button;
}

function observePreviews() {
    const previews = document.querySelectorAll('.qr-preview:not(:disabled)');
    observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            renderPreview(entry.target);
            observer?.unobserve(entry.target);
        });
    }, { rootMargin: '180px' });
    previews.forEach((preview) => observer.observe(preview));
}

function renderPreview(preview) {
    const guest = guestById.get(preview.dataset.guestId);
    if (!guest || preview.querySelector('canvas')) return;
    try {
        const canvas = generateQrCanvas(guest.qrToken, { size: 180 });
        canvas.setAttribute('aria-hidden', 'true');
        preview.replaceChildren(canvas);
    } catch {
        preview.textContent = 'No se pudo generar';
        preview.disabled = true;
    }
}

async function handleListAction(event) {
    const button = event.target.closest('[data-guest-id]');
    if (!button) return;
    const guest = guestById.get(button.dataset.guestId);
    if (!guest) return;
    if (button.classList.contains('qr-preview')) return openQrModal(guest);
    if (!button.classList.contains('qr-download-one')) return;
    await runDownload(button, guest);
}

async function runDownload(button, guest) {
    button.disabled = true;
    try {
        await downloadGuestQrPng(guest);
        generated.add(guest.id);
        renderSummary();
        context.ui.showToast({ title: 'PNG generado', message: `${guest.codigoInvitado}.png se descargó localmente.`, type: 'success' });
    } catch (error) {
        context.ui.showToast({ title: 'No fue posible descargar', message: 'El PNG no pudo generarse en este navegador.', type: 'error' });
    } finally {
        button.disabled = false;
    }
}

function openQrModal(guest) {
    const content = document.createElement('div');
    content.className = 'qr-modal-content';
    const canvas = generateQrCanvas(guest.qrToken, { size: 640 });
    canvas.className = 'qr-modal-canvas';
    content.append(canvas, detail(guest.nombre), detail(guest.codigoInvitado), detail(guest.mesa === null ? 'Sin mesa' : `Mesa ${guest.mesa}`), detail(`${guest.pases} pase(s)`));
    const download = createDownloadButton(guest, true);
    download.removeAttribute('data-guest-id');
    download.addEventListener('click', () => runDownload(download, guest));
    content.appendChild(download);
    context.ui.showModal({ title: 'Código QR', content, onClose: () => { canvas.width = 1; canvas.height = 1; } });
}

async function handleDownloadAll() {
    const available = guests.filter((guest) => getGuestQrAvailability(guest).available);
    if (!available.length || zipController) return;
    zipController = new AbortController();
    const cancel = document.getElementById('qr-cancel-download');
    if (cancel) cancel.hidden = false;
    context.ui.showProgress({ progress: 0, text: `Generando códigos QR 0 / ${available.length}` });
    try {
        const blob = await buildQrZip({
            eventId: context.eventContext.eventId,
            guests: available,
            signal: zipController.signal,
            onProgress: ({ current, total }) => context.ui.updateProgress({ progress: Math.round((current / total) * 100), text: `Generando códigos QR ${current} / ${total}` })
        });
        downloadQrZip(blob, context.eventContext.eventId);
        available.forEach((guest) => generated.add(guest.id));
        renderSummary();
        context.ui.showToast({ title: 'ZIP generado', message: 'Los PNG y el index.csv se descargaron localmente.', type: 'success' });
    } catch (error) {
        context.ui.showToast({ title: error?.name === 'AbortError' ? 'Generación cancelada' : 'No fue posible generar el ZIP', message: error?.name === 'AbortError' ? 'No se creó ningún archivo ZIP.' : 'Intenta nuevamente.', type: error?.name === 'AbortError' ? 'warning' : 'error' });
    } finally {
        context.ui.hideProgress();
        if (cancel) cancel.hidden = true;
        zipController = null;
    }
}

function renderRestricted(panel) {
    panel.replaceChildren();
    const state = document.createElement('section');
    state.className = 'qr-state qr-state--restricted';
    const title = document.createElement('h2');
    title.textContent = 'Acceso restringido';
    const message = document.createElement('p');
    message.textContent = 'Esta sección requiere el custom claim CEO.';
    state.append(title, message);
    panel.appendChild(state);
}

function activatePanel(tab, panel) {
    document.querySelectorAll('.tab-btn').forEach((item) => item.classList.toggle('active', item === tab));
    document.querySelectorAll('.tab-pane').forEach((item) => item.classList.toggle('active', item === panel));
}

function setState(state, message) {
    const element = document.getElementById('qr-state');
    if (!element) return;
    element.dataset.state = state;
    element.textContent = message;
    element.hidden = state === 'ready';
}

function clearCanvases() {
    document.querySelectorAll('#tab-qr canvas, .qr-modal-canvas').forEach((canvas) => { canvas.width = 1; canvas.height = 1; canvas.remove(); });
}

function bind(target, name, handler) {
    if (!target) return;
    target.addEventListener(name, handler);
    cleanups.push(() => target.removeEventListener(name, handler));
}

function bindSession(target, name, handler) {
    if (!target) return;
    target.addEventListener(name, handler);
    sessionCleanups.push(() => target.removeEventListener(name, handler));
}

function appendCell(row, value) {
    const cell = row.insertCell();
    cell.textContent = String(value ?? '');
}

function detail(value) {
    const node = document.createElement('p');
    node.textContent = String(value ?? '');
    return node;
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
}

function normalize(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function accessLabel(value) {
    return value === 'ambos' ? 'Ambos' : value === 'qr' ? 'QR' : 'Manual';
}

function statusLabel(status) {
    return ({ available: 'Activo', disabled: 'QR desactivado', missing: 'QR no disponible', unsupported: 'Sin acceso QR' })[status] || 'QR no disponible';
}
