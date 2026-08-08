// admin/modules/guests/excel-import.js
// Módulo visual de importación: no accede a Firebase; utiliza guestService inyectado.

import { EVENT_TYPES } from '../../core/event-types.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(['xlsx', 'xls', 'csv']);
const FIELD_DEFINITIONS = [
    { key: 'nombre', label: 'Nombre', required: true, aliases: ['nombre', 'invitado', 'nombre completo', 'name'] },
    { key: 'correo', label: 'Correo', aliases: ['correo', 'email', 'e-mail'] },
    { key: 'telefono', label: 'Teléfono', aliases: ['telefono', 'celular', 'phone', 'whatsapp'] },
    { key: 'pases', label: 'Pases', aliases: ['pases', 'acompanantes', 'numero de pases', 'guests', 'boletos'] },
    { key: 'mesa', label: 'Mesa', aliases: ['mesa', 'table'] },
    { key: 'estado', label: 'Estado', aliases: ['estado', 'confirmacion', 'status'] },
    { key: 'tipoAcceso', label: 'Tipo de acceso', aliases: ['tipo acceso', 'tipo de acceso', 'acceso', 'access type'] },
    { key: 'notas', label: 'Notas', aliases: ['notas', 'comentarios', 'observaciones'] },
    { key: 'codigo', label: 'Código / folio', aliases: ['codigo', 'folio', 'code', 'identificador', 'id invitado'] }
];

let deps = null;
let domCleanups = [];
let importState = createInitialState();

export function initExcelImport(container) {
    destroyExcelImport();
    if (!container?.services?.guest || !container?.eventContext?.eventId || !container?.ui || !container?.eventBus) {
        console.error('[Excel Import] Dependencias incompletas.');
        return;
    }

    deps = container;
    bindEvents();
}

export function destroyExcelImport() {
    domCleanups.forEach((cleanup) => cleanup());
    domCleanups = [];
    closeImportModal(false);
    deps = null;
    importState = createInitialState();
}

function createInitialState() {
    return {
        headers: [],
        rows: [],
        mapping: {},
        results: [],
        fileName: '',
        importSummary: null
    };
}

function bindEvents() {
    const fileInput = byId('excel-file-input');
    const dropZone = byId('excel-drop-zone');

    listen(byId('btn-import-excel'), 'click', openImportModal);
    listen(byId('btn-empty-import-excel'), 'click', openImportModal);
    listen(byId('btn-close-modal-import'), 'click', () => closeImportModal());
    listen(byId('modal-import-excel'), 'click', handleModalOverlayClick);
    listen(dropZone, 'click', () => fileInput?.click());
    listen(dropZone, 'keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput?.click();
        }
    });
    listen(dropZone, 'dragover', handleDragOver);
    listen(dropZone, 'dragleave', handleDragLeave);
    listen(dropZone, 'drop', handleDrop);
    listen(fileInput, 'change', (event) => processSelectedFile(event.target?.files?.[0]));
    listen(byId('btn-confirm-mapping'), 'click', confirmMapping);
    listen(byId('btn-execute-import'), 'click', executeImport);
    listen(byId('btn-back-to-upload'), 'click', resetToUpload);
    listen(byId('btn-finish-import'), 'click', () => closeImportModal());
    listen(byId('btn-download-template'), 'click', downloadTemplate);
}

function listen(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    domCleanups.push(() => target.removeEventListener(eventName, handler));
}

