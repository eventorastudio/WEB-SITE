// event.js
// Lógica de Módulos 4, 5 y 6: Evento, Invitados y Motor de Invitaciones Digitales

import { auth, db } from './firebase.js';
import { CONFIG } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { generateToken, generateInvitationURL, generateQRCode, copyInvitation } from './invitation-utils.js';

// ============================================================================
// REFERENCIAS DOM
// ============================================================================
const authGuard = document.getElementById('auth-guard');
const loadingView = document.getElementById('loading-view');
const errorView = document.getElementById('error-view');
const mainView = document.getElementById('main-view');

const uiLogo = document.getElementById('ui-logo');
const btnBack = document.getElementById('btn-back');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

let currentEventData = null;
let currentEventId = null;
let globalGuests = [];
let currentEditingGuestId = null;
let guestToDeleteId = null;
let guestToRegenerateId = null;

// Formularios, Modales y Filtros
const searchInput = document.getElementById('guest-search');
const filterStatus = document.getElementById('guest-filter-status');
const filterTable = document.getElementById('guest-filter-table');
const sortSelect = document.getElementById('guest-sort');
const btnOpenAddGuest = document.getElementById('btn-open-add-guest');
const btnImportExcel = document.getElementById('btn-import-excel');
const btnEmptyAddGuest = document.getElementById('btn-empty-add-guest');

const guestsList = document.getElementById('guests-list');
const guestsEmptyState = document.getElementById('guests-empty-state');

// Modal Guest (Formulario)
const modalGuest = document.getElementById('modal-guest');
const formGuest = document.getElementById('form-guest');
const btnCloseModalGuest = document.getElementById('btn-close-modal-guest');
const btnCancelModalGuest = document.getElementById('btn-cancel-modal-guest');
const btnSubmitGuest = document.getElementById('btn-submit-guest');
const modalGuestTitle = document.getElementById('modal-guest-title');

// Modales Acción
const modalConfirmDelete = document.getElementById('modal-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const deleteGuestName = document.getElementById('delete-guest-name');

const modalFeatureComing = document.getElementById('modal-feature-coming');
const btnCloseComing = document.getElementById('btn-close-coming');

// Modales Módulo 6 (Invitación Digital)
const modalConfirmRegenerate = document.getElementById('modal-confirm-regenerate');
const btnCancelRegenerate = document.getElementById('btn-cancel-regenerate');
const btnConfirmRegenerate = document.getElementById('btn-confirm-regenerate');
const regenGuestName = document.getElementById('regen-guest-name');

const modalQrViewer = document.getElementById('modal-qr-viewer');
const btnCloseModalQr = document.getElementById('btn-close-modal-qr');
const btnDownloadQr = document.getElementById('btn-download-qr');
const btnCopyLinkQr = document.getElementById('btn-copy-link-qr');
const qrViewerImg = document.getElementById('qr-viewer-img');
const qrViewerToken = document.getElementById('qr-viewer-token');
const qrViewerUrl = document.getElementById('qr-viewer-url');

// Variables para descarga de QR
let currentQrUrlDownload = '';
let currentQrTokenDownload = '';


// ============================================================================
// UTILIDADES COMUNES
// ============================================================================
function animateValue(element, start, end, duration) {
    if(!element) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4);
        element.innerHTML = Math.floor(ease * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
        else element.innerHTML = end;
    };
    window.requestAnimationFrame(step);
}

