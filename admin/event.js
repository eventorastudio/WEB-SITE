// event.js
// Lógica de Módulos 4 y 5: Tablero de Evento y Gestión Avanzada de Invitados (SaaS)

import { auth, db } from './firebase.js';
import { CONFIG } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================================
// REFERENCIAS DOM (MÓDULO 4 Y GENERALES)
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

// ============================================================================
// REFERENCIAS DOM (MÓDULO 5 - INVITADOS)
// ============================================================================
let globalGuests = [];
let currentEditingGuestId = null;

// Toolbar
const searchInput = document.getElementById('guest-search');
const filterStatus = document.getElementById('guest-filter-status');
const filterTable = document.getElementById('guest-filter-table');
const sortSelect = document.getElementById('guest-sort');
const btnOpenAddGuest = document.getElementById('btn-open-add-guest');
const btnImportExcel = document.getElementById('btn-import-excel');
const btnEmptyAddGuest = document.getElementById('btn-empty-add-guest');

// Contenedores Invitados
const guestsList = document.getElementById('guests-list');
const guestsEmptyState = document.getElementById('guests-empty-state');

// Modal Guest (Formulario)
const modalGuest = document.getElementById('modal-guest');
const formGuest = document.getElementById('form-guest');
const btnCloseModalGuest = document.getElementById('btn-close-modal-guest');
const btnCancelModalGuest = document.getElementById('btn-cancel-modal-guest');
const btnSubmitGuest = document.getElementById('btn-submit-guest');
const modalGuestTitle = document.getElementById('modal-guest-title');

// Modal Delete Confirm
const modalConfirmDelete = document.getElementById('modal-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const deleteGuestName = document.getElementById('delete-guest-name');
let guestToDeleteId = null;

// Modal Feature Coming
const modalFeatureComing = document.getElementById('modal-feature-coming');
const btnCloseComing = document.getElementById('btn-close-coming');

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
    initGuestEvents(); // Inicializar Módulo 5

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

    document.getElementById('btn-edit-info').addEventListener('click', () => console.log("Editar Info Evento"));
    document.getElementById('btn-generate-qr-event').addEventListener('click', () => console.log("Generar QR Global"));
    document.getElementById('btn-delete-event').addEventListener('click', () => console.log("Eliminar Evento"));

    document.getElementById('btn-copy-url').addEventListener('click', () => {
        const urlInput = document.getElementById('val-url');
        urlInput.select();
        navigator.clipboard.writeText(urlInput.value).then(() => {
            const btn = document.getElementById('btn-copy-url');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E7E34" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => btn.innerHTML = originalHTML, 2000);
        });
    });

    document.getElementById('btn-open-invitation').addEventListener('click', () => {
        const url = document.getElementById('val-url').value;
        if(url && url.startsWith('http')) window.open(url, '_blank');
        else console.log("Abrir: " + url);
    });
}

