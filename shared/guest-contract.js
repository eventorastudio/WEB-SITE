import { normalizeCheckinSequence } from './checkin-numbering.js';

// Contrato canónico compartido para todas las superficies de Eventora Studio.
// Es un módulo puro: no importa Firebase, no consulta red y no escribe datos.

export const GUEST_STATUSES = Object.freeze(['pendiente', 'confirmado', 'no_asistira', 'llego']);
export const GUEST_ACCESS_TYPES = Object.freeze(['ambos', 'qr', 'enlace', 'manual']);
export const QR_ACCESS_TYPES = Object.freeze(['ambos', 'qr']);

export const GUEST_FIELD_DEFINITIONS = Object.freeze({
    codigoInvitado: field('string', 'Código visible del invitado', true, true, 'Conservar; si falta, derivar del ID único del documento.'),
    nombre: field('string', 'Nombre del invitado', true, false, 'Conservar el valor propio.'),
    correo: field('string', 'Correo del invitado', true, false, 'Conservar y normalizar texto; puede estar vacío.'),
    telefono: field('string', 'Teléfono del invitado', true, false, 'Conservar y normalizar dígitos; puede estar vacío.'),
    pases: field('number', 'Pases totales', true, false, 'Conservar y convertir solo enteros inequívocos.'),
    pasesUtilizados: field('number', 'Pases con entrada registrada', true, false, 'Conservar si es válido; si falta, sumar check-ins confiables.'),
    pasesDisponibles: field('number', 'Pases restantes', true, false, 'Calcular como pases - pasesUtilizados, nunca negativo.'),
    checkinSecuencia: field('number', 'Última secuencia de check-in asignada', true, false, 'Iniciar en 0 e incrementar solo en la transacción de check-in.'),
    mesa: field('number|null', 'Mesa asignada', true, false, 'Conservar la propia; null cuando no hay asignación.'),
    estado: field('string', 'Estado canónico de asistencia', true, false, 'Conservar y normalizar a un estado existente del contrato.'),
    confirmado: field('boolean', 'Confirmación derivada del estado', true, false, 'Derivar de estado para evitar contradicciones.'),
    llegadaRegistrada: field('boolean', 'Indica si existe llegada', true, false, 'Conservar llegada o derivar de historial confiable.'),
    horaLlegada: field('timestamp|null', 'Hora de la primera llegada', true, false, 'Conservar; si falta y hay check-in, usar el primero.'),
    tipoAcceso: field('string', 'Modalidad de acceso', true, false, 'Conservar y normalizar al catálogo existente.'),
    qrToken: field('string|null', 'Token secreto del QR', true, true, 'Conservar; generar uno criptográfico solo si permite QR.'),
    qrActivo: field('boolean', 'Habilitación del QR', true, false, 'Derivar de tipoAcceso y token sin reactivar un QR deshabilitado.'),
    notas: field('string', 'Notas propias del invitado', true, false, 'Conservar; cadena vacía si no existen.'),
    fechaCreacion: field('timestamp', 'Fecha de alta', true, false, 'Conservar siempre; si falta, reportar y no inventar.'),
    fechaActualizacion: field('timestamp', 'Última modificación', true, false, 'Usar serverTimestamp únicamente al escribir cambios.')
});

export const CANONICAL_GUEST_FIELDS = Object.freeze(Object.keys(GUEST_FIELD_DEFINITIONS));

export class GuestContractError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

/** Normaliza campos descriptivos. `estado` gobierna confirmado y llegada. */
export function normalizeGuestData(data = {}, { requireName = false, strict = false } = {}) {
    const source = asObject(data);
    const nombre = normalizeText(source.nombre ?? source.name, 160);
    const correo = normalizeText(source.correo ?? source.email, 160).toLowerCase();
    const telefono = normalizePhone(source.telefono ?? source.tel ?? source.phone);
    const pases = normalizePasses(source.pases, { strict });
    const mesa = normalizeTable(source.mesa ?? source.table, { strict });
    const estado = normalizeStatus(source, { strict });
    const tipoAcceso = normalizeAccessType(source.tipoAcceso ?? source.acceso, { strict });
    const codigoInvitado = normalizeText(
        source.codigoInvitado ?? source.codigo ?? source.codigoInvitacion ?? source.folio ?? source.code,
        160
    );
    const llegadaRegistrada = estado === 'llego';
    const confirmado = estado === 'confirmado' || estado === 'llego';
    const horaLlegada = llegadaRegistrada ? normalizeArrivalTime(source.horaLlegada) : null;
    let checkinSecuencia;
    try {
        checkinSecuencia = normalizeCheckinSequence(source.checkinSecuencia, { strict });
    } catch {
        throw new GuestContractError('guest/invalid-checkin-sequence');
    }

    if (requireName && !nombre) throw new GuestContractError('guest/invalid-name');
    if (strict && correo && !isValidEmail(correo)) throw new GuestContractError('guest/invalid-email');
    if (strict && telefono && !isValidPhone(telefono)) throw new GuestContractError('guest/invalid-phone');

    return {
        codigoInvitado,
        nombre,
        correo,
        telefono,
        pases,
        checkinSecuencia,
        mesa,
        estado,
        confirmado,
        llegadaRegistrada,
        horaLlegada,
        tipoAcceso,
        notas: normalizeText(source.notas ?? source.comentarios ?? source.observaciones, 1000)
    };
}

