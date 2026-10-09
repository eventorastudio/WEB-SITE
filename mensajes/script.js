import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js';
import { auth, appCheck } from './firebase.js';
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from '../shared/utils/whatsapp.js';
import { apiFetch, isTimeoutError } from '../shared/api.js';

const functionsBaseUrl = 'https://us-central1-eventorastudio-d6d95.cloudfunctions.net';
const statusLabels = { new: 'Nueva', contacted: 'Contactado', in_progress: 'En proceso', completed: 'Finalizada' };
const statusKeys = Object.keys(statusLabels);
const planLabels = { esencial: 'Esencial', profesional: 'Profesional', 'a-medida': 'A medida', 'no-estoy-seguro': 'Sin definir' };
const templateLabels = { 'template-01': 'Eagles Burger', 'template-02': 'My Love Flowers', 'template-03': 'Premium Car', 'no-estoy-seguro': 'Sin diseño definido', 'algo-diferente': 'Otro diseño' };
const needsLabels = { 'services-products': 'Servicios / productos', gallery: 'Galería', 'hours-location': 'Horarios / ubicación', 'contact-social': 'Contacto / redes', about: 'Sobre nosotros', other: 'Otro' };
const hostingPreferenceLabels = { 'files-only': 'Solo entrega de archivos', hosting: 'Hosting', 'hosting-maintenance': 'Hosting + mantenimiento', undecided: 'Aún no lo sé' };
const appView = document.querySelector('#app-view');
const appStatus = document.querySelector('#app-status');
const requestList = document.querySelector('#request-list');
const requestDetail = document.querySelector('#request-detail');
const searchInput = document.querySelector('#request-search');
const statusFilter = document.querySelector('#status-filter');
const planFilter = document.querySelector('#plan-filter');
const sortOrder = document.querySelector('#sort-order');
const resultsSummary = document.querySelector('#results-summary');
const deleteDialog = document.querySelector('#delete-dialog');
const confirmDeleteButton = document.querySelector('#confirm-delete');
let currentUser = null;
let requests = [];
let selectedRequestId = null;
let pendingDeleteId = null;

document.querySelector('#refresh-button').addEventListener('click', () => loadRequests());
searchInput.addEventListener('input', renderList);
statusFilter.addEventListener('change', renderList);
planFilter.addEventListener('change', renderList);
sortOrder.addEventListener('change', renderList);
document.querySelector('#cancel-delete').addEventListener('click', closeDeleteDialog);
confirmDeleteButton.addEventListener('click', confirmDelete);
deleteDialog.addEventListener('click', (event) => { if (event.target === deleteDialog) closeDeleteDialog(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !deleteDialog.hidden) closeDeleteDialog(); });

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) { redirectToAdmin(); return; }
    showApp();
    await loadRequests();
});

async function loadRequests() {
    if (!currentUser) return;
    appStatus.textContent = 'Cargando solicitudes...';
    renderLoading();
    try {
        const response = await authorizedFetch('/getWebsiteRequests');
        requests = Array.isArray(response.requests) ? response.requests : [];
        selectedRequestId = null;
        renderSummary();
        renderList();
        showEmptyDetail();
        appStatus.textContent = '';
    } catch (error) {
        requestList.replaceChildren();
        appStatus.textContent = friendlyError(error, 'No pudimos cargar las solicitudes.');
    }
}

async function authorizedFetch(path, options = {}) {
    try { return await apiFetch(`${functionsBaseUrl}${path}`, { user: currentUser, appCheck, getAppCheckToken: getToken, options }); }
    catch (error) { if (isTimeoutError(error)) throw new Error('La solicitud está tardando demasiado. Intenta nuevamente.'); throw error; }
}

function renderSummary() {
    setText('#total-count', requests.length);
    setText('#new-count', countByStatus('new'));
    setText('#contacted-count', countByStatus('contacted'));
    setText('#progress-count', countByStatus('in_progress'));
    setText('#completed-count', countByStatus('completed'));
}