function formatearFecha(fechaObj) {
    if (!fechaObj) return 'Por definir';
    let fecha;
    if (typeof fechaObj === 'string') {
        const partes = fechaObj.split('-');
        if(partes.length === 3) fecha = new Date(partes[0], partes[1] - 1, partes[2]);
        else fecha = new Date(fechaObj);
    } 
    else if (fechaObj.toDate) fecha = fechaObj.toDate();
    else fecha = new Date(fechaObj);

    return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatearEstadoBadge(estadoTxt) {
    const estadoStr = estadoTxt ? estadoTxt.toString().toLowerCase() : 'borrador';
    if (estadoStr.includes('activo')) return { clase: 'activo', texto: 'Activo' };
    if (estadoStr.includes('finalizado')) return { clase: 'finalizado', texto: 'Finalizado' };
    return { clase: 'borrador', texto: 'Borrador' };
}

function formatGuestBadge(estado) {
    const est = estado ? estado.toLowerCase() : 'pendiente';
    if (est.includes('confirmado')) return { clase: 'confirmado', texto: 'Confirmado' };
    if (est.includes('no')) return { clase: 'no_asistira', texto: 'No asistirá' };
    if (est.includes('llegó') || est.includes('llego')) return { clase: 'llego', texto: 'Llegó' };
    return { clase: 'pendiente', texto: 'Pendiente' };
}

function generateAvatarInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
}

function showToast(message, iconSvg) {
    const toast = document.getElementById('toast-notification');
    const defaultIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    toast.innerHTML = `${iconSvg || defaultIcon} <span>${message}</span>`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}


// ============================================================================
// INICIALIZACIÓN MÓDULO 4
// ============================================================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = CONFIG.LOGOUT_REDIRECT;
        return;
    }
    
    authGuard.style.opacity = '0';
    setTimeout(() => authGuard.style.display = 'none', 600);
    
    initUI();
    initGuestEvents(); 
    initInvitationEvents(); // Módulo 6

    const urlParams = new URLSearchParams(window.location.search);
    currentEventId = urlParams.get('id');

    if (!currentEventId) {
        showError("Falta el ID del evento", "No se proporcionó un identificador válido.");
        return;
    }

    await fetchEventData(currentEventId);
});

