// excel-import.js
// Módulo 7: Motor de Importación Inteligente desde Excel
import { db } from './firebase.js';
import { collection, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { generateToken, generateInvitationURL, generateQRCode } from './invitation-utils.js';
import { ui } from './core/ui.js';
import { helpers } from './core/helpers.js';

let currentEventId = null;
let existingGuests = [];
let onSuccessCallback = null;

let parsedExcelData = []; // Datos crudos del Excel
let excelHeaders = [];    // Cabeceras detectadas
let mappedData = [];      // Datos tras el mapeo
let validatedRows = [];   // Filas validadas listas para importar

const EXPECTED_COLUMNS = [
    { id: 'nombre', label: 'Nombre Completo', required: true },
    { id: 'telefono', label: 'Teléfono', required: false },
    { id: 'correo', label: 'Correo', required: false },
    { id: 'mesa', label: 'Mesa', required: false },
    { id: 'pases', label: 'Pases', required: false },
    { id: 'notas', label: 'Notas', required: false },
    { id: 'estado', label: 'Estado', required: false },
    { id: 'tipoAcceso', label: 'Tipo de Acceso', required: false }
];

// UI Refs
const modal = document.getElementById('modal-import-excel');
const btnClose = document.getElementById('btn-close-modal-import');
const step1 = document.getElementById('import-step-1');
const step2 = document.getElementById('import-step-2');
const step3 = document.getElementById('import-step-3');
const step4 = document.getElementById('import-step-4');
const step5 = document.getElementById('import-step-5');

const dropZone = document.getElementById('excel-drop-zone');
const fileInput = document.getElementById('excel-file-input');
const btnDownloadTpl = document.getElementById('btn-download-template');
const mappingContainer = document.getElementById('mapping-container');
const btnConfirmMapping = document.getElementById('btn-confirm-mapping');
const previewTableBody = document.getElementById('preview-table-body');
const validationSummaryBox = document.getElementById('validation-summary-box');
const btnBackToUpload = document.getElementById('btn-back-to-upload');
const btnExecuteImport = document.getElementById('btn-execute-import');
const progressBar = document.getElementById('import-progress-bar');
const progressText = document.getElementById('import-progress-text');
const finalSummaryText = document.getElementById('final-summary-text');
const btnFinishImport = document.getElementById('btn-finish-import');

export function initExcelImport(eventId, currentGuests, onSuccess) {
    currentEventId = eventId;
    existingGuests = currentGuests;
    onSuccessCallback = onSuccess;
    resetImportUI();
    
    // Asignar listeners solo una vez (prevenir duplicados)
    if (!modal.dataset.initialized) {
        btnClose.addEventListener('click', () => ui.closeModalElem(modal));
        btnDownloadTpl.addEventListener('click', downloadTemplate);
        
        fileInput.addEventListener('change', handleFileUpload);
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--color-gold)'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--color-border)'; });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.style.borderColor = 'var(--color-border)';
            if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; handleFileUpload({ target: fileInput }); }
        });

        btnConfirmMapping.addEventListener('click', processMapping);
        btnBackToUpload.addEventListener('click', resetImportUI);
        btnExecuteImport.addEventListener('click', importGuests);
        btnFinishImport.addEventListener('click', () => { ui.closeModalElem(modal); if(onSuccessCallback) onSuccessCallback(); });
        
        modal.dataset.initialized = 'true';
    }
    
    ui.openModalElem(modal);
}

function resetImportUI() {
    parsedExcelData = []; excelHeaders = []; mappedData = []; validatedRows = [];
    fileInput.value = '';
    showStep(1);
    progressBar.style.width = '0%';
}

function showStep(stepNum) {
    [step1, step2, step3, step4, step5].forEach(s => s.classList.remove('active'));
    document.getElementById(`import-step-${stepNum}`).classList.add('active');
}

// ----------------------------------------------------------------------------
// 1. LECTURA EXCEL
// ----------------------------------------------------------------------------
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            parsedExcelData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            if (parsedExcelData.length === 0) throw new Error("El archivo está vacío.");
            
            excelHeaders = Object.keys(parsedExcelData[0]);
            renderMappingUI();
            showStep(2);
        } catch (err) {
            console.error(err);
            alert("Error al leer el archivo Excel. Asegúrate de que no esté dañado.");
        }
    };
    reader.readAsArrayBuffer(file);
}