function renderList() {
    const filtered = getFilteredRequests();
    resultsSummary.textContent = requests.length ? `${filtered.length} de ${requests.length} solicitudes` : '';
    requestList.replaceChildren();
    if (!requests.length) { requestList.append(createMessage('Todavía no hay solicitudes.', 'empty-state')); return; }
    if (!filtered.length) { requestList.append(createMessage('Sin resultados para estos filtros.', 'empty-state')); return; }
    filtered.forEach((item) => requestList.append(createRequestCard(item)));
}

function getFilteredRequests() {
    const query = normalizeText(searchInput.value);
    const selectedStatus = statusFilter.value;
    const selectedPlan = planFilter.value;
    const filtered = [...requests]
        .filter((item) => selectedStatus === 'all' || item.status === selectedStatus)
        .filter((item) => selectedPlan === 'all' || item.plan === selectedPlan || (selectedPlan === 'no-estoy-seguro' && !planLabels[item.plan]))
        .filter((item) => !query || [item.contactName, item.businessName, item.whatsapp, item.email, item.city].some((value) => normalizeText(value).includes(query)))
        .sort((left, right) => getTime(left.createdAt) - getTime(right.createdAt) || String(left.id).localeCompare(String(right.id)));
    return sortOrder.value === 'newest' ? filtered.reverse() : filtered;
}

function createRequestCard(item) {
    const button = document.createElement('button');
    button.className = 'request-card';
    button.type = 'button';
    button.dataset.requestId = item.id;
    button.setAttribute('aria-current', String(item.id === selectedRequestId));
    const title = document.createElement('strong');
    title.textContent = item.businessName || 'Negocio sin nombre';
    const contact = document.createElement('small');
    contact.textContent = item.contactName || 'Contacto sin nombre';
    const meta = document.createElement('span');
    meta.className = 'request-card-meta';
    const date = document.createElement('span');
    date.textContent = formatDate(item.createdAt);
    const status = document.createElement('span');
    status.className = `status-pill status-${statusKeys.includes(item.status) ? item.status : 'new'}`;
    status.textContent = statusLabels[item.status] || 'Nueva';
    meta.append(date, status);
    button.append(title, contact, meta);
    button.addEventListener('click', () => showDetail(item.id));
    return button;
}

function showDetail(id) {
    const item = requests.find((request) => request.id === id);
    if (!item) return;
    selectedRequestId = id;
    requestList.querySelectorAll('.request-card').forEach((card) => card.setAttribute('aria-current', String(card.dataset.requestId === id)));
    requestDetail.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = item.businessName || 'Solicitud';
    requestDetail.append(title, createContactSection(item), createBusinessSection(item), createActionsSection(item));
}

function createContactSection(item) {
    const section = createDetailSection();
    addDefinition(section, 'Contacto', item.contactName || 'No proporcionado');
    addDefinition(section, 'WhatsApp', item.whatsapp || 'No proporcionado');
    addDefinition(section, 'Correo', item.email || 'No proporcionado');
    return section;
}

function createBusinessSection(item) {
    const section = createDetailSection();
    addDefinition(section, 'Giro', item.businessType || 'No especificado');
    addDefinition(section, 'Ciudad / zona', item.city || 'No especificada');
    addDefinition(section, 'Paquete', planLabels[item.plan] || 'Sin definir');
    addDefinition(section, 'Preferencia de alojamiento', hostingPreferenceLabels[item.hostingPreference] || 'No especificado');
    addDefinition(section, 'Diseño', templateLabels[item.template] || 'Sin diseño definido');
    addDefinition(section, 'Necesidades', formatNeeds(item.needs));
    addDefinition(section, 'Comentarios', item.notes || 'Sin comentarios');
    addDefinition(section, 'Fecha', formatDate(item.createdAt));
    return section;
}

function createActionsSection(item) {
    const section = createDetailSection();
    const statusLabel = document.createElement('label');
    statusLabel.htmlFor = 'request-status';
    statusLabel.textContent = 'Estado';
    const statusSelect = document.createElement('select');
    statusSelect.id = 'request-status';
    statusKeys.forEach((key) => statusSelect.append(new Option(statusLabels[key], key, false, key === item.status)));
    statusSelect.addEventListener('change', () => updateStatus(item.id, statusSelect));
    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    const whatsapp = createWhatsAppAction(item);
    if (whatsapp) actions.append(whatsapp);
    if (item.email) actions.append(createCopyButton('Copiar correo', item.email));
    if (item.whatsapp) actions.append(createCopyButton('Copiar WhatsApp', item.whatsapp));
    const deleteButton = document.createElement('button');
    deleteButton.id = 'delete-request';
    deleteButton.className = 'button danger-button';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Eliminar solicitud';
    deleteButton.addEventListener('click', () => openDeleteDialog(item.id));
    actions.append(deleteButton);
    section.append(statusLabel, statusSelect, actions);
    return section;
}