function initUI() {
    if (uiLogo) uiLogo.src = CONFIG.LOGO;
    btnBack.addEventListener('click', () => { window.location.href = 'dashboard.html'; });

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${targetId}`).classList.add('active');
            
            if(targetId === 'estadisticas' && currentEventData) animateProgressBar(currentEventData);
        });
    });

    document.getElementById('btn-copy-url').addEventListener('click', () => {
        const urlInput = document.getElementById('val-url').value;
        copyInvitation(urlInput, () => showToast('Enlace general copiado exitosamente.'));
    });
    
    document.getElementById('btn-open-invitation').addEventListener('click', () => {
        const url = document.getElementById('val-url').value;
        if(url && url.startsWith('http')) window.open(url, '_blank');
    });
}

async function fetchEventData(eventId) {
    try {
        const docRef = doc(db, 'eventos', eventId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentEventData = docSnap.data();
            await fetchGuestsData(); // Carga invitados antes de pintar stats globales
            populateEventData();
            
            loadingView.style.display = 'none';
            mainView.style.display = 'block';
            setTimeout(() => mainView.style.opacity = '1', 50);

        } else {
            showError("Evento no encontrado.", "El evento que intentas administrar no existe.");
        }
    } catch (error) {
        console.error("Error obteniendo evento:", error);
        showError("Error de conexión", "Ocurrió un problema al cargar los datos.");
    }
}

function showError(title, desc) {
    loadingView.style.display = 'none';
    errorView.style.display = 'block';
    if(title) document.getElementById('error-title').textContent = title;
    if(desc) document.getElementById('error-desc').textContent = desc;
}

function populateEventData() {
    const data = currentEventData;
    const nombre = data.nombreEvento || data.nombre || 'Evento sin título';
    const ciudad = data.ciudad || 'Ciudad no especificada';
    const estadoLugar = data.estado || 'Estado no especificado';
    const pais = data.pais || 'País no especificado';
    const fecha = formatearFecha(data.fecha);
    const hora = data.hora || '--:--';
    const tipo = data.tipoEvento || data.tipo || 'General';
    const codigo = data.codigoEvento || data.codigo || 'EVT-XXXX';
    const acceso = data.tipoAcceso || data.acceso || 'Global';
    const status = data.estadoEvento || data.estado || 'Borrador';
    const descripcion = data.descripcion || 'Sin descripción adicional.';
    const claveAcceso = data.claveAcceso || '----';

    document.getElementById('val-nombre').textContent = nombre;
    document.getElementById('val-ciudad').textContent = ciudad;
    document.getElementById('val-fecha').textContent = fecha;
    const badgeInfo = formatearEstadoBadge(status);
    const badgeEl = document.getElementById('val-estado-badge');
    badgeEl.textContent = badgeInfo.texto;
    badgeEl.className = `badge ${badgeInfo.clase}`;

    document.getElementById('info-nombre').textContent = nombre;
    document.getElementById('info-tipo').textContent = tipo;
    document.getElementById('info-fecha').textContent = fecha;
    document.getElementById('info-hora').textContent = hora;
    document.getElementById('info-ubicacion').textContent = `${ciudad}, ${estadoLugar}, ${pais}`;
    document.getElementById('info-estado').textContent = badgeInfo.texto;
    document.getElementById('info-descripcion').textContent = descripcion;

    const baseUrl = window.location.origin;
    document.getElementById('val-url').value = `${baseUrl}/invitacion?code=${codigo}`;
    document.getElementById('inv-codigo').textContent = codigo;
    document.getElementById('inv-acceso').textContent = acceso;

    document.getElementById('conf-estado').textContent = badgeInfo.texto;
    document.getElementById('conf-acceso').textContent = acceso;
    document.getElementById('conf-codigo').textContent = codigo;
    document.getElementById('conf-clave').textContent = claveAcceso;

    syncParentStatsUI();
}

function animateProgressBar() {
    const totalInv = Number(currentEventData.totalInvitados) || 0;
    const confirmados = Number(currentEventData.confirmados) || 0;
    let porcentaje = totalInv > 0 ? Math.round((confirmados / totalInv) * 100) : 0;
    if(porcentaje > 100) porcentaje = 100;

    const lbl = document.getElementById('stat-porcentaje');
    const bar = document.getElementById('stat-progress-bar');
    bar.style.width = '0%';
    setTimeout(() => {
        animateValue(lbl, 0, porcentaje, 1000);
        lbl.textContent = porcentaje + '%';
        bar.style.width = porcentaje + '%';
    }, 100);
}


// ============================================================================
// LÓGICA MÓDULO 5: ADMINISTRACIÓN DE INVITADOS
// ============================================================================

function initGuestEvents() {
    btnOpenAddGuest.addEventListener('click', () => openGuestModal());
    btnEmptyAddGuest.addEventListener('click', () => openGuestModal());
    
    btnImportExcel.addEventListener('click', () => openModalElem(modalFeatureComing));
    btnCloseComing.addEventListener('click', () => closeModalElem(modalFeatureComing));

    searchInput.addEventListener('input', renderGuestsList);
    filterStatus.addEventListener('change', renderGuestsList);
    filterTable.addEventListener('change', renderGuestsList);
    sortSelect.addEventListener('change', renderGuestsList);

    btnCloseModalGuest.addEventListener('click', () => closeModalElem(modalGuest));
    btnCancelModalGuest.addEventListener('click', () => closeModalElem(modalGuest));
    btnSubmitGuest.addEventListener('click', saveGuest);
    
    formGuest.querySelectorAll('.form-control').forEach(input => {
        input.addEventListener('input', () => {
            input.classList.remove('input-error');
            if(input.nextElementSibling) input.nextElementSibling.style.display = 'none';
        });
    });

    btnCancelDelete.addEventListener('click', () => closeModalElem(modalConfirmDelete));
    btnConfirmDelete.addEventListener('click', executeDeleteGuest);
}

// Obtener datos (Firestore Subcollection)
async function fetchGuestsData() {
    try {
        const guestsRef = collection(db, `eventos/${currentEventId}/invitados`);
        const snapshot = await getDocs(guestsRef);
        globalGuests = [];
        snapshot.forEach(doc => globalGuests.push({ firebaseId: doc.id, ...doc.data() }));
        calculateAndUpdateStats();
        renderGuestsList();
    } catch (error) {
        console.error("Error cargando invitados:", error);
    }
}

function calculateAndUpdateStats() {
    let stats = { totalPases: 0, conf: 0, pend: 0, no: 0, llegaron: 0, totalInvitadosEntidad: globalGuests.length };

    globalGuests.forEach(g => {
        const pases = Number(g.pases) || 1;
        stats.totalPases += pases;
        const est = g.estado ? g.estado.toLowerCase() : '';
        if (est.includes('confirmado')) stats.conf += pases;
        else if (est.includes('no')) stats.no += pases;
        else if (est.includes('llegó') || est.includes('llego')) {
            stats.llegaron += pases;
            stats.conf += pases;
        } 
        else stats.pend += pases;
    });

    document.getElementById('g-stat-total').textContent = stats.totalInvitadosEntidad;
    document.getElementById('g-stat-conf').textContent = stats.conf;
    document.getElementById('g-stat-pend').textContent = stats.pend;
    document.getElementById('g-stat-no').textContent = stats.no;
    document.getElementById('g-stat-llegaron').textContent = stats.llegaron;

    if (currentEventData) {
        currentEventData.totalInvitados = stats.totalPases;
        currentEventData.confirmados = stats.conf;
        currentEventData.pendientes = stats.pend;
        currentEventData.noAsisten = stats.no;
        currentEventData.llegaron = stats.llegaron;
    }
}

async function syncParentStatsUI() {
    if (!currentEventData) return;
    
    animateValue(document.getElementById('count-invitados'), 0, currentEventData.totalInvitados || 0, 800);
    animateValue(document.getElementById('count-confirmados'), 0, currentEventData.confirmados || 0, 800);
    animateValue(document.getElementById('count-pendientes'), 0, currentEventData.pendientes || 0, 800);
    animateValue(document.getElementById('count-llegadas'), 0, currentEventData.llegaron || 0, 800);

    document.getElementById('stat-total').textContent = currentEventData.totalInvitados || 0;
    document.getElementById('stat-confirmados').textContent = currentEventData.confirmados || 0;
    document.getElementById('stat-pendientes').textContent = currentEventData.pendientes || 0;
    document.getElementById('stat-noasiste').textContent = currentEventData.noAsisten || 0;
    document.getElementById('stat-llegadas').textContent = currentEventData.llegaron || 0;
    
    animateProgressBar();

    try {
        const eventRef = doc(db, 'eventos', currentEventId);
        await updateDoc(eventRef, {
            totalInvitados: currentEventData.totalInvitados,
            confirmados: currentEventData.confirmados,
            pendientes: currentEventData.pendientes,
            llegaron: currentEventData.llegaron
        });
    } catch (e) {
        console.error("Error sincronizando stats:", e);
    }
}

function renderGuestsList() {
    let filtered = [...globalGuests];
    
    const searchVal = searchInput.value.toLowerCase().trim();
    if (searchVal) {
        filtered = filtered.filter(g => 
            (g.nombre && g.nombre.toLowerCase().includes(searchVal)) ||
            (g.correo && g.correo.toLowerCase().includes(searchVal)) ||
            (g.telefono && g.telefono.includes(searchVal)) ||
            (g.codigo && g.codigo.toLowerCase().includes(searchVal))
        );
    }

    const statusVal = filterStatus.value;
    if (statusVal !== 'all') {
        filtered = filtered.filter(g => {
            const st = g.estado ? g.estado.toLowerCase() : '';
            if (statusVal === 'confirmado') return st.includes('confirmado');
            if (statusVal === 'pendiente') return st.includes('pendiente');
            if (statusVal === 'no_asistira') return st.includes('no');
            if (statusVal === 'llego') return st.includes('llegó') || st.includes('llego');
            return true;
        });
    }

    const tableVal = filterTable.value;
    if (tableVal !== 'all') {
        filtered = filtered.filter(g => {
            const hasTable = g.mesa && g.mesa.toString().trim() !== '';
            return tableVal === 'with' ? hasTable : !hasTable;
        });
    }

    const sortVal = sortSelect.value;
    filtered.sort((a, b) => {
        if (sortVal === 'name') return (a.nombre || '').localeCompare(b.nombre || '');
        if (sortVal === 'table') return (parseInt(a.mesa) || 9999) - (parseInt(b.mesa) || 9999);
        if (sortVal === 'status') return (a.estado || '').localeCompare(b.estado || '');
        if (sortVal === 'date') return (b.fechaRegistro?.toMillis?.() || 0) - (a.fechaRegistro?.toMillis?.() || 0);
        return 0;
    });

    guestsList.innerHTML = '';
    
    if (globalGuests.length === 0) {
        guestsList.style.display = 'none';
        guestsEmptyState.style.display = 'flex';
        return;
    } 
    
    guestsEmptyState.style.display = 'none';
    guestsList.style.display = 'grid';

    if (filtered.length === 0) {
        guestsList.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color: var(--color-gray-dark); padding: 40px;">No se encontraron invitados con esos filtros.</p>`;
        return;
    }

    filtered.forEach((g, index) => {
        const badge = formatGuestBadge(g.estado);
        const pasesStr = g.pases > 1 ? `${g.pases} pases` : `1 pase`;
        const mesaStr = g.mesa ? `Mesa ${g.mesa}` : 'Sin mesa';
        
        // MÓDULO 6: Estado de la invitación y token
        const invStatus = g.estadoAcceso || 'Pendiente';
        let invBadgeClass = 'badge-inv-pendiente';
        if(invStatus === 'Invitación generada') invBadgeClass = 'badge-inv-generada';
        if(invStatus === 'Regenerada') invBadgeClass = 'badge-inv-regenerada';
        const tokenDisplay = g.token ? g.token.substring(0, 8) + '...' : '----';

        const card = document.createElement('div');
        card.className = 'guest-card';
        card.style.animationDelay = `${Math.min(index * 0.03, 0.3)}s`;

        card.innerHTML = `
            <div class="guest-card-header">
                <div class="guest-profile">
                    <div class="guest-avatar">${generateAvatarInitials(g.nombre)}</div>
                    <div class="guest-name-box">
                        <span class="guest-name">${g.nombre}</span>
                        <span class="guest-id">${g.id || ''}</span>
                    </div>
                </div>
                <span class="guest-badge ${badge.clase}">${badge.texto}</span>
            </div>
            
            <div class="guest-card-body">
                <div class="guest-info-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
                    <strong>${pasesStr}</strong>
                </div>
                <div class="guest-info-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
                    ${mesaStr}
                </div>
                
                <!-- MÓDULO 6: Invitación Box -->
                <div class="guest-invitation-box mt-10">
                    <div class="inv-status-row">
                        <span class="guest-badge ${invBadgeClass}">${invStatus}</span>
                        <span class="inv-short-token" title="${g.token || ''}">TK: <strong>${tokenDisplay}</strong></span>
                    </div>
                    <div class="inv-actions-row">
                        <button class="btn-inv-action mod6-copy-link" data-url="${g.urlInvitacion || ''}" title="Copiar enlace">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="btn-inv-action mod6-open-link" data-url="${g.urlInvitacion || ''}" title="Abrir invitación">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </button>
                        <button class="btn-inv-action mod6-copy-token" data-token="${g.token || ''}" title="Copiar token">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                        </button>
                        <button class="btn-inv-action mod6-show-qr" data-url="${g.urlInvitacion || ''}" data-token="${g.token || ''}" title="Ver QR">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg>
                        </button>
                        <button class="btn-inv-action btn-regen mod6-regen" data-id="${g.firebaseId}" data-name="${g.nombre}" title="Regenerar Invitación">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        </button>
                    </div>
                </div>
            </div>

            <div class="guest-card-actions">
                <button class="btn-guest-action btn-edit-g" data-id="${g.firebaseId}" title="Editar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-guest-action delete btn-del-g" data-id="${g.firebaseId}" data-name="${g.nombre}" title="Eliminar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;

        // Eventos Editar / Eliminar (Mod 5)
        card.querySelector('.btn-edit-g').addEventListener('click', () => openGuestModal(g));
        card.querySelector('.btn-del-g').addEventListener('click', (e) => {
            guestToDeleteId = e.currentTarget.getAttribute('data-id');
            deleteGuestName.textContent = e.currentTarget.getAttribute('data-name');
            openModalElem(modalConfirmDelete);
        });

        // Eventos Módulo 6
        card.querySelector('.mod6-copy-link').addEventListener('click', (e) => {
            const url = e.currentTarget.getAttribute('data-url');
            if(url) copyInvitation(url, () => showToast('Enlace de invitación copiado.'));
        });
        card.querySelector('.mod6-copy-token').addEventListener('click', (e) => {
            const token = e.currentTarget.getAttribute('data-token');
            if(token) copyInvitation(token, () => showToast('Token copiado.'));
        });
        card.querySelector('.mod6-open-link').addEventListener('click', (e) => {
            const url = e.currentTarget.getAttribute('data-url');
            if(url) window.open(url, '_blank');
        });
        card.querySelector('.mod6-show-qr').addEventListener('click', (e) => {
            const url = e.currentTarget.getAttribute('data-url');
            const token = e.currentTarget.getAttribute('data-token');
            if(url) openQRModal(url, token);
        });
        card.querySelector('.mod6-regen').addEventListener('click', (e) => {
            guestToRegenerateId = e.currentTarget.getAttribute('data-id');
            regenGuestName.textContent = e.currentTarget.getAttribute('data-name');
            openModalElem(modalConfirmRegenerate);
        });

        guestsList.appendChild(card);
    });
}

// Helpers Add
function generateGuestId() {
    let nextNum = 1;
    globalGuests.forEach(g => {
        if (g.id && g.id.startsWith('INV-')) {
            const num = parseInt(g.id.replace('INV-', ''), 10);
            if (!isNaN(num) && num >= nextNum) nextNum = num + 1;
        }
    });
    return `INV-${String(nextNum).padStart(4, '0')}`;
}

function generateUniqueGuestCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let isUnique = false;
    while (!isUnique) {
        code = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        if (!globalGuests.some(g => g.codigo === code)) isUnique = true;
    }
    return code;
}

// CRUD Invitados
function openGuestModal(guestData = null) {
    formGuest.reset();
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');

    if (guestData) {
        currentEditingGuestId = guestData.firebaseId;
        modalGuestTitle.textContent = "Editar Invitado";
        document.getElementById('g-doc-id').value = guestData.firebaseId;
        document.getElementById('g-nombre').value = guestData.nombre || '';
        document.getElementById('g-telefono').value = guestData.telefono || '';
        document.getElementById('g-correo').value = guestData.correo || '';
        document.getElementById('g-pases').value = guestData.pases || 1;
        document.getElementById('g-mesa').value = guestData.mesa || '';
        document.getElementById('g-estado').value = guestData.estado || 'Pendiente';
        document.getElementById('g-acceso').value = guestData.tipoAcceso || 'Ambos';
        document.getElementById('g-notas').value = guestData.notas || '';
    } else {
        currentEditingGuestId = null;
        modalGuestTitle.textContent = "Agregar Invitado";
        document.getElementById('g-doc-id').value = '';
        document.getElementById('g-estado').value = 'Pendiente';
        document.getElementById('g-acceso').value = 'Ambos';
    }
    openModalElem(modalGuest);
}

async function saveGuest() {
    const nameInput = document.getElementById('g-nombre');
    const pasesInput = document.getElementById('g-pases');
    
    let isValid = true;
    if (!nameInput.value.trim()) {
        nameInput.classList.add('input-error');
        nameInput.nextElementSibling.style.display = 'block';
        isValid = false;
    }
    if (!pasesInput.value || pasesInput.value < 1) {
        pasesInput.classList.add('input-error');
        pasesInput.nextElementSibling.style.display = 'block';
        isValid = false;
    }

    if (!isValid) return;
    setModalBtnLoading(true);

    try {
        const guestData = {
            nombre: nameInput.value.trim(),
            telefono: document.getElementById('g-telefono').value.trim(),
            correo: document.getElementById('g-correo').value.trim(),
            pases: parseInt(pasesInput.value, 10),
            mesa: document.getElementById('g-mesa').value.trim(),
            estado: document.getElementById('g-estado').value,
            tipoAcceso: document.getElementById('g-acceso').value,
            notas: document.getElementById('g-notas').value.trim(),
            confirmado: document.getElementById('g-estado').value.includes('Confirmado')
        };

        const guestsColRef = collection(db, `eventos/${currentEventId}/invitados`);

        if (currentEditingGuestId) {
            // Update
            const docRef = doc(db, `eventos/${currentEventId}/invitados`, currentEditingGuestId);
            await updateDoc(docRef, guestData);
            
            const idx = globalGuests.findIndex(g => g.firebaseId === currentEditingGuestId);
            if (idx > -1) globalGuests[idx] = { ...globalGuests[idx], ...guestData };
        } else {
            // Add - MÓDULO 6: Generación Automática
            guestData.id = generateGuestId();
            guestData.codigo = generateUniqueGuestCode();
            guestData.fechaRegistro = serverTimestamp();
            
            const existingTokens = globalGuests.map(g => g.token).filter(t => t);
            guestData.token = generateToken(existingTokens);
            guestData.urlInvitacion = generateInvitationURL(guestData.token);
            guestData.qrGenerado = generateQRCode(guestData.urlInvitacion);
            guestData.fechaGeneracion = serverTimestamp();
            guestData.estadoAcceso = 'Invitación generada';
            guestData.ultimoAcceso = null;
            
            const newDocRef = await addDoc(guestsColRef, guestData);
            guestData.fechaRegistro = { toMillis: () => Date.now() }; 
            globalGuests.push({ firebaseId: newDocRef.id, ...guestData });
            
            showToast('Invitación generada automáticamente.');
        }

        calculateAndUpdateStats();
        renderGuestsList();
        await syncParentStatsUI();
        closeModalElem(modalGuest);

    } catch (e) {
        console.error("Error guardando invitado:", e);
    } finally {
        setModalBtnLoading(false);
    }
}

async function executeDeleteGuest() {
    if(!guestToDeleteId) return;
    const originalText = btnConfirmDelete.textContent;
    btnConfirmDelete.textContent = "Eliminando...";
    btnConfirmDelete.disabled = true;

    try {
        const docRef = doc(db, `eventos/${currentEventId}/invitados`, guestToDeleteId);
        await deleteDoc(docRef);

        globalGuests = globalGuests.filter(g => g.firebaseId !== guestToDeleteId);
        calculateAndUpdateStats();
        renderGuestsList();
        await syncParentStatsUI();
        closeModalElem(modalConfirmDelete);
        showToast('Invitado y sus credenciales eliminadas.');
    } catch (e) {
        console.error("Error eliminando invitado", e);
    } finally {
        btnConfirmDelete.textContent = originalText;
        btnConfirmDelete.disabled = false;
        guestToDeleteId = null;
    }
}

// ============================================================================
// LÓGICA MÓDULO 6: MOTOR DIGITAL INVITACIONES
// ============================================================================

function initInvitationEvents() {
    btnCancelRegenerate.addEventListener('click', () => closeModalElem(modalConfirmRegenerate));
    btnConfirmRegenerate.addEventListener('click', executeRegenerateInvitation);
    
    btnCloseModalQr.addEventListener('click', () => closeModalElem(modalQrViewer));
    
    btnCopyLinkQr.addEventListener('click', () => {
        copyInvitation(currentQrUrlDownload, () => showToast('Enlace de invitación copiado.'));
    });
    
    btnDownloadQr.addEventListener('click', downloadQRImage);
}

async function executeRegenerateInvitation() {
    if(!guestToRegenerateId) return;
    const originalText = btnConfirmRegenerate.textContent;
    btnConfirmRegenerate.textContent = "Generando...";
    btnConfirmRegenerate.disabled = true;

    try {
        const existingTokens = globalGuests.map(g => g.token).filter(t => t);
        const newToken = generateToken(existingTokens);
        const newUrl = generateInvitationURL(newToken);
        const newQr = generateQRCode(newUrl);

        const updateData = {
            token: newToken,
            urlInvitacion: newUrl,
            qrGenerado: newQr,
            fechaGeneracion: serverTimestamp(),
            estadoAcceso: 'Regenerada'
        };

        const docRef = doc(db, `eventos/${currentEventId}/invitados`, guestToRegenerateId);
        await updateDoc(docRef, updateData);

        const idx = globalGuests.findIndex(g => g.firebaseId === guestToRegenerateId);
        if(idx > -1) {
            globalGuests[idx] = { ...globalGuests[idx], ...updateData };
        }

        renderGuestsList();
        closeModalElem(modalConfirmRegenerate);
        showToast('Invitación y credenciales regeneradas.', `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8E3CDB" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`);

    } catch(e) {
        console.error("Error regenerando:", e);
    } finally {
        btnConfirmRegenerate.textContent = originalText;
        btnConfirmRegenerate.disabled = false;
        guestToRegenerateId = null;
    }
}