export function supportsQrAccess(tipoAcceso) {
    return QR_ACCESS_TYPES.includes(normalizeAccessType(tipoAcceso, { strict: false }));
}

export function generateGuestQrToken() {
    return randomBase64Url(32);
}

/**
 * El ID de Firestore ya es único y resistente a concurrencia. Cuando está
 * disponible se usa como base del código visible; nunca se usa collection.size.
 */
export function generateGuestVisibleCode(documentId = '') {
    const safeId = normalizeText(documentId, 160).replace(/[^A-Za-z0-9_-]/g, '');
    if (safeId) return /^INV-/i.test(safeId) ? safeId : `INV-${safeId}`;
    return `INV-${randomBase64Url(16)}`;
}

export function normalizeGuestForCreate(data = {}, { documentId = '' } = {}) {
    const guest = normalizeGuestData(data, { requireName: true, strict: true });
    const qrEnabled = supportsQrAccess(guest.tipoAcceso);
    const suppliedToken = normalizeQrToken(data.qrToken);

    if (qrEnabled && suppliedToken && !isValidQrToken(suppliedToken)) {
        throw new GuestContractError('guest/invalid-qr-token');
    }

    const isAlreadyArrived = guest.llegadaRegistrada === true;
    return {
        ...guest,
        codigoInvitado: guest.codigoInvitado || generateGuestVisibleCode(documentId),
        checkinSecuencia: 0,
        pasesUtilizados: isAlreadyArrived ? guest.pases : 0,
        pasesDisponibles: isAlreadyArrived ? 0 : guest.pases,
        llegadaRegistrada: isAlreadyArrived,
        horaLlegada: isAlreadyArrived ? guest.horaLlegada : null,
        qrToken: qrEnabled ? (suppliedToken || generateGuestQrToken()) : null,
        qrActivo: qrEnabled
    };
}

export function normalizeGuestForUpdate(data = {}, current = {}, { documentId = '' } = {}) {
    const source = asObject(current);
    const cleanInput = asObject(data);
    const currentState = resolveGuestPassState(source, { strict: true });
    const guest = normalizeGuestData({ ...source, ...cleanInput }, { requireName: true, strict: true });

    if (guest.pases < currentState.pasesUtilizados) throw new GuestContractError('guest/passes-below-used');
    if (previouslyArrived(source) && guest.estado !== 'llego') {
        throw new GuestContractError('guest/arrival-reset-not-allowed');
    }

    const existingCode = normalizeStoredCode(source, documentId);
    const requestedCode = Object.hasOwn(cleanInput, 'codigoInvitado')
        ? normalizeText(cleanInput.codigoInvitado, 160)
        : '';
    if (existingCode && requestedCode && existingCode !== requestedCode) {
        throw new GuestContractError('guest/code-change-not-allowed');
    }

    const qrEnabled = supportsQrAccess(guest.tipoAcceso);
    const existingToken = normalizeQrToken(source.qrToken);
    const requestedToken = Object.hasOwn(cleanInput, 'qrToken') ? normalizeQrToken(cleanInput.qrToken) : null;
    if (existingToken && requestedToken && existingToken !== requestedToken) {
        throw new GuestContractError('guest/qr-token-regeneration-not-allowed');
    }
    if (requestedToken && !isValidQrToken(requestedToken)) throw new GuestContractError('guest/invalid-qr-token');

    const token = qrEnabled ? (existingToken || requestedToken || generateGuestQrToken()) : existingToken;
    const hasStoredQrFlag = typeof source.qrActivo === 'boolean';
    return {
        ...guest,
        codigoInvitado: existingCode || requestedCode || generateGuestVisibleCode(documentId),
        pasesUtilizados: currentState.pasesUtilizados,
        pasesDisponibles: guest.pases - currentState.pasesUtilizados,
        checkinSecuencia: normalizeStoredCheckinSequence(source.checkinSecuencia),
        horaLlegada: guest.llegadaRegistrada
            ? (normalizeArrivalTime(source.horaLlegada) ?? normalizeArrivalTime(cleanInput.horaLlegada))
            : null,
        qrToken: token,
        qrActivo: qrEnabled ? (hasStoredQrFlag ? source.qrActivo : Boolean(token)) : false
    };
}

