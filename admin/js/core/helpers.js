// core/helpers.js
// Módulo para funciones utilitarias puras y reutilizables

export const helpers = {
    /**
     * Formatea un objeto de fecha o string a formato local (es-ES).
     * @param {any} dateObj - Objeto de fecha o timestamp.
     * @returns {string} Fecha formateada.
     */
    formatDate: function(dateObj) {
        if (!dateObj) return 'Por definir';
        const f = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
        return f.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    }
};