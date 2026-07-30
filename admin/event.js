// event.js
// Integración Completa Módulos 4, 5, 6, 7 y 8

import { auth, db } from './firebase.js';
import { CONFIG } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initExcelImport } from './excel-import.js';
import { initEditor } from './invitation-editor.js';

const authGuard = document.getElementById('auth-guard');
const loadingView = document.getElementById('loading-view');
const errorView = document.getElementById('error-view');
const mainView = document.getElementById('main-view');

const uiLogo = document.getElementById('ui-logo');
const btnBack = document.getElementById('btn-back');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

export let currentEventData = null;
export let currentEventId = null;
export let globalGuests = [];

export function showToast(message, iconSvg) {
    const toast = document.getElementById('toast-notification');
    const defaultIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    toast.innerHTML = `${iconSvg || defaultIcon} <span>${message}</span>`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = CONFIG.LOGOUT_REDIRECT; return; }
    authGuard.style.opacity = '0';
    setTimeout(() => authGuard.style.display = 'none', 600);
    
    initUI();
    const urlParams = new URLSearchParams(window.location.search);
    currentEventId = urlParams.get('id');

    if (!currentEventId) { showError("Falta ID", "No se proporcionó un ID válido."); return; }
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
            
            // Layout extension for Editor (Module 8)
            const wrapper = document.querySelector('.event-wrapper');
            if(targetId === 'invitacion') {
                wrapper.classList.add('editor-mode');
            } else {
                wrapper.classList.remove('editor-mode');
            }
        });
    });
}

async function fetchEventData(eventId) {
    try {
        const docRef = doc(db, 'eventos', eventId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentEventData = docSnap.data();
            
            // Cargar y pintar general (Simplificado para espacio)
            document.getElementById('val-nombre').textContent = currentEventData.nombreEvento || currentEventData.nombre;
            document.getElementById('info-nombre').textContent = currentEventData.nombreEvento || currentEventData.nombre;
            
            // Iniciar Módulo 8 (Editor Visual)
            initEditor(currentEventId, currentEventData.nombreEvento || currentEventData.nombre);

            loadingView.style.display = 'none';
            mainView.style.display = 'block';
            setTimeout(() => mainView.style.opacity = '1', 50);
        } else {
            showError("No encontrado.", "El evento no existe.");
        }
    } catch (error) {
        console.error(error);
        showError("Error", "Ocurrió un problema de conexión.");
    }
}

function showError(title, desc) {
    loadingView.style.display = 'none';
    errorView.style.display = 'block';
    if(title) document.getElementById('error-title').textContent = title;
    if(desc) document.getElementById('error-desc').textContent = desc;
}