/** Lectura sin efectos laterales: no genera códigos ni tokens nuevos. */
export function normalizeGuestForRead(data = {}, { documentId = '' } = {}) {
    const source = asObject(data);
    const guest = normalizeGuestData(source);
    const passState = resolveGuestPassState(source);
    const token = normalizeQrToken(source.qrToken);
    const qrEnabled = supportsQrAccess(guest.tipoAcceso);
    return {
        ...guest,
        codigoInvitado: guest.codigoInvitado || normalizeStoredCode(source, documentId),
        ...passState,
        checkinSecuencia: normalizeStoredCheckinSequence(source.checkinSecuencia),
        qrToken: token,
        qrActivo: qrEnabled && source.qrActivo === true && isValidQrToken(token)
    };
}

export const normalizeStoredGuestData = normalizeGuestForRead;

export function resolveGuestPassState(data = {}, { strict = false } = {}) {
    const source = asObject(data);
    const total = parseInteger(source.pases);
    if (!isValidPassTotal(total)) return failPassState(strict);

    const hasUsed = hasValue(source.pasesUtilizados) || hasValue(source.pasesUsados);
    const hasAvailable = hasValue(source.pasesDisponibles);
    const declaredUsed = parseInteger(source.pasesUtilizados ?? source.pasesUsados);
    const declaredAvailable = parseInteger(source.pasesDisponibles);
    let pasesUtilizados = hasUsed ? declaredUsed : null;
    let pasesDisponibles = hasAvailable ? declaredAvailable : null;

    if (!hasUsed && !hasAvailable) {
        pasesUtilizados = previouslyArrived(source) ? total : 0;
        pasesDisponibles = total - pasesUtilizados;
    } else if (!hasUsed) {
        pasesUtilizados = total - pasesDisponibles;
    } else if (!hasAvailable) {
        pasesDisponibles = total - pasesUtilizados;
    }

    const valid = Number.isInteger(pasesUtilizados)
        && Number.isInteger(pasesDisponibles)
        && pasesUtilizados >= 0
        && pasesDisponibles >= 0
        && pasesUtilizados <= total
        && pasesDisponibles <= total
        && pasesUtilizados + pasesDisponibles === total;
    if (!valid) return failPassState(strict, total);
    return { pases: total, pasesUtilizados, pasesDisponibles };
}

/**
 * Plan puro para un legado. El historial se entrega ya agregado por el script;
 * un contador existente y válido siempre prevalece.
 */
