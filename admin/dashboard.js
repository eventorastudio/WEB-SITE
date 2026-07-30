// dashboard.js
// Lógica de Módulo 2 y 3: Experiencia SaaS, Firestore, Animaciones y Creación de Eventos

import { auth, db } from './firebase.js';
import { CONFIG } from './config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================================
// REFERENCIAS DOM (MÓDULO 2)
// ============================================================================
const authGuard = document.getElementById('auth-guard');
const dashboardContent = document.getElementById('dashboard-content');
const uiLogo = document.getElementById('ui-logo');
const btnLogout = document.getElementById('btn-logout');
const userProfileTrigger = document.getElementById('user-profile-trigger');
const displayUserName = document.getElementById('display-user-name');
const userAvatar = document.getElementById('user-avatar');
const welcomeSection = document.getElementById('welcome-section');
const btnCreateEvent = document.getElementById('btn-create-event');
const statsContainer = document.getElementById('stats-container');
const eventsContainer = document.getElementById('events-container');

// ============================================================================
// REFERENCIAS DOM (MÓDULO 3 - MODAL)
// ============================================================================
const modalCreateEvent = document.getElementById('modal-create-event');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const formCreateEvent = document.getElementById('form-create-event');
const btnSubmitEvent = document.getElementById('btn-submit-event');
const uploadArea = document.getElementById('upload-area');
const inputPortada = document.getElementById('evt-portada');
const uploadPreview = document.getElementById('upload-preview');

// Elementos de colores (Sincronización visual)
const colorPrimario = document.getElementById('evt-color-primario');
const valColorPrimario = document.getElementById('val-color-primario');
const colorSecundario = document.getElementById('evt-color-secundario');
const valColorSecundario = document.getElementById('val-color-secundario');

// Variable para guardar el nombre de la imagen localmente (por ahora)
let fileNamePortada = '';

// Iconos SVG Inline Premium
const ICONS = {
    calendar: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
    users: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    check: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    clock: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    empty: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M9 16l2 2 4-4"></path></svg>`,
    location: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
    code: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
};

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

// ============================================================================
// INICIALIZACIÓN MÓDULO 2 (DASHBOARD)
// ============================================================================
function initUI() {
    if (uiLogo) uiLogo.src = CONFIG.LOGO;
    
    userProfileTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        userProfileTrigger.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!userProfileTrigger.contains(e.target)) {
            userProfileTrigger.classList.remove('active');
        }
    });

    btnLogout.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { await signOut(auth); } 
        catch (error) { console.error("Error al cerrar sesión:", error); }
    });

    // Abrir modal de nuevo evento
    btnCreateEvent.addEventListener('click', openModal);
}

function renderWelcomeHero(user) {
    const hour = new Date().getHours();
    let greeting = 'Buenas noches';
    if (hour >= 5 && hour < 12) greeting = 'Buenos días';
    else if (hour >= 12 && hour < 19) greeting = 'Buenas tardes';

    let userName = user.displayName ? user.displayName.split(' ')[0] : null;

    if (userName) {
        welcomeSection.innerHTML = `
            <h1 class="welcome-title">${greeting}. <strong>${userName}.</strong></h1>
            <p class="welcome-subtitle">Administra todos tus eventos desde un solo lugar.</p>
        `;
        displayUserName.textContent = userName;
        userAvatar.textContent = userName.charAt(0).toUpperCase();
    } else {
        welcomeSection.innerHTML = `
            <h1 class="welcome-title"><strong>Bienvenido nuevamente.</strong></h1>
            <p class="welcome-subtitle">Administra todos tus eventos desde un solo lugar.</p>
        `;
        displayUserName.textContent = "Administrador";
        const initial = user.email ? user.email.charAt(0).toUpperCase() : 'A';
        userAvatar.textContent = initial;
    }
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = CONFIG.LOGOUT_REDIRECT;
    } else {
        authGuard.style.opacity = '0';
        setTimeout(() => {
            authGuard.style.display = 'none';
            dashboardContent.style.visibility = 'visible';
            dashboardContent.style.opacity = '1';
        }, 600);

        initUI();
        initModalEvents(); // Inicializa eventos del Módulo 3
        renderWelcomeHero(user);
        loadDashboardData();
    }
});