function openImportModal() {
    if (!deps) return;
    importState = createInitialState();
    clearFileInput();
    showStep('import-step-1');
    const modal = byId('modal-import-excel');
    modal?.classList.add('active');
    modal?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function closeImportModal(reset = true) {
    const modal = byId('modal-import-excel');
    modal?.classList.remove('active');
    modal?.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-overlay.active')) document.body.classList.remove('modal-open');
    if (reset) {
        importState = createInitialState();
        clearFileInput();
        showStep('import-step-1');
    }
}

function handleModalOverlayClick(event) {
    if (event.target === byId('modal-import-excel')) closeImportModal();
}

function handleDragOver(event) {
    event.preventDefault();
    byId('excel-drop-zone')?.classList.add('is-dragging');
}

function handleDragLeave(event) {
    if (event.target === byId('excel-drop-zone')) byId('excel-drop-zone')?.classList.remove('is-dragging');
}

function handleDrop(event) {
    event.preventDefault();
    byId('excel-drop-zone')?.classList.remove('is-dragging');
    processSelectedFile(event.dataTransfer?.files?.[0]);
}

async function processSelectedFile(file) {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !ACCEPTED_EXTENSIONS.has(extension)) {
        showFileError('Selecciona un archivo .xlsx, .xls o .csv.');
        return;
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        showFileError('El archivo debe tener contenido y pesar como máximo 10 MB.');
        return;
    }
    if (typeof window.XLSX === 'undefined') {
        showFileError('La librería para leer Excel no está disponible.');
        return;
    }

    importState = createInitialState();
    importState.fileName = file.name;
    setProgressStep('Leyendo archivo…', 8);
    showStep('import-step-4');

    try {
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: 'array', cellFormula: false, cellHTML: false });
        const firstSheet = workbook.SheetNames?.[0];
        const worksheet = firstSheet ? workbook.Sheets[firstSheet] : null;
        if (!worksheet) throw new Error('No se encontró una hoja válida.');

        const sheetRows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false, blankrows: false });
        if (!Array.isArray(sheetRows) || sheetRows.length < 2) {
            throw new Error('El archivo no contiene encabezados y registros.');
        }

        const headers = sheetRows[0].map((header) => cleanCellText(header, 120));
        if (!headers.some(Boolean)) throw new Error('No se detectaron encabezados válidos.');
        const rows = sheetRows.slice(1).filter((row) => Array.isArray(row) && row.some((cell) => cleanCellText(cell, 2000)));
        if (rows.length === 0) throw new Error('El archivo no contiene filas con datos.');

        importState.headers = headers;
        importState.rows = rows.map((row) => [...row]);
        importState.mapping = detectMapping(headers);

        if (!Number.isInteger(importState.mapping.nombre)) {
            renderMappingControls();
            showStep('import-step-2');
            deps.ui.showToast({
                title: 'Confirma las columnas',
                message: 'No pudimos identificar la columna de nombre con seguridad.',
                type: 'warning'
            });
            return;
        }

        await analyseRows();
    } catch (error) {
        console.error('[Excel Import] Error leyendo archivo:', error);
        showStep('import-step-1');
        showFileError(error?.message || 'No se pudo leer el archivo seleccionado.');
    }
}

function detectMapping(headers) {
    const normalizedHeaders = headers.map(normalizeHeader);
    return FIELD_DEFINITIONS.reduce((mapping, field) => {
        const aliasIndex = normalizedHeaders.findIndex((header) => field.aliases.includes(header));
        mapping[field.key] = aliasIndex >= 0 ? aliasIndex : null;
        return mapping;
    }, {});
}

function renderMappingControls() {
    const container = byId('mapping-container');
    if (!container) return;
    const fragment = document.createDocumentFragment();

    FIELD_DEFINITIONS.forEach((field) => {
        const label = document.createElement('label');
        const labelText = document.createElement('span');
        const select = document.createElement('select');
        labelText.textContent = `${field.label}${field.required ? ' *' : ''}`;
        select.className = 'form-control';
        select.dataset.mappingField = field.key;

        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = 'No importar';
        select.appendChild(empty);

        importState.headers.forEach((header, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = header || `Columna ${index + 1}`;
            option.selected = importState.mapping[field.key] === index;
            select.appendChild(option);
        });
        label.append(labelText, select);
        fragment.appendChild(label);
    });
    container.replaceChildren(fragment);
}

async function confirmMapping() {
    const nextMapping = {};
    FIELD_DEFINITIONS.forEach((field) => {
        const value = document.querySelector(`[data-mapping-field="${field.key}"]`)?.value;
        nextMapping[field.key] = value === '' || value === undefined ? null : Number(value);
    });
    if (!Number.isInteger(nextMapping.nombre)) {
        deps.ui.showToast({ title: 'Falta una columna obligatoria', message: 'Asigna la columna que contiene el nombre del invitado.', type: 'warning' });
        return;
    }
    importState.mapping = nextMapping;
    await analyseRows();
}

async function analyseRows() {
    setProgressStep('Validando registros y duplicados…', 24);
    showStep('import-step-4');
    try {
        const existingGuests = await deps.services.guest.getGuestsByEventId(deps.eventContext.eventId);
        const existingIndexes = buildDuplicateIndexes(existingGuests);
        const fileIndexes = createEmptyDuplicateIndexes();
        importState.results = importState.rows.map((row, index) => validateRow(row, index + 2, existingIndexes, fileIndexes));
        renderPreview();
        showStep('import-step-3');
    } catch (error) {
        console.error('[Excel Import] Error analizando duplicados:', error);
        showStep('import-step-1');
        deps.ui.showError({
            title: 'No se pudo validar la importación',
            description: 'No fue posible comparar los datos con los invitados existentes.',
            code: 'ERR_GUEST_IMPORT_ANALYSIS'
        });
    }
}

