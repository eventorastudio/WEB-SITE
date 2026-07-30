// dashboard.js
// Lógica de protección y cierre de sesión para dashboard.html

import { auth } from './firebase.js';
import { CONFIG } from './config.js';
import { 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Referencias al DOM
const btnLogout = document.getElementById('btn-logout');
const dashboardContent = document.getElementById('dashboard-content');
const uiLogo = document.getElementById('ui-logo');

// Configurar el logotipo desde la configuración global
if(uiLogo) {
    uiLogo.src = CONFIG.LOGO;
}

// Protección del Dashboard: Si el usuario NO está autenticado, redirigir a index.html
onAuthStateChanged(auth, (user) => {
    if (!user) {
        // Redirigir inmediatamente si no hay sesión válida
        window.location.href = CONFIG.LOGOUT_REDIRECT;
    } else {
        // Mostrar el contenido solo si hay una sesión válida para evitar destellos de UI
        dashboardContent.style.display = 'block';
    }
});

// Manejo del cierre de sesión
btnLogout.addEventListener('click', async () => {
    try {
        await signOut(auth);
        // onAuthStateChanged detectará el cierre de sesión y redirigirá automáticamente
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
});