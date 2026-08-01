// login.js
// Lógica de autenticación y protección para index.html

import { auth } from './firebase.js';
import { CONFIG } from './config.js';
import { 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    setPersistence, 
    browserLocalPersistence, 
    browserSessionPersistence 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Referencias al DOM
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const keepSessionCheckbox = document.getElementById('keep-session');
const btnLogin = document.getElementById('btn-login');
const errorContainer = document.getElementById('error-container');
const uiLogo = document.getElementById('ui-logo');

// Configurar el logotipo desde la configuración global
if(uiLogo) {
    uiLogo.src = CONFIG.LOGO;
}

// Protección de sesión: Si el usuario ya está autenticado, redirigir al Dashboard
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = CONFIG.LOGIN_REDIRECT;
    }
});

// Manejo del formulario de inicio de sesión
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Ocultar mensaje de error previo
    errorContainer.style.display = 'none';
    
    // Estado de carga en el botón
    const originalBtnText = btnLogin.textContent;
    btnLogin.disabled = true;
    btnLogin.textContent = 'Iniciando sesión...';

    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        // Configurar la persistencia de sesión según el checkbox
        const persistenceType = keepSessionCheckbox.checked 
            ? browserLocalPersistence 
            : browserSessionPersistence;
            
        await setPersistence(auth, persistenceType);
        
        // Ejecutar autenticación en Firebase
        await signInWithEmailAndPassword(auth, email, password);
        
        // Nota: onAuthStateChanged detectará el inicio de sesión exitoso y redirigirá automáticamente
        
    } catch (error) {
        // Restaurar estado del botón
        btnLogin.disabled = false;
        btnLogin.textContent = originalBtnText;
        
        // Mostrar mensaje de error elegante
        errorContainer.style.display = 'block';
        console.error("Error de autenticación:", error.code);
    }
});