function validateRow(row, rowNumber, existingIndexes, fileIndexes) {
    const raw = readMappedRow(row);
    const messages = [];
    const nombre = cleanCellText(raw.nombre, 160);
    const correo = cleanCellText(raw.correo, 160).toLowerCase();
    const telefono = sanitizePhone(raw.telefono);
    const mesa = cleanCellText(raw.mesa, 80);
    const notas = cleanCellText(raw.notas, 1000);
    const codigo = cleanCellText(raw.codigo, 160);
    let normalizedGuest = null;
    try {
        normalizedGuest = deps.services.guest.normalizeGuestData({
            nombre: raw.nombre,
            correo: raw.correo,
            telefono: raw.telefono,
            pases: raw.pases,
            mesa: raw.mesa,
            estado: raw.estado,
            tipoAcceso: raw.tipoAcceso,
            notas: raw.notas,
            codigoInvitado: raw.codigo
        }, { requireName: true, strict: true });
    } catch (error) {
        messages.push(getNormalizationMessage(error));
    }
    const parsedPasses = parsePasses(raw.pases);
    const parsedStatus = parseStatus(raw.estado);

    if (!nombre) messages.push('El nombre es obligatorio.');
    if (correo && !isValidEmail(correo)) messages.push('El correo no es válido.');
    if (telefono && !isValidPhone(telefono)) messages.push('El teléfono no es válido.');
    if (!parsedPasses.valid) messages.push('Los pases deben ser un entero positivo.');
    if (!parsedStatus.valid) messages.push('El estado no es reconocido.');

    const guest = normalizedGuest || {
        nombre,
        correo,
        telefono,
        pases: parsedPasses.value,
        estado: parsedStatus.value,
        mesa,
        notas
    };
    if (codigo) guest.codigoInvitado = codigo;

    if (messages.length > 0) return { rowNumber, status: 'invalid', guest, messages, importable: false };

    const duplicate = findDuplicate(guest, existingIndexes, fileIndexes);
    if (duplicate.type !== 'none') {
        if (duplicate.type === 'name') {
            messages.push('Nombre parecido a un invitado existente; revisa antes de importar.');
            registerDuplicateKeys(guest, fileIndexes);
            return { rowNumber, status: 'warning', guest, messages, importable: true };
        }
        messages.push(`Duplicado detectado por ${duplicate.label}. Se omitirá para evitar sobrescrituras.`);
        return { rowNumber, status: 'duplicate', guest, messages, importable: false };
    }

    registerDuplicateKeys(guest, fileIndexes);
    return { rowNumber, status: 'valid', guest, messages, importable: true };
}

function readMappedRow(row) {
    return FIELD_DEFINITIONS.reduce((result, field) => {
        const column = importState.mapping[field.key];
        result[field.key] = Number.isInteger(column) ? row[column] : '';
        return result;
    }, {});
}

function createEmptyDuplicateIndexes() {
    return { codes: new Set(), emails: new Set(), phones: new Set(), names: new Set() };
}

function buildDuplicateIndexes(guests) {
    const indexes = createEmptyDuplicateIndexes();
    guests.forEach((guest) => registerDuplicateKeys({
        codigo: getGuestCode(guest),
        correo: guest.correo ?? guest.email,
        telefono: guest.telefono ?? guest.tel ?? guest.phone,
        nombre: guest.nombre ?? guest.name
    }, indexes));
    return indexes;
}

function registerDuplicateKeys(guest, indexes) {
    const code = normalizeKey(guest.codigoInvitado ?? guest.codigo);
    const email = normalizeKey(guest.correo);
    const phone = normalizePhone(guest.telefono);
    const name = normalizeKey(guest.nombre);
    if (code) indexes.codes.add(code);
    if (email) indexes.emails.add(email);
    if (phone) indexes.phones.add(phone);
    if (name) indexes.names.add(name);
}

function findDuplicate(guest, existingIndexes, fileIndexes) {
    const code = normalizeKey(guest.codigoInvitado ?? guest.codigo);
    const email = normalizeKey(guest.correo);
    const phone = normalizePhone(guest.telefono);
    const name = normalizeKey(guest.nombre);
    if (code && (existingIndexes.codes.has(code) || fileIndexes.codes.has(code))) return { type: 'strong', label: 'código o folio' };
    if (email && (existingIndexes.emails.has(email) || fileIndexes.emails.has(email))) return { type: 'strong', label: 'correo' };
    if (phone && (existingIndexes.phones.has(phone) || fileIndexes.phones.has(phone))) return { type: 'strong', label: 'teléfono' };
    if (!code && !email && !phone && name && (existingIndexes.names.has(name) || fileIndexes.names.has(name))) return { type: 'name', label: 'nombre' };
    return { type: 'none' };
}