export function normalizeLegacyGuest(data = {}, options = {}) {
    const source = asObject(data);
    const {
        documentId = '',
        checkinPasses = 0,
        checkinCount = null,
        firstCheckinAt = null,
        generateCode = false,
        generateTokens = false
    } = options;
    const patch = {};
    const generatedFields = [];

    const booleanErrorCodes = {
        confirmado: 'guest/ambiguous-confirmed',
        llegadaRegistrada: 'guest/ambiguous-arrival-flag',
        qrActivo: 'guest/ambiguous-qr-active'
    };
    for (const key of Object.keys(booleanErrorCodes)) {
        if (Object.hasOwn(source, key)
            && typeof source[key] !== 'boolean'
            && parseUnambiguousBoolean(source[key]) === null) {
            return invalidLegacy(booleanErrorCodes[key]);
        }
    }

    const total = parseInteger(source.pases);
    if (!isValidPassTotal(total)) return invalidLegacy('guest/invalid-passes');
    if (source.pases !== total) patch.pases = total;

    const hasUsed = hasValue(source.pasesUtilizados) || hasValue(source.pasesUsados);
    const hasAvailable = hasValue(source.pasesDisponibles);
    const historyUsed = parseInteger(checkinPasses) ?? 0;
    if (historyUsed < 0 || historyUsed > total) return invalidLegacy('guest/checkins-exceed-passes');

    let used;
    if (hasUsed) {
        used = parseInteger(source.pasesUtilizados ?? source.pasesUsados);
    } else if (historyUsed > 0) {
        used = historyUsed;
        patch.pasesUtilizados = used;
    } else if (hasAvailable) {
        const available = parseInteger(source.pasesDisponibles);
        used = Number.isInteger(available) ? total - available : null;
    } else {
        used = previouslyArrived(source) ? total : 0;
        patch.pasesUtilizados = used;
    }
    if (!Number.isInteger(used) || used < 0 || used > total) return invalidLegacy('guest/invalid-pass-state');

    const available = total - used;
    if (source.pasesUtilizados !== used) patch.pasesUtilizados = used;
    if (source.pasesDisponibles !== available) patch.pasesDisponibles = available;

    const desiredCheckinSequence = checkinCount === null
        ? normalizeStoredCheckinSequence(source.checkinSecuencia)
        : normalizeMigrationCheckinCount(checkinCount);
    if (desiredCheckinSequence === null) return invalidLegacy('guest/invalid-checkin-sequence');
    if (source.checkinSecuencia !== desiredCheckinSequence) patch.checkinSecuencia = desiredCheckinSequence;

    let guest;
    try {
        guest = normalizeGuestData({ ...source, pases: total }, { requireName: true, strict: true });
    } catch (error) {
        return invalidLegacy(error?.code || 'guest/invalid-data');
    }

    ['nombre', 'correo', 'telefono', 'mesa', 'tipoAcceso', 'notas'].forEach((key) => {
        if (!Object.hasOwn(source, key) || source[key] !== guest[key]) patch[key] = guest[key];
    });

    const hasHistory = historyUsed > 0;
    const arrived = hasHistory || used > 0 || previouslyArrived(source);
    const desiredStatus = arrived ? 'llego' : guest.estado;
    const desiredConfirmed = desiredStatus === 'confirmado' || desiredStatus === 'llego';
    if (source.estado !== desiredStatus) patch.estado = desiredStatus;
    if (source.confirmado !== desiredConfirmed) patch.confirmado = desiredConfirmed;
    if (source.llegadaRegistrada !== arrived) patch.llegadaRegistrada = arrived;

    if (arrived) {
        if (!hasValue(source.horaLlegada)) {
            if (!firstCheckinAt) return invalidLegacy('guest/missing-arrival-time');
            patch.horaLlegada = firstCheckinAt;
        }
    } else if (source.horaLlegada !== null) {
        patch.horaLlegada = null;
    }

    const code = normalizeStoredCode(source, documentId);
    if (!code) {
        if (generateCode) patch.codigoInvitado = generateGuestVisibleCode(documentId);
        generatedFields.push('codigoInvitado');
    } else if (source.codigoInvitado !== code) {
        patch.codigoInvitado = code;
    }

    const qrEnabled = supportsQrAccess(guest.tipoAcceso);
    const token = normalizeQrToken(source.qrToken);
    if (token && !isValidQrToken(token)) return invalidLegacy('guest/invalid-existing-qr-token');
    if (qrEnabled && !token) {
        if (generateTokens) patch.qrToken = generateGuestQrToken();
        generatedFields.push('qrToken');
    } else if (!qrEnabled && !Object.hasOwn(source, 'qrToken')) {
        patch.qrToken = null;
    }
    const parsedQrActive = parseUnambiguousBoolean(source.qrActivo);
    if (Object.hasOwn(source, 'qrActivo') && typeof source.qrActivo !== 'boolean' && parsedQrActive === null) {
        return invalidLegacy('guest/ambiguous-qr-active');
    }
    if (qrEnabled && typeof source.qrActivo !== 'boolean') {
        patch.qrActivo = parsedQrActive ?? true;
    }
    if (!qrEnabled && source.qrActivo !== false) patch.qrActivo = false;

    return {
        status: Object.keys(patch).length || generatedFields.length ? 'update' : 'correct',
        reason: null,
        patch,
        generatedFields
    };
}

// Compatibilidad con el nombre usado por la primera herramienta Prestige.
export const planGuestPrestigeMigration = normalizeLegacyGuest;

export function isValidQrToken(value) {
    return /^[A-Za-z0-9_-]{16,256}$/.test(String(value ?? ''));
}

export function parseUnambiguousBoolean(value) {
    if (value === true || value === false) return value;
    const normalized = normalizeComparableText(value);
    if (normalized === 'true' || normalized === 'si' || normalized === 'yes' || normalized === '1') return true;
    if (normalized === 'false' || normalized === 'no' || normalized === '0') return false;
    return null;
}