async function loadDashboardData() {
    try {
        const eventosRef = collection(db, 'eventos');
        const q = query(eventosRef, orderBy('fecha', 'desc'));
        const snapshot = await getDocs(q);

        const eventsList = [];
        let stats = { activos: 0, invitados: 0, confirmados: 0, pendientes: 0 };

        snapshot.forEach(doc => {
            const data = doc.data();
            const eventData = { id: doc.id, ...data };
            eventsList.push(eventData);

            const estado = data.estadoEvento ? data.estadoEvento.toLowerCase() : (data.estado ? data.estado.toLowerCase() : '');
            if (estado.includes('activo')) stats.activos++;
            
            const numInvitados = Number(data.totalInvitados) || Number(data.invitados) || 0;
            const numConfirmados = Number(data.confirmados) || 0;
            
            stats.invitados += numInvitados;
            stats.confirmados += numConfirmados;
            stats.pendientes += (numInvitados - numConfirmados);
        });

        renderStats(stats);

        if (eventsList.length === 0) {
            renderEmptyState();
        } else {
            renderEvents(eventsList);
        }

    } catch (error) {
        console.error("Error obteniendo datos de Firestore:", error);
        statsContainer.innerHTML = `<div class="stat-title" style="grid-column: 1/-1; color: #D32F2F;">Error de conexión. Recarga la página.</div>`;
        eventsContainer.innerHTML = ``;
    }
}

function renderStats(stats) {
    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon">${ICONS.calendar}</div>
            <div class="stat-number" id="num-activos">0</div>
            <div class="stat-title">Eventos Activos</div>
            <div class="stat-desc">En curso actualmente</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">${ICONS.users}</div>
            <div class="stat-number" id="num-invitados">0</div>
            <div class="stat-title">Total Invitados</div>
            <div class="stat-desc">Registrados en la plataforma</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">${ICONS.check}</div>
            <div class="stat-number" id="num-confirmados">0</div>
            <div class="stat-title">Confirmados</div>
            <div class="stat-desc">Asistencia asegurada</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">${ICONS.clock}</div>
            <div class="stat-number" id="num-pendientes">0</div>
            <div class="stat-title">Pendientes</div>
            <div class="stat-desc">Aún sin confirmar</div>
        </div>
    `;

    animateValue(document.getElementById('num-activos'), 0, stats.activos, 800);
    animateValue(document.getElementById('num-invitados'), 0, stats.invitados, 800);
    animateValue(document.getElementById('num-confirmados'), 0, stats.confirmados, 800);
    animateValue(document.getElementById('num-pendientes'), 0, stats.pendientes, 800);
}

function renderEmptyState() {
    eventsContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-illustration">${ICONS.empty}</div>
            <h3 class="empty-title">Aún no tienes eventos.</h3>
            <p class="empty-subtitle">Comienza creando tu primer evento para gestionar listas de invitados, asistencias y códigos de acceso.</p>
            <button class="btn-primary ripple" onclick="document.getElementById('btn-create-event').click()">
                <span class="btn-icon">${ICONS.plus}</span>
                <span>Crear primer evento</span>
            </button>
        </div>
    `;
    eventsContainer.style.gridTemplateColumns = '1fr';
}

function formatearFecha(fechaObj) {
    if (!fechaObj) return { dia: '--', mes: '---' };
    let fecha;
    // Si viene como string 'YYYY-MM-DD' del nuevo form
    if (typeof fechaObj === 'string') {
        const partes = fechaObj.split('-');
        if(partes.length === 3) fecha = new Date(partes[0], partes[1] - 1, partes[2]);
        else fecha = new Date(fechaObj);
    } 
    else if (fechaObj.toDate) fecha = fechaObj.toDate();
    else fecha = new Date(fechaObj);

    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return {
        dia: fecha.getDate().toString().padStart(2, '0'),
        mes: meses[fecha.getMonth()]
    };
}