function createWhatsAppAction(item) {
    try {
        const number = normalizeWhatsAppNumber(item.whatsapp);
        const url = buildWhatsAppUrl(number, `Hola, soy Pablo de Eventora Studio. Recibimos tu solicitud para ${item.businessName || 'tu negocio'}.`);
        const link = document.createElement('a');
        link.className = 'button button-dark';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Abrir WhatsApp';
        return link;
    } catch { return null; }
}

function createCopyButton(label, value) {
    const button = document.createElement('button');
    button.className = 'button button-light';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(value); setAppStatus('Copiado.'); }
        catch { setAppStatus('No se pudo copiar el dato.'); }
    });
    return button;
}

async function updateStatus(id, select) {
    const previous = requests.find((item) => item.id === id)?.status || 'new';
    select.disabled = true;
    setAppStatus('Actualizando estado...');
    try {
        await authorizedFetch('/updateWebsiteRequestStatus', { method: 'POST', body: JSON.stringify({ id, status: select.value }) });
        const item = requests.find((request) => request.id === id);
        if (item) item.status = select.value;
        renderSummary();
        renderList();
        showDetail(id);
        setAppStatus('Estado actualizado.');
    } catch {
        select.value = previous;
        select.disabled = false;
        setAppStatus('No se pudo actualizar el estado.');
    }
}

function openDeleteDialog(id) { pendingDeleteId = id; deleteDialog.hidden = false; confirmDeleteButton.focus(); }
function closeDeleteDialog() { pendingDeleteId = null; deleteDialog.hidden = true; }

async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    confirmDeleteButton.disabled = true;
    confirmDeleteButton.textContent = 'Eliminando...';
    try {
        await authorizedFetch('/deleteWebsiteRequest', { method: 'POST', body: JSON.stringify({ id }) });
        requests = requests.filter((request) => request.id !== id);
        selectedRequestId = null;
        closeDeleteDialog();
        renderSummary();
        renderList();
        showEmptyDetail();
        setAppStatus('Solicitud eliminada.');
    } catch { setAppStatus('No se pudo eliminar la solicitud.'); }
    finally { confirmDeleteButton.disabled = false; confirmDeleteButton.textContent = 'Eliminar'; }
}

function addDefinition(section, term, value) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    section.querySelector('dl').append(dt, dd);
}
function createDetailSection() { const section = document.createElement('div'); section.className = 'detail-section'; section.append(document.createElement('dl')); return section; }
function renderLoading() { requestList.replaceChildren(createMessage('Cargando solicitudes...', 'loading')); }
function showEmptyDetail() { requestDetail.replaceChildren(createMessage('Selecciona una solicitud para ver sus detalles.', 'empty-state')); }
function createMessage(text, className) { const message = document.createElement('p'); message.className = className; message.textContent = text; return message; }
function countByStatus(status) { return requests.filter((item) => item.status === status).length; }
function formatNeeds(needs) { const labels = Array.isArray(needs) ? needs.map((need) => needsLabels[need] || 'Otra necesidad') : []; return labels.length ? labels.join(', ') : 'No especificadas'; }
function formatDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Fecha pendiente'; }
function getTime(value) { const time = value ? new Date(value).valueOf() : 0; return Number.isNaN(time) ? 0 : time; }
function normalizeText(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function setText(selector, value) { document.querySelector(selector).textContent = String(value); }
function setAppStatus(message) { appStatus.textContent = message; }
function friendlyError(error, fallback) { return error?.message && !/firebase|permission|function|network/i.test(error.message) ? error.message : fallback; }
function redirectToAdmin() { if (window.top === window.self) location.replace('/admin/#mensajes'); }
function showApp() { appView.hidden = false; }