function renderPreview() {
    const summary = importState.results.reduce((counts, result) => {
        counts[result.status] += 1;
        return counts;
    }, { valid: 0, invalid: 0, duplicate: 0, warning: 0 });
    const summaryContainer = byId('validation-summary-box');
    const previewBody = byId('preview-table-body');
    if (!summaryContainer || !previewBody) return;

    const summaryFragment = document.createDocumentFragment();
    [
        ['Válidos', summary.valid, 'is-valid'],
        ['Con advertencia', summary.warning, 'is-warning'],
        ['Duplicados omitidos', summary.duplicate, 'is-duplicate'],
        ['Inválidos', summary.invalid, 'is-invalid']
    ].forEach(([label, count, className]) => {
        const item = document.createElement('span');
        item.className = className;
        item.textContent = `${label}: ${count}`;
        summaryFragment.appendChild(item);
    });
    const policy = document.createElement('span');
    policy.textContent = 'Los duplicados se omitirán; esta importación no sobrescribe datos existentes.';
    summaryFragment.appendChild(policy);
    summaryContainer.replaceChildren(summaryFragment);

    const rowsFragment = document.createDocumentFragment();
    importState.results.slice(0, 10).forEach((result) => {
        const row = document.createElement('tr');
        const values = [
            getPreviewStatusLabel(result),
            result.guest.nombre || '—',
            result.guest.correo || '—',
            result.guest.telefono || '—',
            String(result.guest.pases || '—'),
            result.guest.mesa || '—'
        ];
        values.forEach((value) => {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.appendChild(cell);
        });
        row.title = result.messages.join(' ');
        rowsFragment.appendChild(row);
    });
    previewBody.replaceChildren(rowsFragment);

    const importableCount = importState.results.filter((result) => result.importable).length;
    const importButton = byId('btn-execute-import');
    if (importButton) {
        importButton.disabled = importableCount === 0;
        importButton.textContent = importableCount ? `Importar ${importableCount} válidos` : 'No hay registros para importar';
    }
}

async function executeImport() {
    const importable = importState.results.filter((result) => result.importable).map((result) => result.guest);
    if (importable.length === 0) {
        deps.ui.showToast({ title: 'Sin registros importables', message: 'Corrige las filas inválidas o elimina los duplicados del archivo.', type: 'warning' });
        return;
    }

    const confirmed = await deps.ui.confirm({
        title: 'Confirmar importación',
        message: `Se importarán ${importable.length} invitados. Los duplicados detectados se omitirán y no se sobrescribirá ningún dato existente.`,
        confirmText: 'Importar invitados',
        cancelText: 'Cancelar'
    });
    if (!confirmed) return;

    showStep('import-step-4');
    setProgressStep('Preparando importación…', 0);
    try {
        const result = await deps.services.guest.importGuestsBatch(deps.eventContext.eventId, importable, {
            onProgress: ({ completedBatches, totalBatches, importedCount, totalCount }) => {
                const progress = Math.round((importedCount / totalCount) * 100);
                setProgressStep(`Guardando bloque ${completedBatches} de ${totalBatches}…`, progress);
            }
        });

        importState.importSummary = {
            processed: importState.results.length,
            imported: result.importedCount,
            duplicates: importState.results.filter((item) => item.status === 'duplicate').length,
            invalid: importState.results.filter((item) => item.status === 'invalid').length,
            warnings: importState.results.filter((item) => item.status === 'warning').length
        };
        deps.eventBus.emit(EVENT_TYPES.GUEST_IMPORTED, {
            eventId: deps.eventContext.eventId,
            guests: result.guests,
            count: result.importedCount,
            timestamp: Date.now()
        });
        renderImportCompletion(importState.importSummary);
        clearFileInput();
        showStep('import-step-5');
        deps.ui.showToast({ title: 'Importación completada', message: `${result.importedCount} invitados se agregaron correctamente.`, type: 'success' });
    } catch (error) {
        console.error('[Excel Import] Error guardando invitados:', error);
        const importedCount = Number(error?.importedCount) || 0;
        const completed = Number(error?.completedBatches) || 0;
        setProgressStep(`Falló después de ${completed} bloque(s) completado(s).`, 0);
        deps.ui.showError({
            title: 'Importación incompleta',
            description: importedCount
                ? `Se guardaron ${importedCount} invitados antes del fallo. Revisa el archivo antes de reintentar.`
                : 'No fue posible guardar el primer bloque. Verifica tu conexión e inténtalo nuevamente.',
            code: 'ERR_GUEST_IMPORT'
        });
    }
}

