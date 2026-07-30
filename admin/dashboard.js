// dashboard.js
// Lógica de Módulo 2: Experiencia SaaS Premium, Firestore y Animaciones

import { auth, db } from './firebase.js';
import { CONFIG } from './config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Referencias al DOM
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

// Utilidad: Animar números progresivamente
function animateValue(element, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // Easing easeOutQuart para un final muy suave
        const ease = 1 - Math.pow(1 - progress, 4);
        element.innerHTML = Math.floor(ease * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            element.innerHTML = end;
        }
    };
    window.requestAnimationFrame(step);
}

// Inicialización de la Interfaz y Eventos Base
function initUI() {
    if (uiLogo) uiLogo.src = CONFIG.LOGO;
    
    // Toggle Menú Desplegable
    userProfileTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        userProfileTrigger.classList.toggle('active');
    });

    // Cerrar menú al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!userProfileTrigger.contains(e.target)) {
            userProfileTrigger.classList.remove('active');
        }
    });

    // Cerrar sesión
    btnLogout.addEventListener('click', async (e) => {
        e.stopPropagation(); // Evitar doble disparo
        try { await signOut(auth); } 
        catch (error) { console.error("Error al cerrar sesión:", error); }
    });

    // Crear Evento Botón
    btnCreateEvent.addEventListener('click', () => {
        console.log("Crear Evento");
    });
}

// Generar Saludo Dinámico Premium
function renderWelcomeHero(user) {
    const hour = new Date().getHours();
    let greeting = 'Buenas noches';
    if (hour >= 5 && hour < 12) greeting = 'Buenos días';
    else if (hour >= 12 && hour < 19) greeting = 'Buenas tardes';

    // Determinar nombre, sin romper la regla de no modificar Firebase
    let userName = null;
    if (user.displayName) {
        userName = user.displayName.split(' ')[0]; // Primer nombre
    }

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
        // Extraer inicial del correo si no hay nombre
        const initial = user.email ? user.email.charAt(0).toUpperCase() : 'A';
        userAvatar.textContent = initial;
    }
}

// Control de Sesión y Carga Inicial
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = CONFIG.LOGOUT_REDIRECT;
    } else {
        // Remover guard y mostrar dashboard con transición fluida
        authGuard.style.opacity = '0';
        setTimeout(() => {
            authGuard.style.display = 'none';
            dashboardContent.style.visibility = 'visible';
            dashboardContent.style.opacity = '1';
        }, 600);

        initUI();
        renderWelcomeHero(user);
        loadDashboardData();
    }
});

// Obtener datos de Firestore y procesar
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

            // Calcular estadísticas globalmente
            const estado = data.estado ? data.estado.toLowerCase() : '';
            if (estado.includes('activo')) stats.activos++;
            
            const numInvitados = Number(data.invitados) || 0;
            const numConfirmados = Number(data.confirmados) || 0;
            
            stats.invitados += numInvitados;
            stats.confirmados += numConfirmados;
            stats.pendientes += (numInvitados - numConfirmados);
        });

        // Renderizado
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

// Renderizar Tarjetas de Estadísticas con Animación
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

    // Iniciar animaciones numéricas (800ms)
    animateValue(document.getElementById('num-activos'), 0, stats.activos, 800);
    animateValue(document.getElementById('num-invitados'), 0, stats.invitados, 800);
    animateValue(document.getElementById('num-confirmados'), 0, stats.confirmados, 800);
    animateValue(document.getElementById('num-pendientes'), 0, stats.pendientes, 800);
}

// Renderizar Estado Vacío Premium
function renderEmptyState() {
    eventsContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-illustration">${ICONS.empty}</div>
            <h3 class="empty-title">Aún no tienes eventos.</h3>
            <p class="empty-subtitle">Comienza creando tu primer evento para gestionar listas de invitados, asistencias y códigos de acceso.</p>
            <button class="btn-primary ripple" onclick="console.log('Crear Evento')">
                <span class="btn-icon">${ICONS.plus}</span>
                <span>Crear primer evento</span>
            </button>
        </div>
    `;
    eventsContainer.style.gridTemplateColumns = '1fr'; // Ocupar todo el ancho
}

// Utilidad: Formatear Fecha
function formatearFecha(fechaObj) {
    if (!fechaObj) return { dia: '--', mes: '---' };
    
    let fecha;
    if (fechaObj.toDate) fecha = fechaObj.toDate();
    else fecha = new Date(fechaObj);

    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return {
        dia: fecha.getDate().toString().padStart(2, '0'),
        mes: meses[fecha.getMonth()]
    };
}

// Utilidad: Formatear Estado para Badge
function formatearEstado(estadoTxt) {
    const estadoStr = estadoTxt ? estadoTxt.toString().toLowerCase() : 'borrador';
    if (estadoStr.includes('activo')) return { clase: 'activo', texto: 'Activo' };
    if (estadoStr.includes('finalizado')) return { clase: 'finalizado', texto: 'Finalizado' };
    return { clase: 'borrador', texto: 'Borrador' };
}

// Renderizar Tarjetas de Eventos Premium
function renderEvents(events) {
    eventsContainer.innerHTML = '';
    eventsContainer.style.gridTemplateColumns = ''; // Restaurar grid por defecto

    events.forEach((event, index) => {
        const fechaData = formatearFecha(event.fecha);
        const estadoBadge = formatearEstado(event.estado);
        const invitados = event.invitados || 0;
        const confirmados = event.confirmados || 0;
        const codigo = event.codigo || 'N/A';
        const ciudad = event.ciudad || 'Por definir';
        const nombre = event.nombre || 'Evento sin título';

        const card = document.createElement('div');
        card.className = 'event-card';
        // Añadir una leve animación de entrada escalonada si son muchos
        card.style.animation = `fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.05}s forwards`;
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

        // Asignar eventos de botones
        const btnManage = card.querySelector('.btn-manage');
        const btnDelete = card.querySelector('.btn-delete');

        btnManage.addEventListener('click', () => {
            console.log(btnManage.getAttribute('data-id'));
        });

        btnDelete.addEventListener('click', () => {
            console.log("Eliminar");
        });

        eventsContainer.appendChild(card);
    });
}