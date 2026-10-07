import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import { auth } from '../admin/firebase.js';

const authorizedEmail = 'messages@gmail.com';
const authorizedAdminUid = '5I3NPSeJ09Q6No0SICx1dlpV1Wk1';
const functionsBaseUrl = 'https://us-central1-eventorastudio-d6d95.cloudfunctions.net';
const statusLabels = { new: 'Nueva', contacted: 'Contactado', in_progress: 'En proceso', completed: 'Finalizada' };
const needsLabels = {
    'services-products': 'Servicios o productos',
    gallery: 'Galería',
    'hours-location': 'Horarios y ubicación',
    'contact-social': 'Contacto y redes sociales',
    about: 'Nosotros',
    other: 'Otro'
};
const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginForm = document.querySelector('#login-form');
const loginStatus = document.querySelector('#login-status');
const appStatus = document.querySelector('#app-status');
const requestList = document.querySelector('#request-list');
const requestDetail = document.querySelector('#request-detail');
let currentUser = null;
let requests = [];

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginStatus.textContent = '';
    const email = document.querySelector('#login-email').value.trim();
    const password = document.querySelector('#login-password').value;
    if (!email || !password) { loginStatus.textContent = 'Escribe tu correo y contraseña.'; return; }

    const button = loginForm.querySelector('button');
    button.disabled = true;
    button.textContent = 'ENTRANDO...';
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch {
        loginStatus.textContent = 'No pudimos iniciar sesión con esos datos.';
        button.disabled = false;
        button.textContent = 'ENTRAR';
    }
});

document.querySelector('#logout-button').addEventListener('click', () => signOut(auth));
document.querySelector('#refresh-button').addEventListener('click', () => loadRequests());

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) {
        showLogin();
        return;
    }
    if (user.uid !== authorizedAdminUid || user.email?.toLowerCase() !== authorizedEmail) {
        await signOut(auth);
        loginStatus.textContent = 'Acceso no autorizado.';
        return;
    }
    showApp();
    await loadRequests();
});

async function loadRequests() {
    if (!currentUser) return;
    appStatus.textContent = 'Cargando solicitudes...';
    requestList.innerHTML = '<p class="loading">Cargando solicitudes...</p>';
    try {
        const requestsResponse = await authorizedFetch('/getWebsiteRequests');
        requests = Array.isArray(requestsResponse.requests) ? requestsResponse.requests : [];
        renderSummary();
        renderList();
        appStatus.textContent = '';
    } catch (error) {
        requestList.innerHTML = '';
        appStatus.textContent = error.message || 'No pudimos cargar las solicitudes.';
    }
}

async function authorizedFetch(path, options = {}) {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${functionsBaseUrl}${path}`, {
        ...options,
        headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.message || 'La operación no pudo completarse.');
    return result;
}

function renderSummary() {
    document.querySelector('#total-count').textContent = requests.length;
    document.querySelector('#new-count').textContent = requests.filter((item) => item.status === 'new').length;
    document.querySelector('#progress-count').textContent = requests.filter((item) => item.status === 'in_progress').length;
}

function renderList() {
    if (!requests.length) {
        requestList.innerHTML = '<p class="empty-state">Todavía no hay solicitudes.</p>';
        requestDetail.innerHTML = '<p class="empty-state">Las nuevas solicitudes aparecerán aquí.</p>';
        return;
    }
    requestList.innerHTML = requests.map((item) => `<button class="request-card" type="button" data-request-id="${escapeAttribute(item.id)}"><strong>${escapeHtml(item.businessName || 'Negocio sin nombre')}</strong><small>${escapeHtml(item.contactName || 'Contacto sin nombre')}</small><span class="request-card-meta"><span>${escapeHtml(formatDate(item.createdAt))}</span><span class="status-pill">${escapeHtml(statusLabels[item.status] || item.status)}</span></span></button>`).join('');
    requestList.querySelectorAll('[data-request-id]').forEach((card) => card.addEventListener('click', () => showDetail(card.dataset.requestId)));
}

function showDetail(id) {
    const item = requests.find((request) => request.id === id);
    if (!item) return;
    requestList.querySelectorAll('.request-card').forEach((card) => { card.toggleAttribute('aria-current', card.dataset.requestId === id); });
    const whatsapp = item.whatsapp.replace(/\D/g, '');
    const whatsappUrl = whatsapp ? `https://wa.me/${whatsapp}` : '';
    const needs = Array.isArray(item.needs) ? item.needs.map((need) => needsLabels[need] || need) : [];
    requestDetail.innerHTML = `<h2>${escapeHtml(item.businessName || 'Solicitud')}</h2><div class="detail-section"><dl><dt>Contacto</dt><dd>${escapeHtml(item.contactName)}</dd><dt>WhatsApp</dt><dd>${escapeHtml(item.whatsapp)}</dd><dt>Correo</dt><dd>${escapeHtml(item.email || 'No proporcionado')}</dd></dl></div><div class="detail-section"><dl><dt>Giro</dt><dd>${escapeHtml(item.businessType)}</dd><dt>Ciudad/Zona</dt><dd>${escapeHtml(item.city || 'No especificada')}</dd><dt>Paquete</dt><dd>${escapeHtml(item.plan)}</dd><dt>Template</dt><dd>${escapeHtml(item.template)}</dd><dt>Necesidades</dt><dd>${escapeHtml(needs.join(', '))}</dd><dt>Comentarios</dt><dd>${escapeHtml(item.notes || 'Sin comentarios')}</dd><dt>Fecha</dt><dd>${escapeHtml(formatDate(item.createdAt))}</dd></dl></div><div class="detail-section"><label for="request-status">Estado</label><select id="request-status"><option value="new">Nueva</option><option value="contacted">Contactado</option><option value="in_progress">En proceso</option><option value="completed">Finalizada</option></select><div class="detail-actions">${whatsappUrl ? `<a class="button button-dark" href="${escapeAttribute(whatsappUrl)}" target="_blank" rel="noopener noreferrer">Contactar por WhatsApp</a>` : ''}${item.email ? `<a class="button button-light" href="mailto:${escapeAttribute(item.email)}">Enviar correo</a>` : ''}<button id="delete-request" class="button danger-button" type="button">Eliminar solicitud</button></div></div>`;
    const statusSelect = requestDetail.querySelector('#request-status');
    statusSelect.value = item.status;
    statusSelect.addEventListener('change', () => updateStatus(item.id, statusSelect.value));
    requestDetail.querySelector('#delete-request').addEventListener('click', () => deleteRequest(item.id));
}

async function updateStatus(id, status) {
    try {
        await authorizedFetch('/updateWebsiteRequestStatus', { method: 'POST', body: JSON.stringify({ id, status }) });
        const item = requests.find((request) => request.id === id);
        if (item) item.status = status;
        renderSummary();
        renderList();
        showDetail(id);
    } catch (error) { appStatus.textContent = error.message; }
}

async function deleteRequest(id) {
    if (!window.confirm('¿Eliminar esta solicitud? Esta acción no se puede deshacer.')) return;
    try {
        await authorizedFetch('/deleteWebsiteRequest', { method: 'POST', body: JSON.stringify({ id }) });
        requests = requests.filter((request) => request.id !== id);
        renderSummary();
        renderList();
        appStatus.textContent = 'Solicitud eliminada.';
    } catch (error) { appStatus.textContent = error.message; }
}

function showLogin() { loginView.hidden = false; appView.hidden = true; }
function showApp() { loginView.hidden = true; appView.hidden = false; }
function formatDate(value) { return value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Fecha pendiente'; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