function formatearEstado(estadoTxt) {
    const estadoStr = estadoTxt ? estadoTxt.toString().toLowerCase() : 'borrador';
    if (estadoStr.includes('activo')) return { clase: 'activo', texto: 'Activo' };
    if (estadoStr.includes('finalizado')) return { clase: 'finalizado', texto: 'Finalizado' };
    return { clase: 'borrador', texto: 'Borrador' };
}

function renderEvents(events) {
    eventsContainer.innerHTML = '';
    eventsContainer.style.gridTemplateColumns = '';

    events.forEach((event, index) => {
        const fechaData = formatearFecha(event.fecha);
        // Compatibilidad hacia atrás con data existente y la nueva (estadoEvento)
        const estadoBadge = formatearEstado(event.estadoEvento || event.estado);
        const invitados = event.totalInvitados || event.invitados || 0;
        const confirmados = event.confirmados || 0;
        const codigo = event.codigoEvento || event.codigo || 'N/A';
        const ciudad = event.ciudad || 'Por definir';
        const nombre = event.nombreEvento || event.nombre || 'Evento sin título';

        const card = document.createElement('div');
        card.className = 'event-card';
        card.style.animation = `fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(index * 0.05, 0.5)}s forwards`;
        card.style.opacity = '0';

        card.innerHTML = `
            <div class="event-card-header">
                <span class="badge ${estadoBadge.clase}">${estadoBadge.texto}</span>
                <div class="event-date">
                    ${fechaData.dia} <span>${fechaData.mes}</span>
                </div>
            </div>
            
            <div class="event-card-body">
                <h3 class="event-name">${nombre}</h3>
                <div class="event-meta">
                    <div class="meta-item">
                        ${ICONS.location}
                        <span>${ciudad}</span>
                    </div>
                    <div class="meta-item">
                        ${ICONS.code}
                        <span>${codigo}</span>
                    </div>
                </div>
            </div>

            <div class="event-stats">
                <div class="event-stat-box">
                    <div class="stat-box-num">${invitados}</div>
                    <div class="stat-box-label">Invitados</div>
                </div>
                <div class="event-stat-box">
                    <div class="stat-box-num">${confirmados}</div>
                    <div class="stat-box-label">Confirmados</div>
                </div>
            </div>

            <div class="event-card-footer">
                <button class="btn-card btn-manage" data-id="${event.id}">
                    ${ICONS.settings} Administrar
                </button>
                <button class="btn-card delete btn-delete">
                    ${ICONS.trash} Eliminar
                </button>
            </div>
        `;

        const btnManage = card.querySelector('.btn-manage');
        const btnDelete = card.querySelector('.btn-delete');

        btnManage.addEventListener('click', () => {
            const eventId = btnManage.getAttribute('data-id');
            window.location.href = `event.html?id=${eventId}`;
        });
        btnDelete.addEventListener('click', () => { console.log("Eliminar"); });

        eventsContainer.appendChild(card);
    });
}

// ============================================================================
// LÓGICA MÓDULO 3 (CREACIÓN DE EVENTOS)
// ============================================================================

function initModalEvents() {
    // Cerrar Modal
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);
    
    // Cerrar al clickear afuera
    modalCreateEvent.addEventListener('click', (e) => {
        if (e.target === modalCreateEvent) closeModal();
    });

    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalCreateEvent.classList.contains('active')) {
            closeModal();
        }
    });

    // Sincronizar UI de Color Pickers
    colorPrimario.addEventListener('input', (e) => valColorPrimario.textContent = e.target.value.toUpperCase());
    colorSecundario.addEventListener('input', (e) => valColorSecundario.textContent = e.target.value.toUpperCase());

    // Manejo de Portada (Previsualización)
    inputPortada.addEventListener('change', handleImagePreview);
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--color-gold)';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--color-border)';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--color-border)';
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            inputPortada.files = e.dataTransfer.files;
            handleImagePreview();
        }
    });

    // Limpiar errores on input
    const inputs = formCreateEvent.querySelectorAll('.form-control');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            input.classList.remove('input-error');
            const errorSpan = input.nextElementSibling;
            if(errorSpan && errorSpan.classList.contains('error-msg')) {
                errorSpan.style.display = 'none';
            }
        });
    });

    // Envío de Formulario
    btnSubmitEvent.addEventListener('click', submitNewEvent);
}