async function fetchEventData(eventId) {
    try {
        const docRef = doc(db, 'eventos', eventId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentEventData = docSnap.data();
            
            // Cargar invitados (Módulo 5) ANTES de llenar datos para tener stats reales
            await fetchGuestsData();

            populateEventData();
            
            loadingView.style.display = 'none';
            mainView.style.display = 'block';
            setTimeout(() => mainView.style.opacity = '1', 50);

        } else {
            showError("Evento no encontrado.", "El evento que intentas administrar no existe o fue eliminado.");
        }
    } catch (error) {
        console.error("Error obteniendo evento:", error);
        showError("Error de conexión", "Ocurrió un problema al cargar los datos del evento.");
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

    // Header
    document.getElementById('val-nombre').textContent = nombre;
    document.getElementById('val-ciudad').textContent = ciudad;
    document.getElementById('val-fecha').textContent = fecha;
    const badgeInfo = formatearEstadoBadge(status);
    const badgeEl = document.getElementById('val-estado-badge');
    badgeEl.textContent = badgeInfo.texto;
    badgeEl.className = `badge ${badgeInfo.clase}`;

    // Tab Info
    document.getElementById('info-nombre').textContent = nombre;
    document.getElementById('info-tipo').textContent = tipo;
    document.getElementById('info-fecha').textContent = fecha;
    document.getElementById('info-hora').textContent = hora;
    document.getElementById('info-ubicacion').textContent = `${ciudad}, ${estadoLugar}, ${pais}`;
    document.getElementById('info-estado').textContent = badgeInfo.texto;
    document.getElementById('info-descripcion').textContent = descripcion;

    // Tab Invitación
    const baseUrl = window.location.origin;
    document.getElementById('val-url').value = `${baseUrl}/invitacion?code=${codigo}`;
    document.getElementById('inv-codigo').textContent = codigo;
    document.getElementById('inv-acceso').textContent = acceso;

    // Tab Config
    document.getElementById('conf-estado').textContent = badgeInfo.texto;
    document.getElementById('conf-acceso').textContent = acceso;
    document.getElementById('conf-codigo').textContent = codigo;
    document.getElementById('conf-clave').textContent = claveAcceso;

    // Las tarjetas y estadísticas se actualizan mediante syncParentStatsUI();
    syncParentStatsUI();
}

function animateProgressBar() {
    const data = currentEventData;
    const totalInv = Number(data.totalInvitados) || 0;
    const confirmados = Number(data.confirmados) || 0;
    
    let porcentaje = 0;
    if(totalInv > 0) porcentaje = Math.round((confirmados / totalInv) * 100);
    if(porcentaje > 100) porcentaje = 100;

    const lblPorcentaje = document.getElementById('stat-porcentaje');
    const barFill = document.getElementById('stat-progress-bar');
    barFill.style.width = '0%';
    
    setTimeout(() => {
        animateValue(lblPorcentaje, 0, porcentaje, 1000);
        lblPorcentaje.textContent = porcentaje + '%';
        barFill.style.width = porcentaje + '%';
    }, 100);
}


// ============================================================================
// LÓGICA MÓDULO 5: ADMINISTRACIÓN DE INVITADOS
// ============================================================================

function initGuestEvents() {
    // Abrir modal agregar
    btnOpenAddGuest.addEventListener('click', () => openGuestModal());
    btnEmptyAddGuest.addEventListener('click', () => openGuestModal());
    
    // Importar Excel (Coming soon)
    btnImportExcel.addEventListener('click', () => openModalElem(modalFeatureComing));
    btnCloseComing.addEventListener('click', () => closeModalElem(modalFeatureComing));

    // Toolbar Listeners
    searchInput.addEventListener('input', renderGuestsList);
    filterStatus.addEventListener('change', renderGuestsList);
    filterTable.addEventListener('change', renderGuestsList);
    sortSelect.addEventListener('change', renderGuestsList);

    // Modal Add/Edit
    btnCloseModalGuest.addEventListener('click', () => closeModalElem(modalGuest));
    btnCancelModalGuest.addEventListener('click', () => closeModalElem(modalGuest));
    btnSubmitGuest.addEventListener('click', saveGuest);
    
    // Validaciones form
    const inputs = formGuest.querySelectorAll('.form-control');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            input.classList.remove('input-error');
            const err = input.nextElementSibling;
            if(err && err.classList.contains('error-msg')) err.style.display = 'none';
        });
    });

    // Delete Modal
    btnCancelDelete.addEventListener('click', () => closeModalElem(modalConfirmDelete));
    btnConfirmDelete.addEventListener('click', executeDeleteGuest);
}

// ---- Obtener datos (Firestore Subcollection) ----
async function fetchGuestsData() {
    try {
        const guestsRef = collection(db, `eventos/${currentEventId}/invitados`);
        const snapshot = await getDocs(guestsRef);
        globalGuests = [];
        
        snapshot.forEach(doc => {
            globalGuests.push({ firebaseId: doc.id, ...doc.data() });
        });
        
        calculateAndUpdateStats();
        renderGuestsList();
    } catch (error) {
        console.error("Error cargando invitados:", error);
    }
}

// ---- Estadísticas y Sincronización ----
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
            stats.conf += pases; // El que llega, cuenta como confirmado en la bolsa total
        } 
        else stats.pend += pases; // Por defecto
    });

    // Actualizar UI Local Tab Invitados
    document.getElementById('g-stat-total').textContent = stats.totalInvitadosEntidad;
    document.getElementById('g-stat-conf').textContent = stats.conf;
    document.getElementById('g-stat-pend').textContent = stats.pend;
    document.getElementById('g-stat-no').textContent = stats.no;
    document.getElementById('g-stat-llegaron').textContent = stats.llegaron;

    // Sincronizar en Local Memory para el Evento Global
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
    
    // Actualizar Tarjetas Resumen Globales
    animateValue(document.getElementById('count-invitados'), 0, currentEventData.totalInvitados || 0, 800);
    animateValue(document.getElementById('count-confirmados'), 0, currentEventData.confirmados || 0, 800);
    animateValue(document.getElementById('count-pendientes'), 0, currentEventData.pendientes || 0, 800);
    animateValue(document.getElementById('count-llegadas'), 0, currentEventData.llegaron || 0, 800);

    // Actualizar Tab Estadísticas Globales
    document.getElementById('stat-total').textContent = currentEventData.totalInvitados || 0;
    document.getElementById('stat-confirmados').textContent = currentEventData.confirmados || 0;
    document.getElementById('stat-pendientes').textContent = currentEventData.pendientes || 0;
    document.getElementById('stat-noasiste').textContent = currentEventData.noAsisten || 0;
    document.getElementById('stat-llegadas').textContent = currentEventData.llegaron || 0;
    
    animateProgressBar();

    // Persistir en Firestore (Evento Padre)
    try {
        const eventRef = doc(db, 'eventos', currentEventId);
        await updateDoc(eventRef, {
            totalInvitados: currentEventData.totalInvitados,
            confirmados: currentEventData.confirmados,
            pendientes: currentEventData.pendientes,
            llegaron: currentEventData.llegaron
        });
    } catch (e) {
        console.error("No se pudo actualizar los stats en el documento padre", e);
    }
}

