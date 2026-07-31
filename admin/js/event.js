// event.js
// ORQUESTADOR PRINCIPAL DEL EVENTO
// Responsabilidad: Controlar el flujo de la vista, autenticación, obtención de datos base y coordinación de submódulos.

import { auth, db } from './firebase.js';
import { CONFIG } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================================
// IMPORTACIÓN DE MÓDULOS DEL CORE (NUEVO)
// ============================================================================
import { state, setEventId, setEventData } from './core/state.js';
import { ui } from './core/ui.js';
import { helpers } from './core/helpers.js';

// ============================================================================
// IMPORTACIÓN DE MÓDULOS EXISTENTES
// ============================================================================
import { initExcelImport } from './excel-import.js';
import { initEditor } from './invitation-editor.js';
import { copyInvitation } from './invitation-utils.js';

/*
===============================================================================
 COMENTARIO DE ARQUITECTURA: MÓDULOS FALTANTES
===============================================================================
 Para cumplir con la directiva de mantener este archivo ÚNICAMENTE como 
 orquestador, se detecta que la lógica de los siguientes elementos aún no 
 existe en archivos independientes. 

 Idealmente, se deberían importar así:
 
 import { initGuestsManager, fetchGuestsData } from './guests-manager.js';
 import { initStatsUI, updateGlobalStats } from './stats-engine.js';
 import { initSettingsManager } from './event-settings.js';
 import { initQRModals } from './qr-viewer-ui.js';
===============================================================================
*/

// ============================================================================
// REFERENCIAS DOM PRINCIPALES (Flujo de vistas y Tabs)
// ============================================================================
const authGuard = document.getElementById('auth-guard');
const loadingView = document.getElementById('loading-view');
const errorView = document.getElementById('error-view');
const mainView = document.getElementById('main-view');

const uiLogo = document.getElementById('ui-logo');
const btnBack = document.getElementById('btn-back');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// ============================================================================
// 1. VERIFICACIÓN DE AUTENTICACIÓN
// ============================================================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = CONFIG.LOGOUT_REDIRECT;
        return;
    }
    
    // Ocultar guard protector de UI
    authGuard.style.opacity = '0';
    setTimeout(() => authGuard.style.display = 'none', 600);
    
    // Iniciar el ciclo de vida del orquestador
    await bootstrapEventOrchestrator();
});

// ============================================================================
// 2. CICLO DE VIDA DEL ORQUESTADOR
// ============================================================================
async function bootstrapEventOrchestrator() {
    try {
        // A. Inicializar UI Base y Navegación
        setupBaseUI();
        initTabsNavigation();

        // B. Obtener ID del evento desde URL
        const urlParams = new URLSearchParams(window.location.search);
        const extractedId = urlParams.get('id');
        setEventId(extractedId);

        if (!state.eventId) {
            showErrorView("Falta el ID del evento", "No se proporcionó un identificador válido en la URL.");
            return;
        }

        // C. Cargar datos del evento desde Firestore
        await loadEventFromFirestore(state.eventId);

    } catch (error) {
        console.error("Error en orquestador:", error);
        showErrorView("Error Crítico", "Ocurrió un problema al inicializar el panel del evento.");
    }
}

// ============================================================================
// 3. CARGA DE DATOS (FIRESTORE)
// ============================================================================
async function loadEventFromFirestore(eventId) {
    try {
        const docRef = doc(db, 'eventos', eventId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            setEventData(docSnap.data());
            
            // Renderizar la información base en la UI
            renderEventHeaderAndInfo(state.eventData);
            
            // Cambiar vista de Skeleton a Vista Principal
            loadingView.style.display = 'none';
            mainView.style.display = 'block';
            setTimeout(() => mainView.style.opacity = '1', 50);

            // Inicializar módulos secundarios (Editor, Excel, etc.)
            initializeExternalModules();

        } else {
            showErrorView("Evento no encontrado.", "El evento que intentas administrar no existe o fue eliminado.");
        }
    } catch (error) {
        console.error("Error obteniendo documento del evento:", error);
        showErrorView("Error de conexión", "No fue posible comunicarse con la base de datos.");
    }
}

// ============================================================================
// 4. COORDINACIÓN DE UI BASE
// ============================================================================
function setupBaseUI() {
    // Configurar logo global
    if (uiLogo) uiLogo.src = CONFIG.LOGO;
    
    // Botón regresar al dashboard
    if (btnBack) {
        btnBack.addEventListener('click', () => { 
            window.location.href = 'dashboard.html'; 
        });
    }

    // Bindings básicos que competen estrictamente al orquestador (Enlaces generales)
    const btnCopyUrl = document.getElementById('btn-copy-url');
    if (btnCopyUrl) {
        btnCopyUrl.addEventListener('click', () => {
            const urlInput = document.getElementById('val-url').value;
            copyInvitation(urlInput, () => ui.showToast('Enlace general copiado exitosamente.'));
        });
    }
    
    const btnOpenInv = document.getElementById('btn-open-invitation');
    if (btnOpenInv) {
        btnOpenInv.addEventListener('click', () => {
            const url = document.getElementById('val-url').value;
            if(url && url.startsWith('http')) window.open(url, '_blank');
        });
    }
}

