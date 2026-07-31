// core/ui.js
// Módulo para manejar los elementos visuales compartidos de la interfaz

export const ui = {
    /**
     * Muestra una notificación Toast elegante en pantalla.
     * @param {string} message - El mensaje a mostrar.
     * @param {string} iconSvg - (Opcional) Icono SVG personalizado.
     */
    showToast: function(message, iconSvg) {
        const toast = document.getElementById('toast-notification');
        if (!toast) return;

        const defaultIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        toast.innerHTML = `${iconSvg || defaultIcon} <span>${message}</span>`;
        toast.classList.add('show');
        
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
};