// ---- Renderizado de la Lista ----
function renderGuestsList() {
    let filtered = [...globalGuests];
    
    // Search
    const searchVal = searchInput.value.toLowerCase().trim();
    if (searchVal) {
        filtered = filtered.filter(g => 
            (g.nombre && g.nombre.toLowerCase().includes(searchVal)) ||
            (g.correo && g.correo.toLowerCase().includes(searchVal)) ||
            (g.telefono && g.telefono.includes(searchVal)) ||
            (g.codigo && g.codigo.toLowerCase().includes(searchVal))
        );
    }

    // Filter Status
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

    // Filter Table
    const tableVal = filterTable.value;
    if (tableVal !== 'all') {
        filtered = filtered.filter(g => {
            const hasTable = g.mesa && g.mesa.toString().trim() !== '';
            return tableVal === 'with' ? hasTable : !hasTable;
        });
    }

    // Sort
    const sortVal = sortSelect.value;
    filtered.sort((a, b) => {
        if (sortVal === 'name') return (a.nombre || '').localeCompare(b.nombre || '');
        if (sortVal === 'table') {
            const tA = parseInt(a.mesa) || 9999;
            const tB = parseInt(b.mesa) || 9999;
            return tA - tB;
        }
        if (sortVal === 'status') return (a.estado || '').localeCompare(b.estado || '');
        if (sortVal === 'date') return (b.fechaRegistro?.toMillis?.() || 0) - (a.fechaRegistro?.toMillis?.() || 0);
        return 0;
    });

    // Render HTML
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
                ${g.telefono ? `<div class="guest-info-row"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>${g.telefono}</div>` : ''}
                
                <div class="guest-code-box mt-10">
                    <span>Código de Acceso</span>
                    <strong>${g.codigo}</strong>
                </div>
            </div>

            <div class="guest-card-actions">
                <button class="btn-guest-action btn-edit-g" data-id="${g.firebaseId}" title="Editar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-guest-action btn-qr-g" title="Generar QR">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg>
                </button>
                <button class="btn-guest-action btn-link-g" data-code="${g.codigo}" title="Copiar enlace">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>
                <button class="btn-guest-action delete btn-del-g" data-id="${g.firebaseId}" data-name="${g.nombre}" title="Eliminar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;

        // Eventos Tarjeta
        card.querySelector('.btn-edit-g').addEventListener('click', () => openGuestModal(g));
        card.querySelector('.btn-qr-g').addEventListener('click', () => console.log("QR Invitado:", g.codigo));
        card.querySelector('.btn-del-g').addEventListener('click', (e) => {
            guestToDeleteId = e.currentTarget.getAttribute('data-id');
            deleteGuestName.textContent = e.currentTarget.getAttribute('data-name');
            openModalElem(modalConfirmDelete);
        });
        card.querySelector('.btn-link-g').addEventListener('click', (e) => {
            const code = e.currentTarget.getAttribute('data-code');
            const url = `${window.location.origin}/invitacion?code=${currentEventData.codigoEvento}&guest=${code}`;
            navigator.clipboard.writeText(url).then(() => {
                const btn = e.currentTarget;
                const origHtml = btn.innerHTML;
                btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E7E34" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                setTimeout(() => btn.innerHTML = origHtml, 2000);
            });
        });

        guestsList.appendChild(card);
    });
}

// ---- Helper Generadores ----
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

// ---- CRUD Invitados ----
function openGuestModal(guestData = null) {
    formGuest.reset();
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');

    if (guestData) {
        currentEditingGuestId = guestData.firebaseId;
        modalGuestTitle.textContent = "Editar Invitado";
        document.getElementById('g-doc-id').value = guestData.firebaseId;
        document.getElementById('g-internal-id').value = guestData.id || '';
        document.getElementById('g-unique-code').value = guestData.codigo || '';
        
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
        document.getElementById('g-internal-id').value = '';
        document.getElementById('g-unique-code').value = '';
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
            
            // Reflejar localmente
            const idx = globalGuests.findIndex(g => g.firebaseId === currentEditingGuestId);
            if (idx > -1) {
                globalGuests[idx] = { ...globalGuests[idx], ...guestData };
            }
        } else {
            // Add
            guestData.id = generateGuestId();
            guestData.codigo = generateUniqueGuestCode();
            guestData.fechaRegistro = serverTimestamp();
            
            const newDocRef = await addDoc(guestsColRef, guestData);
            
            // Reflejar localmente (simular timestamp para sort)
            guestData.fechaRegistro = { toMillis: () => Date.now() }; 
            globalGuests.push({ firebaseId: newDocRef.id, ...guestData });
        }

        // Refrescar vistas
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
    } catch (e) {
        console.error("Error eliminando invitado", e);
    } finally {
        btnConfirmDelete.textContent = originalText;
        btnConfirmDelete.disabled = false;
        guestToDeleteId = null;
    }
}

// ---- Control Modales Genérico ----
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