// ----------------------------------------------------------------------------
// 2. MAPEO
// ----------------------------------------------------------------------------
function renderMappingUI() {
    mappingContainer.innerHTML = '';
    
    EXPECTED_COLUMNS.forEach(col => {
        const row = document.createElement('div');
        row.className = 'map-row';
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'map-label';
        labelDiv.innerHTML = `${col.label} ${col.required ? '<span style="color:var(--color-error)">*</span>' : ''}`;
        
        const select = document.createElement('select');
        select.className = 'map-select';
        select.dataset.targetId = col.id;
        
        let optionsHtml = `<option value="">-- Ignorar / No Mapear --</option>`;
        excelHeaders.forEach(header => {
            // Auto-seleccionar si coincide string (case-insensitive)
            const hClean = header.toLowerCase().replace(/[^a-z0-9]/g, '');
            const colClean = col.label.toLowerCase().replace(/[^a-z0-9]/g, '');
            const isMatch = hClean.includes(colClean) || colClean.includes(hClean);
            optionsHtml += `<option value="${header}" ${isMatch ? 'selected' : ''}>${header}</option>`;
        });
        
        select.innerHTML = optionsHtml;
        row.appendChild(labelDiv);
        row.appendChild(select);
        mappingContainer.appendChild(row);
    });
}

function processMapping() {
    const selects = mappingContainer.querySelectorAll('.map-select');
    const mappingConfig = {}; // { targetId: excelHeader }
    
    selects.forEach(sel => {
        if (sel.value) mappingConfig[sel.dataset.targetId] = sel.value;
    });

    mappedData = parsedExcelData.map(row => {
        const newRow = {};
        EXPECTED_COLUMNS.forEach(col => {
            const excelHeader = mappingConfig[col.id];
            newRow[col.id] = excelHeader && row[excelHeader] !== undefined ? row[excelHeader].toString().trim() : '';
        });
        return newRow;
    });

    validateRows();
}

// ----------------------------------------------------------------------------
// 3. VALIDACIÓN Y PREVIEW
// ----------------------------------------------------------------------------
function validateRows() {
    validatedRows = [];
    let validCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    
    const localNamesSet = new Set();
    const firestoreNamesSet = new Set(existingGuests.map(g => (g.nombre || '').toLowerCase().trim()));

    mappedData.forEach((row, index) => {
        let isError = false;
        let isDup = false;
        let errorMsg = '';
        
        const nameClean = row.nombre.toLowerCase();

        // Reglas Validación
        if (!row.nombre) {
            isError = true; errorMsg = 'Nombre requerido';
        } else if (localNamesSet.has(nameClean)) {
            isDup = true; errorMsg = 'Duplicado en Excel';
        } else if (firestoreNamesSet.has(nameClean)) {
            isDup = true; errorMsg = 'Ya existe en Evento';
        } else if (row.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.correo)) {
            isError = true; errorMsg = 'Correo inválido';
        } else {
            const pasesNum = parseInt(row.pases, 10);
            if (isNaN(pasesNum) || pasesNum < 1) row.pases = '1'; // Corregir silenciosamente
            localNamesSet.add(nameClean);
        }

        let finalStatus = 'valid';
        if (isError) { finalStatus = 'error'; errorCount++; }
        else if (isDup) { finalStatus = 'dup'; duplicateCount++; }
        else { validCount++; }

        validatedRows.push({ ...row, _status: finalStatus, _error: errorMsg, _originalIndex: index + 1 });
    });

    // Render Preview
    validationSummaryBox.innerHTML = `
        <div class="val-stat"><span style="color:#1E7E34">Válidos</span><strong style="color:#1E7E34">${validCount}</strong></div>
        <div class="val-stat"><span style="color:#D32F2F">Errores</span><strong style="color:#D32F2F">${errorCount}</strong></div>
        <div class="val-stat"><span style="color:#B36B00">Duplicados</span><strong style="color:#B36B00">${duplicateCount}</strong></div>
    `;

    previewTableBody.innerHTML = '';
    validatedRows.forEach(row => {
        const tr = document.createElement('tr');
        let statusBadge = '';
        if (row._status === 'valid') statusBadge = `<span class="status-badge valid">Listo</span>`;
        if (row._status === 'error') statusBadge = `<span class="status-badge error">Error</span><span class="error-text">${row._error}</span>`;
        if (row._status === 'dup') statusBadge = `<span class="status-badge dup">Omitir</span><span class="error-text">${row._error}</span>`;

        tr.innerHTML = `
            <td>${statusBadge}</td>
            <td style="font-weight:600">${row.nombre || '-'}</td>
            <td>${row.correo || '-'}</td>
            <td>${row.telefono || '-'}</td>
            <td>${row.pases}</td>
            <td>${row.mesa || '-'}</td>
            <td><span style="font-size:0.75rem; color:var(--color-gray-light)">Fila ${row._originalIndex}</span></td>
        `;
        previewTableBody.appendChild(tr);
    });

    btnExecuteImport.disabled = validCount === 0;
    showStep(3);
}