function setProgressStep(text, progress) {
    setText('import-progress-title', 'Importando invitados');
    setText('import-progress-text', text);
    const bar = byId('import-progress-bar');
    if (bar) bar.style.width = `${Math.min(Math.max(progress, 0), 100)}%`;
}

function renderImportCompletion(summary) {
    setText('final-summary-text', `Procesados: ${summary.processed} · Importados: ${summary.imported} · Omitidos: ${summary.duplicates} · Errores: ${summary.invalid}${summary.warnings ? ` · Advertencias: ${summary.warnings}` : ''}`);
}

function resetToUpload() {
    importState = createInitialState();
    clearFileInput();
    showStep('import-step-1');
}

function showStep(activeId) {
    document.querySelectorAll('.import-step').forEach((step) => step.classList.toggle('active', step.id === activeId));
}

function showFileError(message) {
    clearFileInput();
    deps?.ui.showToast({ title: 'Archivo no válido', message, type: 'warning' });
}

function clearFileInput() {
    const fileInput = byId('excel-file-input');
    if (fileInput) fileInput.value = '';
}

function downloadTemplate() {
    const header = 'Nombre,Correo,Teléfono,Pases,Mesa,Estado,Tipo de acceso,Notas,Código\n';
    const example = 'María López,maria@ejemplo.com,5551234567,2,Mesa 4,Pendiente,Ambos,,INV-001\n';
    const blob = new Blob([header, example], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-invitados-eventora.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function parsePasses(value) {
    const text = cleanCellText(value, 30);
    if (!text) return { value: 1, valid: true };
    const parsed = Number(text.replace(',', '.'));
    return { value: Number.isInteger(parsed) ? parsed : 0, valid: Number.isInteger(parsed) && parsed > 0 && parsed <= 999 };
}

function parseStatus(value) {
    const normalized = normalizeHeader(value);
    if (!normalized) return { value: 'Pendiente', valid: true };
    if (normalized.includes('llego') || normalized.includes('arrivo')) return { value: 'Llegó', valid: true };
    if (normalized.includes('confirm')) return { value: 'Confirmado', valid: true };
    if (normalized.includes('no asist') || normalized.includes('cancel')) return { value: 'No asistirá', valid: true };
    if (normalized.includes('pend')) return { value: 'Pendiente', valid: true };
    return { value: 'Pendiente', valid: false };
}

function getPreviewStatusLabel(result) {
    return ({ valid: 'Válida', warning: 'Advertencia', duplicate: 'Duplicada', invalid: 'Inválida' })[result.status] || 'Revisar';
}

function getGuestCode(guest) {
    return guest?.codigoInvitado ?? guest?.codigo ?? guest?.codigoInvitacion ?? guest?.folio ?? guest?.token ?? guest?.code ?? '';
}

function getNormalizationMessage(error) {
    const code = String(error?.message || '');
    if (code.includes('invalid-name')) return 'El nombre es obligatorio.';
    if (code.includes('invalid-email')) return 'El correo no es valido.';
    if (code.includes('invalid-phone')) return 'El telefono no es valido.';
    if (code.includes('invalid-passes')) return 'Los pases deben ser un entero entre 1 y 999.';
    if (code.includes('invalid-table')) return 'La mesa debe ser un numero o estar vacia.';
    if (code.includes('invalid-status')) return 'El estado no es reconocido.';
    return 'El tipo de acceso no es valido.';
}

function cleanCellText(value, maxLength) {
    return String(value ?? '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/^\s*[=\-@]+/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function sanitizePhone(value) {
    const text = String(value ?? '').trim();
    const digits = text.replace(/\D/g, '');
    return digits ? `${text.startsWith('+') ? '+' : ''}${digits}` : '';
}

function normalizeHeader(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[\-_./]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeKey(value) {
    return normalizeHeader(value).replace(/\s+/g, '');
}

function normalizePhone(value) {
    return String(value ?? '').replace(/\D/g, '');
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
    const digits = normalizePhone(value);
    return digits.length >= 7 && digits.length <= 15;
}

function byId(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = value;
}