function normalizeStatus(source, { strict }) {
    const rawStatus = normalizeComparableText(source.estado ?? source.status);
    const arrivalFlag = parseUnambiguousBoolean(source.llegadaRegistrada ?? source.llego ?? source.checkIn);
    const confirmationFlag = parseUnambiguousBoolean(source.confirmado ?? source.asistenciaConfirmada);
    if (!rawStatus) {
        if (arrivalFlag === true || hasValue(source.horaLlegada)) return 'llego';
        if (confirmationFlag === true) return 'confirmado';
        return 'pendiente';
    }
    if (rawStatus.includes('llego') || rawStatus.includes('arrivo') || rawStatus.includes('arrived')) return 'llego';
    if (rawStatus.includes('confirm')) return 'confirmado';
    if (rawStatus.includes('no asist') || rawStatus.includes('cancel')) return 'no_asistira';
    if (rawStatus.includes('pend')) return 'pendiente';
    if (strict) throw new GuestContractError('guest/invalid-status');
    return 'pendiente';
}

function normalizeAccessType(value, { strict }) {
    const comparable = normalizeComparableText(value);
    if (!comparable || comparable.includes('ambos')) return 'ambos';
    if (comparable.includes('qr')) return 'qr';
    if (comparable.includes('enlace') || comparable.includes('link') || comparable.includes('url')) return 'enlace';
    if (comparable.includes('manual') || comparable.includes('impreso') || comparable.includes('print')) return 'manual';
    if (strict) throw new GuestContractError('guest/invalid-access-type');
    return 'manual';
}

function normalizePasses(value, { strict }) {
    const parsed = parseInteger(value);
    if (!hasValue(value)) return 1;
    if (isValidPassTotal(parsed)) return parsed;
    if (strict) throw new GuestContractError('guest/invalid-passes');
    return 1;
}

function normalizeTable(value, { strict }) {
    if (!hasValue(value)) return null;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    const match = normalizeComparableText(value).match(/^(?:mesa\s*)?(\d+)$/);
    if (match) return Number(match[1]);
    if (strict) throw new GuestContractError('guest/invalid-table');
    return null;
}

function normalizeArrivalTime(value) {
    return hasValue(value) ? value : null;
}

function normalizeStoredCheckinSequence(value) {
    return normalizeCheckinSequence(value, { strict: false });
}

function normalizeMigrationCheckinCount(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeStoredCode(source, documentId = '') {
    const code = normalizeText(source.codigoInvitado ?? source.codigo ?? source.codigoInvitacion ?? source.folio ?? source.code, 160);
    if (code) return code;
    return /^INV-[A-Za-z0-9_-]+$/i.test(documentId) ? documentId : '';
}

function normalizeQrToken(value) {
    return normalizeText(value, 256) || null;
}

function previouslyArrived(source) {
    return parseUnambiguousBoolean(source.llegadaRegistrada ?? source.llego ?? source.checkIn) === true
        || hasValue(source.horaLlegada)
        || normalizeStatus(source, { strict: false }) === 'llego';
}

function invalidLegacy(reason) {
    return { status: 'invalid', reason, patch: {}, generatedFields: [] };
}

function failPassState(strict, total = 1) {
    if (strict) throw new GuestContractError('guest/invalid-pass-state');
    return { pases: isValidPassTotal(total) ? total : 1, pasesUtilizados: 0, pasesDisponibles: isValidPassTotal(total) ? total : 1 };
}

function isValidPassTotal(value) {
    return Number.isInteger(value) && value >= 1 && value <= 999;
}

function parseInteger(value) {
    if (typeof value === 'number') return Number.isInteger(value) ? value : null;
    const text = normalizeText(value, 30);
    if (!text || !/^[+-]?\d+$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function hasValue(value) {
    return value !== undefined && value !== null && value !== '';
}

function randomBase64Url(byteLength) {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.getRandomValues) throw new GuestContractError('guest/secure-random-unavailable');
    const bytes = new Uint8Array(byteLength);
    cryptoApi.getRandomValues(bytes);
    let binary = '';
    bytes.forEach((value) => { binary += String.fromCharCode(value); });
    if (typeof globalThis.btoa !== 'function') throw new GuestContractError('guest/secure-random-unavailable');
    return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizeText(value, maxLength) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeComparableText(value) {
    return normalizeText(value, 160)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[\-_./]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizePhone(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const digits = text.replace(/\D/g, '');
    return digits ? `${text.startsWith('+') ? '+' : ''}${digits}` : '';
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
}

function asObject(value) {
    return value && typeof value === 'object' ? value : {};
}

function field(type, meaning, required, unique, strategy) {
    return Object.freeze({ type, meaning, required, unique, strategy });
}