// ----------------------------------------------------------------------------
// 4. IMPORTACIÓN BATCH (Firestore)
// ----------------------------------------------------------------------------
async function importGuests() {
    const validGuests = validatedRows.filter(r => r._status === 'valid');
    if (validGuests.length === 0) return;

    showStep(4);
    progressText.textContent = "Preparando registros...";
    
    // Obtener pool de tokens para colisiones
    const usedTokens = existingGuests.map(g => g.token).filter(t => t);
    const usedCodes = new Set();
    
    // Preparar Data
    const guestsToInsert = validGuests.map((row, i) => {
        // IDs Base
        const nextIdIndex = existingGuests.length + i + 1; 
        const nextIdStr = `INV-${String(nextIdIndex).padStart(4, '0')}`;
        const uCode = helpers.generateUniqueGuestCode(usedCodes);
        
        // Motor de Invitaciones
        const nToken = generateToken(usedTokens);
        usedTokens.push(nToken); // Agregar a memoria para evitar choques en el loop
        const nUrl = generateInvitationURL(nToken);
        const nQr = generateQRCode(nUrl);

        return {
            id: nextIdStr,
            codigo: uCode,
            nombre: row.nombre,
            telefono: row.telefono,
            correo: row.correo,
            pases: parseInt(row.pases, 10) || 1,
            mesa: row.mesa,
            estado: row.estado || 'Pendiente',
            tipoAcceso: row.tipoAcceso || 'Ambos',
            notas: row.notas,
            confirmado: (row.estado || '').toLowerCase().includes('confirmado'),
            token: nToken,
            urlInvitacion: nUrl,
            qrGenerado: nQr,
            estadoAcceso: 'Invitación generada',
            ultimoAcceso: null,
            fechaRegistro: serverTimestamp(),
            fechaGeneracion: serverTimestamp()
        };
    });

    // Subdividir en chunks de 450 (Firestore limit is 500)
    const chunks = [];
    const chunkSize = 450;
    for (let i = 0; i < guestsToInsert.length; i += chunkSize) {
        chunks.push(guestsToInsert.slice(i, i + chunkSize));
    }

    try {
        const guestsColRef = collection(db, `eventos/${currentEventId}/invitados`);
        let processed = 0;

        for (let i = 0; i < chunks.length; i++) {
            const batch = writeBatch(db);
            chunks[i].forEach(guestObj => {
                const docRef = doc(guestsColRef);
                batch.set(docRef, guestObj);
            });
            await batch.commit();
            
            processed += chunks[i].length;
            const percentage = Math.round((processed / guestsToInsert.length) * 100);
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `Guardando en base de datos... (${processed}/${guestsToInsert.length})`;
        }

        // Éxito
        const totalIgnored = validatedRows.length - validGuests.length;
        finalSummaryText.innerHTML = `
            Se importaron <strong>${validGuests.length}</strong> invitados exitosamente.<br>
            Se generaron automáticamente sus Tokens, Códigos y QRs.<br>
            <span style="color:var(--color-gray-dark); font-size:0.85rem; margin-top:10px; display:inline-block;">
                ${totalIgnored} registros omitidos (Errores o duplicados).
            </span>
        `;
        showStep(5);

    } catch (err) {
        console.error("Error en batch import:", err);
        alert("Ocurrió un error al guardar los invitados en el servidor.");
        resetImportUI();
    }
}

// ----------------------------------------------------------------------------
// 5. DESCARGAR PLANTILLA
// ----------------------------------------------------------------------------
function downloadTemplate() {
    const ws_data = [
        ["Nombre", "Telefono", "Correo", "Mesa", "Pases", "Notas", "Estado", "TipoAcceso"],
        ["Familia Pérez Rodríguez", "5512345678", "contacto@ejemplo.com", "12", "4", "Alergia nueces", "Pendiente", "Ambos"],
        ["Juan Hernández", "", "", "", "1", "", "Confirmado", "QR"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    
    // Ancho columnas
    ws['!cols'] = [{wch: 30}, {wch: 15}, {wch: 25}, {wch: 10}, {wch: 8}, {wch: 20}, {wch: 15}, {wch: 15}];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invitados");
    XLSX.writeFile(wb, "Plantilla_Eventora_Studio.xlsx");
}