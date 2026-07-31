// admin/excel-import.js
/**
 * @fileoverview Módulo de Importación masiva de Excel para Eventora Studio (Fase 3.9).
 * 
 * Responsabilidad:
 * - Administrar la interfaz y lógica de procesamiento, validación e importación de archivos Excel de invitados.
 * - Operar bajo el patrón de Inyección de Dependencias, sin variables globales de contexto.
 * - Delegar toda persistencia de datos exclusivamente a services.guest.
 * - Notificar las operaciones visuales mediante ui.js y reportar éxitos mediante el event-bus.js.
 */

import { EVENT_TYPES } from './core/event-types.js';

/**
 * Referencia interna a las dependencias inyectadas del sistema.
 * @private
 */
let appDeps = null;

/**
 * Estado mutable local específico del flujo de importación de Excel.
 * @private
 */
let excelState = {
    rawRows: [],
    mappedGuests: [],
    isValid: false
};

/**
 * Función pública de inicialización del módulo (Entry Point).
 * @param {Object} dependencies - Contenedor estándar de inyección.
 * @param {Object} dependencies.state 
 * @param {Object} dependencies.ui 
 * @param {Object} dependencies.eventBus 
 * @param {Object} dependencies.services 
 * @param {Object} dependencies.eventContext 
 */
export function initExcelImport(dependencies) {
    if (!dependencies || !dependencies.services || !dependencies.ui) {
        console.error('[Excel Import] No se pudieron inicializar las dependencias requeridas.');
        return;
    }

    appDeps = dependencies;
    bindDomAndEvents();
}

/**
 * Captura defensiva de elementos del DOM y asociación de escuchas de eventos.
 * @private
 */
function bindDomAndEvents() {
    try {
        const fileInput = document.getElementById('excel-file-input');
        const uploadBtn = document.getElementById('excel-upload-btn');
        const confirmBtn = document.getElementById('excel-confirm-btn');

        if (fileInput) {
            fileInput.addEventListener('change', handleFileSelected);
        }

        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                if (fileInput) fileInput.click();
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', handleConfirmImport);
        }

    } catch (error) {
        console.warn('[Excel Import] Error defensivo al enlazar el DOM:', error);
    }
}

/**
 * Maneja la selección de archivos locales por parte del usuario.
 * @private
 * @param {Event} event 
 */
function handleFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    const { ui } = appDeps;
    ui.showLoader({ text: 'Leyendo archivo Excel...' });

    // Lectura del archivo mediante FileReader y SheetJS (si está disponible en el entorno)
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            // Validar existencia de la librería global XLSX
            if (typeof XLSX === 'undefined') {
                throw new Error('Librería XLSX no disponible en el entorno.');
            }

            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonRows = XLSX.utils.sheet_to_json(worksheet);

            processAndValidateRows(jsonRows);
        } catch (error) {
            ui.hideLoader();
            ui.showError({
                title: 'Error de lectura',
                description: 'No se pudo procesar el archivo Excel. Verifique que el formato sea correcto.',
                code: 'ERR_EXCEL_PARSE'
            });
            console.error('[Excel Import] Error parseando Excel:', error);
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Procesa y valida la estructura de las filas extraídas del archivo.
 * @private
 * @param {Array<Object>} rows 
 */
function processAndValidateRows(rows) {
    const { ui } = appDeps;
    ui.hideLoader();

    if (!Array.isArray(rows) || rows.length === 0) {
        ui.showToast({
            message: 'El archivo Excel está vacío o no contiene registros válidos.',
            type: 'warning',
            title: 'Archivo vacío'
        });
        return;
    }

    // Mapeo normalizado hacia el esquema de invitados de Eventora Studio
    excelState.rawRows = rows;
    excelState.mappedGuests = rows.map(row => ({
        nombre: row.Nombre || row.nombre || row.NAME || 'Invitado sin nombre',
        telefono: String(row.Telefono || row.telefono || row.PHONE || ''),
        correo: row.Correo || row.correo || row.EMAIL || '',
        pases: Number(row.Pases || row.pases || row.PASSES || 1),
        asistenciaConfirmada: false
    }));

    excelState.isValid = excelState.mappedGuests.length > 0;

    ui.showToast({
        message: `Se detectaron ${excelState.mappedGuests.length} invitados listos para importar.`,
        type: 'success',
        title: 'Análisis completado'
    });
}

/**
 * Ejecuta la confirmación y almacenamiento masivo de los invitados procesados.
 * @private
 */
async function handleConfirmImport() {
    const { ui, services, eventContext, eventBus } = appDeps;

    if (!excelState.isValid || excelState.mappedGuests.length === 0) {
        ui.showToast({
            message: 'No hay datos válidos para importar.',
            type: 'warning',
            title: 'Sin datos'
        });
        return;
    }

    const eventId = eventContext?.eventId;
    if (!eventId) {
        ui.showError({
            title: 'Error de contexto',
            description: 'No se encontró el identificador del evento activo.',
            code: 'ERR_MISSING_EVENT_ID'
        });
        return;
    }

    const confirmed = await ui.confirm({
        title: 'Confirmar importación',
        message: `¿Deseas importar ${excelState.mappedGuests.length} invitados a este evento?`,
        confirmText: 'Importar',
        isDanger: false
    });

    if (!confirmed) return;

    ui.showLoader({ text: 'Guardando invitados en la base de datos...' });

    try {
        // Toda comunicación con Firestore pasa exclusivamente por guest-service.js
        await services.guest.importGuestsBatch(eventId, excelState.mappedGuests);

        ui.hideLoader();
        ui.showToast({
            message: '¡Invitados importados correctamente!',
            type: 'success',
            title: 'Éxito'
        });

        // Emitir señal oficial a través del Event Bus utilizando constantes tipadas
        eventBus.emit(EVENT_TYPES.GUEST_IMPORTED, {
            eventId,
            count: excelState.mappedGuests.length,
            timestamp: Date.now()
        });

        // Limpiar estado temporal local
        excelState = { rawRows: [], mappedGuests: [], isValid: false };

    } catch (error) {
        ui.hideLoader();
        console.error('[Excel Import] Error guardando lote de invitados:', error);
        ui.showError({
            title: 'Error de importación',
            description: 'Ocurrió un fallo al guardar los invitados en la base de datos.',
            code: 'ERR_GUEST_BATCH_SAVE'
        });
    }
}