function openQRModal(url, token) {
    currentQrUrlDownload = url;
    currentQrTokenDownload = token;
    
    qrViewerToken.textContent = token;
    qrViewerUrl.textContent = url;
    // Usar la API pública sin librerías externas para renderizar el PNG directamente.
    qrViewerImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(url)}`;
    
    openModalElem(modalQrViewer);
}

async function downloadQRImage() {
    const originalText = btnDownloadQr.innerHTML;
    btnDownloadQr.innerHTML = 'Descargando...';
    try {
        const response = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(currentQrUrlDownload)}`);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = `QR_${currentQrTokenDownload}.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
    } catch(e) {
        console.error("Error al descargar QR:", e);
        showToast("Error al descargar el archivo.");
    } finally {
        btnDownloadQr.innerHTML = originalText;
    }
}

// Control Modales
function openModalElem(modalEl) {
    modalEl.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModalElem(modalEl) {
    modalEl.classList.remove('active');
    document.body.style.overflow = '';
}

function setModalBtnLoading(isLoading) {
    const btnText = btnSubmitGuest.querySelector('.btn-text');
    const btnLoader = btnSubmitGuest.querySelector('.btn-loader');
    if (isLoading) {
        btnSubmitGuest.disabled = true;
        btnText.textContent = 'Guardando...';
        btnLoader.style.display = 'block';
        btnCancelModalGuest.disabled = true;
        btnCloseModalGuest.style.pointerEvents = 'none';
    } else {
        btnSubmitGuest.disabled = false;
        btnText.textContent = 'Guardar Invitado';
        btnLoader.style.display = 'none';
        btnCancelModalGuest.disabled = false;
        btnCloseModalGuest.style.pointerEvents = 'auto';
    }
}