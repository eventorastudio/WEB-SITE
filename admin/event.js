// event.js
// Lógica de Módulo 4: Centro de Administración de Evento (Tab-based, Firestore)

import { auth, db } from './firebase.js';
import { CONFIG } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Referencias Vistas
const authGuard = document.getElementById('auth-guard');
const loadingView = document.getElementById('loading-view');
const errorView = document.getElementById('error-view');
const mainView = document.getElementById('main-view');

// Referencias UI Header
const uiLogo = document.getElementById('ui-logo');
const btnBack = document.getElementById('btn-back');
const btnEditInfo = document.getElementById('btn-edit-info');

// Referencias Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Variable Global del Evento Actual
let currentEventData = null;
let currentEventId = null;

// ============================================================================
// UTILIDADES
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

    const opciones = { day: 'numeric', month: 'long', year: 'numeric' };
    return fecha.toLocaleDateString('es-ES', opciones);
}

function formatearEstadoBadge(estadoTxt) {
    const estadoStr = estadoTxt ? estadoTxt.toString().toLowerCase() : 'borrador';
    if (estadoStr.includes('activo')) return { clase: 'activo', texto: 'Activo' };
    if (estadoStr.includes('finalizado')) return { clase: 'finalizado', texto: 'Finalizado' };
    return { clase: 'borrador', texto: 'Borrador' };
}

// ============================================================================
// INICIALIZACIÓN Y NAVEGACIÓN
// ============================================================================
function initUI() {
    if (uiLogo) uiLogo.src = CONFIG.LOGO;
    
    // Botón Volver
    btnBack.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });

    // Lógica de Pestañas
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            
            // Remover active de todos los botones y paneles
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Agregar active al seleccionado
            btn.classList.add('active');
            document.getElementById(`tab-${targetId}`).classList.add('active');
            
            // Si la pestaña es estadísticas, re-animar la barra
            if(targetId === 'estadisticas' && currentEventData) {
                animateProgressBar(currentEventData);
            }
        });
    });

    // Lógica Botones Placeholder (Módulos Futuros)
    btnEditInfo.addEventListener('click', () => console.log("Editar"));
    document.getElementById('btn-import-guests').addEventListener('click', () => console.log("Importar invitados"));
    document.getElementById('btn-add-guest').addEventListener('click', () => console.log("Agregar invitado"));
    document.getElementById('btn-generate-qr').addEventListener('click', () => console.log("Generar QR"));
    document.getElementById('btn-delete-event').addEventListener('click', () => console.log("Eliminar"));

    // Copiar URL de Invitación
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

    // Abrir Invitación
    document.getElementById('btn-open-invitation').addEventListener('click', () => {
        const url = document.getElementById('val-url').value;
        if(url && url.startsWith('http')) {
            window.open(url, '_blank');
        } else {
            console.log("Abrir invitación: " + url);
        }
    });
}

// ============================================================================
// CARGA DE DATOS DE FIRESTORE
// ============================================================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = CONFIG.LOGOUT_REDIRECT;
        return;
    }
    
    authGuard.style.opacity = '0';
    setTimeout(() => authGuard.style.display = 'none', 600);
    
    initUI();

    // Obtener ID de la URL
    const urlParams = new URLSearchParams(window.location.search);
    currentEventId = urlParams.get('id');

    if (!currentEventId) {
        showError("Falta el ID del evento", "No se proporcionó un identificador válido en la URL.");
        return;
    }

    await fetchEventData(currentEventId);
});

async function fetchEventData(eventId) {
    try {
        const docRef = doc(db, 'eventos', eventId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentEventData = docSnap.data();
            populateData(currentEventData);
            
            // Transición a la vista principal
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

// ============================================================================
// INYECCIÓN DE DATOS EN EL DOM
// ============================================================================
function populateData(data) {
    
    // Variables consolidadas (soportan legacy y nueva estructura)
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

    // Estadísticas
    const totalInv = Number(data.totalInvitados) || Number(data.invitados) || 0;
    const confirmados = Number(data.confirmados) || 0;
    const pendientes = Number(data.pendientes) || (totalInv - confirmados);
    const llegadas = Number(data.llegaron) || Number(data.llegadas) || 0;

    // --- HEADER ---
    document.getElementById('val-nombre').textContent = nombre;
    document.getElementById('val-ciudad').textContent = ciudad;
    document.getElementById('val-fecha').textContent = fecha;
    
    const badgeInfo = formatearEstadoBadge(status);
    const badgeEl = document.getElementById('val-estado-badge');
    badgeEl.textContent = badgeInfo.texto;
    badgeEl.className = `badge ${badgeInfo.clase}`;

    // --- TARJETAS RESUMEN (Animadas) ---
    animateValue(document.getElementById('count-invitados'), 0, totalInv, 800);
    animateValue(document.getElementById('count-confirmados'), 0, confirmados, 800);
    animateValue(document.getElementById('count-pendientes'), 0, pendientes, 800);
    animateValue(document.getElementById('count-llegadas'), 0, llegadas, 800);

    // --- TAB: INFORMACIÓN ---
    document.getElementById('info-nombre').textContent = nombre;
    document.getElementById('info-tipo').textContent = tipo;
    document.getElementById('info-fecha').textContent = fecha;
    document.getElementById('info-hora').textContent = hora;
    document.getElementById('info-ubicacion').textContent = `${ciudad}, ${estadoLugar}, ${pais}`;
    document.getElementById('info-estado').textContent = badgeInfo.texto;
    document.getElementById('info-descripcion').textContent = descripcion;

    // --- TAB: INVITACIÓN ---
    // Simulación de URL basada en el ID del evento (Para módulos futuros de Landing)
    const baseUrl = window.location.origin;
    const inviteUrl = `${baseUrl}/invitacion?code=${codigo}`;
    document.getElementById('val-url').value = inviteUrl;
    document.getElementById('inv-codigo').textContent = codigo;
    document.getElementById('inv-acceso').textContent = acceso;

    // --- TAB: ESTADÍSTICAS ---
    document.getElementById('stat-total').textContent = totalInv;
    document.getElementById('stat-confirmados').textContent = confirmados;
    document.getElementById('stat-pendientes').textContent = pendientes;
    document.getElementById('stat-llegadas').textContent = llegadas;
    // La barra se anima al hacer click en el tab, pero la inicializamos si es el tab por defecto
    
    // --- TAB: CONFIGURACIÓN ---
    document.getElementById('conf-estado').textContent = badgeInfo.texto;
    document.getElementById('conf-acceso').textContent = acceso;
    document.getElementById('conf-codigo').textContent = codigo;
    document.getElementById('conf-clave').textContent = claveAcceso;
}

function animateProgressBar(data) {
    const totalInv = Number(data.totalInvitados) || Number(data.invitados) || 0;
    const confirmados = Number(data.confirmados) || 0;
    
    let porcentaje = 0;
    if(totalInv > 0) {
        porcentaje = Math.round((confirmados / totalInv) * 100);
    }
    // Límite de seguridad
    if(porcentaje > 100) porcentaje = 100;

    const lblPorcentaje = document.getElementById('stat-porcentaje');
    const barFill = document.getElementById('stat-progress-bar');

    // Resetear para re-animar
    barFill.style.width = '0%';
    
    setTimeout(() => {
        animateValue(lblPorcentaje, 0, porcentaje, 1000);
        lblPorcentaje.textContent = porcentaje + '%';
        barFill.style.width = porcentaje + '%';
    }, 100);
}