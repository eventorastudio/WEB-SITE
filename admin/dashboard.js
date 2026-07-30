// dashboard.js
// Lógica de Módulo 2: Estadísticas, Lectura de Firestore y Renderizado Premium

import { auth, db } from './firebase.js';
import { CONFIG } from './config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Referencias al DOM
const authGuard = document.getElementById('auth-guard');
const dashboardContent = document.getElementById('dashboard-content');
const uiLogo = document.getElementById('ui-logo');
const btnLogout = document.getElementById('btn-logout');
const userAvatar = document.getElementById('user-avatar');
const btnCreateEvent = document.getElementById('btn-create-event');
const statsContainer = document.getElementById('stats-container');
const eventsContainer = document.getElementById('events-container');

// Iconos SVG Premium (Inline para evitar librerías externas)
const ICONS = {
    calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
    users: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    clock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    empty: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M9 16l2 2 4-4"></path></svg>`,
    location: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
    code: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
};

// Inicialización de la Interfaz
function initUI() {
    if (uiLogo) uiLogo.src = CONFIG.LOGO;
    
    // Asignar eventos a botones estáticos
    btnLogout.addEventListener('click', async () => {
        try { await signOut(auth); } 
        catch (error) { console.error("Error al cerrar sesión:", error); }
    });

    btnCreateEvent.addEventListener('click', () => {
        console.log("Crear Evento");
    });
}

// Control de Sesión y Carga de Datos
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = CONFIG.LOGOUT_REDIRECT;
    } else {
        // Remover guard y mostrar dashboard con transición
        authGuard.style.opacity = '0';
        setTimeout(() => {
            authGuard.style.display = 'none';
            dashboardContent.style.visibility = 'visible';
            dashboardContent.style.opacity = '1';
        }, 500);

        // Configurar avatar
        const initial = user.email ? user.email.charAt(0).toUpperCase() : 'A';
        userAvatar.textContent = initial;

        initUI();
        loadDashboardData();
    }
});

// Función Principal: Cargar Estadísticas y Eventos
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

            // Calcular estadísticas
            if (data.estado && data.estado.toLowerCase() === 'activo') stats.activos++;
            
            const numInvitados = Number(data.invitados) || 0;
            const numConfirmados = Number(data.confirmados) || 0;
            
            stats.invitados += numInvitados;
            stats.confirmados += numConfirmados;
            stats.pendientes += (numInvitados - numConfirmados);
        });

        // Renderizar Interfaz
        renderStats(stats);

        if (eventsList.length === 0) {
            renderEmptyState();
        } else {
            renderEvents(eventsList);
        }

    } catch (error) {
        console.error("Error obteniendo datos de Firestore:", error);
        // En caso de error de lectura, limpiar skeletons para evitar bloqueo visual
        statsContainer.innerHTML = `<div class="stat-desc" style="grid-column: 1/-1; color: red;">Error al cargar estadísticas.</div>`;
        eventsContainer.innerHTML = `<div class="stat-desc" style="color: red;">Error al cargar eventos.</div>`;
    }
}

// Función: Renderizar Tarjetas de Estadísticas
function renderStats(stats) {
    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon">${ICONS.calendar}</div>
            <div class="stat-number">${stats.activos}</div>
            <div class="stat-title">Eventos Activos</div>
            <div class="stat-desc">En curso actualmente</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">${ICONS.users}</div>
            <div class="stat-number">${stats.invitados}</div>
            <div class="stat-title">Total Invitados</div>
            <div class="stat-desc">Registrados en la plataforma</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">${ICONS.check}</div>
            <div class="stat-number">${stats.confirmados}</div>
            <div class="stat-title">Confirmados</div>
            <div class="stat-desc">Asistencia asegurada</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">${ICONS.clock}</div>
            <div class="stat-number">${stats.pendientes}</div>
            <div class="stat-title">Pendientes</div>
            <div class="stat-desc">Aún sin confirmar</div>
        </div>
    `;
}

// Función: Renderizar Estado Vacío
function renderEmptyState() {
    eventsContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">${ICONS.empty}</div>
            <h3 class="empty-title">Aún no tienes eventos.</h3>
            <p class="empty-subtitle">Comienza creando tu primer evento para gestionar a tus invitados.</p>
            <button class="btn-primary" onclick="console.log('Crear Evento')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Crear Evento
            </button>
        </div>
    `;
}

// Función: Formatear Fecha
function formatearFecha(fechaObj) {
    if (!fechaObj) return { dia: '--', mes: '---' };
    
    let fecha;
    // Manejo de Timestamp de Firestore
    if (fechaObj.toDate) {
        fecha = fechaObj.toDate();
    } else {
        fecha = new Date(fechaObj);
    }

    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return {
        dia: fecha.getDate().toString().padStart(2, '0'),
        mes: meses[fecha.getMonth()]
    };
}

// Función: Formatear Estado para Badge
function formatearEstado(estadoTxt) {
    const estadoStr = estadoTxt ? estadoTxt.toString().toLowerCase() : 'borrador';
    if (estadoStr.includes('activo')) return { clase: 'activo', texto: 'Activo' };
    if (estadoStr.includes('finalizado')) return { clase: 'finalizado', texto: 'Finalizado' };
    return { clase: 'borrador', texto: 'Borrador' };
}

// Función: Renderizar Lista de Eventos
function renderEvents(events) {
    eventsContainer.innerHTML = '';

    events.forEach(event => {
        const fechaData = formatearFecha(event.fecha);
        const estadoBadge = formatearEstado(event.estado);
        const invitados = event.invitados || 0;
        const confirmados = event.confirmados || 0;
        const codigo = event.codigo || 'N/A';
        const ciudad = event.ciudad || 'Ciudad no especificada';
        const nombre = event.nombre || 'Evento sin título';

        // Crear contenedor de la fila
        const row = document.createElement('div');
        row.className = 'event-row';

        row.innerHTML = `
            <div class="event-main-info">
                <div class="event-date-box">
                    <div class="event-date-day">${fechaData.dia}</div>
                    <div class="event-date-month">${fechaData.mes}</div>
                </div>
                <div class="event-details">
                    <h3 class="event-name">${nombre}</h3>
                    <div class="event-meta">
                        <span class="event-meta-item">
                            ${ICONS.location} ${ciudad}
                        </span>
                        <span class="event-meta-item">
                            ${ICONS.code} ${codigo}
                        </span>
                    </div>
                </div>
            </div>
            
            <div class="event-stats-info">
                <div class="event-stat-text">Invitados: <span>${invitados}</span></div>
                <div class="event-stat-text">Confirmados: <span>${confirmados}</span></div>
            </div>

            <div class="event-status">
                <span class="badge ${estadoBadge.clase}">${estadoBadge.texto}</span>
            </div>

            <div class="event-actions">
                <button class="btn-action btn-manage" data-id="${event.id}">Administrar</button>
                <button class="btn-action btn-delete">Eliminar</button>
            </div>
        `;

        // Asignar eventos a los botones generados
        const btnManage = row.querySelector('.btn-manage');
        const btnDelete = row.querySelector('.btn-delete');

        btnManage.addEventListener('click', () => {
            console.log(btnManage.getAttribute('data-id'));
        });

        btnDelete.addEventListener('click', () => {
            console.log("Eliminar");
        });

        eventsContainer.appendChild(row);
    });
}