function initTabsNavigation() {
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            
            // Restablecer estados activos
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Activar tab seleccionada
            btn.classList.add('active');
            document.getElementById(`tab-${targetId}`).classList.add('active');
            
            // Notificar a los módulos sobre el cambio de pestaña (Ej. Módulo 8 ajusta el ancho)
            notifyTabChangeToModules(targetId);
        });
    });
}

function notifyTabChangeToModules(targetId) {
    // Ajuste de layout para el Editor Visual (Módulo 8)
    const wrapper = document.querySelector('.event-wrapper');
    if (wrapper) {
        if (targetId === 'invitacion') {
            wrapper.classList.add('editor-mode');
        } else {
            wrapper.classList.remove('editor-mode');
        }
    }

    /* 
     * COMENTARIO MÓDULOS FALTANTES:
     * Si existiera el módulo de estadísticas, se le notificaría aquí para animar la barra:
     * if (targetId === 'estadisticas') animateProgressBarsModule();
     */
}

function renderEventHeaderAndInfo(data) {
    // Extraer valores normalizados
    const nombre = data.nombreEvento || data.nombre || 'Evento sin título';
    const ciudad = data.ciudad || 'Ciudad no especificada';
    const estadoLugar = data.estado || 'Estado no especificado';
    const pais = data.pais || 'País no especificado';
    const status = data.estadoEvento || data.estado || 'Borrador';
    const codigo = data.codigoEvento || data.codigo || 'EVT-XXXX';
    const acceso = data.tipoAcceso || data.acceso || 'Global';
    const descripcion = data.descripcion || 'Sin descripción adicional.';
    const claveAcceso = data.claveAcceso || '----';
    
    // Formatear fecha utilizando helpers puros
    const fecha = helpers.formatDate(data.fecha);

    // Aplicar a los elementos del Header y Tab Info
    document.getElementById('val-nombre').textContent = nombre;
    document.getElementById('val-ciudad').textContent = ciudad;
    document.getElementById('val-fecha').textContent = fecha;
    
    const badgeEl = document.getElementById('val-estado-badge');
    if (badgeEl) {
        const estStr = status.toLowerCase();
        let bClass = 'borrador';
        if (estStr.includes('activo')) bClass = 'activo';
        if (estStr.includes('finalizado')) bClass = 'finalizado';
        
        badgeEl.textContent = status;
        badgeEl.className = `badge ${bClass}`;
    }

    document.getElementById('info-nombre').textContent = nombre;
    document.getElementById('info-tipo').textContent = data.tipoEvento || data.tipo || 'General';
    document.getElementById('info-fecha').textContent = fecha;
    document.getElementById('info-hora').textContent = data.hora || '--:--';
    document.getElementById('info-ubicacion').textContent = `${ciudad}, ${estadoLugar}, ${pais}`;
    document.getElementById('info-estado').textContent = status;
    document.getElementById('info-descripcion').textContent = descripcion;

    // Elementos de la Pestaña Invitación General & Configuración
    const baseUrl = window.location.origin;
    const urlInput = document.getElementById('val-url');
    if (urlInput) urlInput.value = `${baseUrl}/invitacion?code=${codigo}`;
    
    document.getElementById('inv-codigo').textContent = codigo;
    document.getElementById('inv-acceso').textContent = acceso;
    document.getElementById('conf-estado').textContent = status;
    document.getElementById('conf-acceso').textContent = acceso;
    document.getElementById('conf-codigo').textContent = codigo;
    document.getElementById('conf-clave').textContent = claveAcceso;
}

function showErrorView(title, desc) {
    if (loadingView) loadingView.style.display = 'none';
    if (mainView) mainView.style.display = 'none';
    if (errorView) errorView.style.display = 'block';
    
    if(title) document.getElementById('error-title').textContent = title;
    if(desc) document.getElementById('error-desc').textContent = desc;
}

// ============================================================================
// 5. INICIALIZACIÓN DE MÓDULOS SECUNDARIOS
// ============================================================================
function initializeExternalModules() {
    const nombre = state.eventData.nombreEvento || state.eventData.nombre || 'Evento';

    // Iniciar Módulo 8: Editor Visual
    if (typeof initEditor === 'function') {
        initEditor(state.eventId, nombre);
    }

    // Iniciar Módulo 7: Importación Excel
    const btnImportExcel = document.getElementById('btn-import-excel');
    const btnEmptyImportExcel = document.getElementById('btn-empty-import-excel');
    
    const startExcelFlow = () => {
        if (typeof initExcelImport === 'function') {
            // Nota: Al carecer del archivo guests-manager, pasamos un array vacío a 'currentGuests'.
            // El módulo de Excel hará el import y llamará al callback al terminar.
            initExcelImport(state.eventId, [], () => {
                ui.showToast('Importación exitosa.');
                /* 
                 * COMENTARIO MÓDULOS FALTANTES:
                 * Aquí se llamaría a fetchGuestsData() para recargar la lista
                 * después de que el módulo de Excel termine su trabajo.
                 */
            });
        }
    };

    if (btnImportExcel) btnImportExcel.addEventListener('click', startExcelFlow);
    if (btnEmptyImportExcel) btnEmptyImportExcel.addEventListener('click', startExcelFlow);

    /*
     * COMENTARIO MÓDULOS FALTANTES:
     * Si los módulos existieran, aquí se inicializarían:
     * 
     * initGuestsManager(state.eventId);
     * fetchGuestsData();
     * initStatsUI(state.eventData);
     * initSettingsManager(state.eventId);
     * initQRModals();
     */
}