function openModal() {
    modalCreateEvent.classList.add('active');
    document.body.style.overflow = 'hidden'; // Evitar scroll de fondo
    dashboardContent.style.filter = 'blur(4px)'; // Blur extra al dashboard
}

function closeModal() {
    modalCreateEvent.classList.remove('active');
    document.body.style.overflow = '';
    dashboardContent.style.filter = 'none';
    setTimeout(resetForm, 400); // Esperar animación
}

function resetForm() {
    formCreateEvent.reset();
    
    // Resetear custom UI
    valColorPrimario.textContent = '#D4AF37';
    valColorSecundario.textContent = '#111111';
    
    // Resetear imagen
    fileNamePortada = '';
    uploadPreview.style.display = 'none';
    uploadPreview.style.backgroundImage = 'none';
    
    // Limpiar errores
    const inputs = formCreateEvent.querySelectorAll('.form-control');
    inputs.forEach(input => {
        input.classList.remove('input-error');
        const errorSpan = input.nextElementSibling;
        if(errorSpan && errorSpan.classList.contains('error-msg')) {
            errorSpan.style.display = 'none';
        }
    });
}

function handleImagePreview() {
    if (inputPortada.files && inputPortada.files[0]) {
        const file = inputPortada.files[0];
        fileNamePortada = file.name; // Guardamos el nombre tal como solicita el módulo
        
        const reader = new FileReader();
        reader.onload = function(e) {
            uploadPreview.style.backgroundImage = `url(${e.target.result})`;
            uploadPreview.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
}

async function generateEventCode() {
    // Generar formato EVT-XXXX basado en el último registrado
    let nextNum = 1;
    const eventosRef = collection(db, 'eventos');
    const q = query(eventosRef, orderBy('codigoEvento', 'desc'), limit(1));
    
    const snap = await getDocs(q);
    if (!snap.empty) {
        const lastCode = snap.docs[0].data().codigoEvento;
        if (lastCode && lastCode.startsWith('EVT-')) {
            const numPart = parseInt(lastCode.replace('EVT-', ''), 10);
            if (!isNaN(numPart)) nextNum = numPart + 1;
        }
    }
    return `EVT-${String(nextNum).padStart(4, '0')}`;
}

function generateAccessKey() {
    // Generar clave formato XXXX-XXXX (8 caracteres + guion, pero se pidieron 8 chars. Ej: Q8R4XP2K. Generaré Q8R4-XP2K por el ejemplo del prompt).
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const gen = () => Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${gen()}-${gen()}`; // Total 9 caracteres (con guion), cumple visualmente con el ejemplo solicitado.
}

function validateForm() {
    const required = [
        { id: 'evt-nombre', msg: 'Ingresa el nombre del evento.' },
        { id: 'evt-tipo', msg: 'Selecciona un tipo.' },
        { id: 'evt-pais', msg: 'Requerido.' },
        { id: 'evt-estado-lugar', msg: 'Requerido.' },
        { id: 'evt-ciudad', msg: 'Requerido.' },
        { id: 'evt-fecha', msg: 'Selecciona una fecha.' },
        { id: 'evt-hora', msg: 'Selecciona la hora.' }
    ];

    let isValid = true;

    required.forEach(field => {
        const el = document.getElementById(field.id);
        if (!el.value || el.value.trim() === '') {
            isValid = false;
            el.classList.add('input-error');
            const errorSpan = el.nextElementSibling;
            if (errorSpan && errorSpan.classList.contains('error-msg')) {
                errorSpan.textContent = field.msg;
                errorSpan.style.display = 'block';
            }
        }
    });

    return isValid;
}

function setBtnLoading(isLoading) {
    const btnText = btnSubmitEvent.querySelector('.btn-text');
    const btnLoader = btnSubmitEvent.querySelector('.btn-loader');
    
    if (isLoading) {
        btnSubmitEvent.disabled = true;
        btnText.textContent = 'Creando evento...';
        btnLoader.style.display = 'block';
        btnCancelModal.disabled = true;
        btnCloseModal.style.pointerEvents = 'none';
    } else {
        btnSubmitEvent.disabled = false;
        btnText.textContent = 'Crear Evento';
        btnLoader.style.display = 'none';
        btnCancelModal.disabled = false;
        btnCloseModal.style.pointerEvents = 'auto';
    }
}

async function submitNewEvent(e) {
    e.preventDefault();
    
    if (!validateForm()) return;

    setBtnLoading(true);

    try {
        const user = auth.currentUser;
        
        // Generar IDs
        const codigoEvento = await generateEventCode();
        const claveAcceso = generateAccessKey();
        
        // Obtener valores
        const maxInvitadosStr = document.getElementById('evt-invitados').value;
        const totalInvitadosNum = maxInvitadosStr ? parseInt(maxInvitadosStr, 10) : 0;

        const newEvent = {
            codigoEvento: codigoEvento,
            claveAcceso: claveAcceso,
            nombreEvento: document.getElementById('evt-nombre').value.trim(),
            tipoEvento: document.getElementById('evt-tipo').value,
            fecha: document.getElementById('evt-fecha').value,
            hora: document.getElementById('evt-hora').value,
            pais: document.getElementById('evt-pais').value.trim(),
            estado: document.getElementById('evt-estado-lugar').value.trim(),
            ciudad: document.getElementById('evt-ciudad').value.trim(),
            descripcion: document.getElementById('evt-descripcion').value.trim(),
            portada: fileNamePortada,
            tipoAcceso: document.getElementById('evt-acceso').value,
            estadoEvento: document.getElementById('evt-estado').value,
            colorPrimario: colorPrimario.value,
            colorSecundario: colorSecundario.value,
            // Estadísticas iniciales
            totalInvitados: totalInvitadosNum,
            confirmados: 0,
            pendientes: totalInvitadosNum,
            llegaron: 0,
            // Metadatos
            fechaCreacion: serverTimestamp(),
            fechaActualizacion: serverTimestamp(),
            administrador: user ? user.uid : 'Desconocido'
        };

        // Guardar en Firestore
        const docRef = await addDoc(collection(db, 'eventos'), newEvent);
        
        /* 
         * ARQUITECTURA MÓDULOS FUTUROS: 
         * Referencias a subcolecciones preparadas.
         * En Firestore no se crean documentos vacíos para subcolecciones,
         * basta con hacer referencia a la ruta cuando se necesiten.
         * 
         * const invitadosRef = collection(db, 'eventos', docRef.id, 'invitados');
         * const configRef = collection(db, 'eventos', docRef.id, 'configuracion');
         * const statsRef = collection(db, 'eventos', docRef.id, 'estadisticas');
         */

        // Éxito: Cerrar modal y recargar UI dinámicamente
        closeModal();
        await loadDashboardData(); // Refresca lista y stats sin location.reload()

    } catch (error) {
        console.error("Error al crear evento:", error);
        // Opcional: Mostrar error en el UI
        const mainError = document.createElement('span');
        mainError.className = 'error-msg';
        mainError.textContent = 'Ocurrió un error al guardar. Intenta nuevamente.';
        mainError.style.display = 'block';
        mainError.style.textAlign = 'right';
        mainError.style.marginTop = '10px';
        
        const footer = document.querySelector('.modal-footer');
        if(!footer.querySelector('.error-msg')) {
            footer.insertBefore(mainError, btnSubmitEvent);
        }
    } finally {
        setBtnLoading(false);
    }
}