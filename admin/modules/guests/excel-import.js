// admin/modules/guests/excel-import.js
import { EVENT_TYPES } from "../../core/event-types.js";


let appDeps = null;
let excelState = {
    rawRows: [],
    mappedGuests: [],
    isValid: false
};

export function initExcelImport(dependencies) {
    if (!dependencies || !dependencies.services || !dependencies.ui) {
        console.error('[Excel Import] No se pudieron inicializar las dependencias requeridas.');
        return;
    }

    appDeps = dependencies;
    bindDomAndEvents();
}

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

function handleFileSelected(event) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;

    const { ui } = appDeps;
    ui.showLoader({ text: 'Leyendo archivo Excel...' });

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
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
            if (fileInput) fileInput.value = '';
            excelState = { rawRows: [], mappedGuests: [], isValid: false };
            ui.showError({
                title: 'Archivo no válido',
                description: 'No se pudo procesar el archivo seleccionado. Verifique que el formato sea correcto.',
                code: ''
            });
            console.error('[Excel Import] Error parseando Excel:', error);
        }
    };
    reader.onerror = () => {
        ui.hideLoader();
        if (fileInput) fileInput.value = '';
        excelState = { rawRows: [], mappedGuests: [], isValid: false };
        ui.showError({
            title: 'Error de lectura',
            description: 'Ocurrió un problema al leer el archivo.',
            code: ''
        });
    };
    reader.readAsArrayBuffer(file);
}

function processAndValidateRows(rows) {
    const { ui } = appDeps;
    ui.hideLoader();

    if (!Array.isArray(rows) || rows.length === 0) {
        const fileInput = document.getElementById('excel-file-input');
        if (fileInput) fileInput.value = '';
        excelState = { rawRows: [], mappedGuests: [], isValid: false };
        ui.showToast({
            message: 'El archivo Excel está vacío o no contiene registros válidos.',
            type: 'warning',
            title: 'Archivo vacío'
        });
        return;
    }

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

async function handleConfirmImport() {
    const { ui, services, eventContext, eventBus } = appDeps;
    const confirmBtn = document.getElementById('excel-confirm-btn');
    const fileInput = document.getElementById('excel-file-input');

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
            title: 'Atención',
            description: 'No se encontró el identificador del evento activo.',
            code: ''
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

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.dataset.originalText = confirmBtn.textContent;
        confirmBtn.textContent = 'Importando...';
    }

    try {
        await services.guest.importGuestsBatch(eventId, excelState.mappedGuests);

        ui.showToast({
            message: '¡Invitados importados correctamente!',
            type: 'success',
            title: 'Éxito'
        });

        eventBus.emit(EVENT_TYPES.GUEST_IMPORTED, {
            eventId,
            count: excelState.mappedGuests.length,
            timestamp: Date.now()
        });

        excelState = { rawRows: [], mappedGuests: [], isValid: false };
        if (fileInput) fileInput.value = '';

    } catch (error) {
        console.error('[Excel Import] Error guardando lote de invitados:', error);
        ui.showError({
            title: 'Error de importación',
            description: 'No pudimos importar los invitados. Verifica tu conexión e inténtalo nuevamente.',
            code: ''
        });
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = confirmBtn.dataset.originalText || 'Confirmar Importación';
        }
    }
}
