// Contrato canónico compartido para cualquier superficie de Eventora Studio.
// No contiene Firebase, permisos ni acceso a red.

export const GUEST_STATUSES = Object.freeze(['pendiente', 'confirmado', 'no_asistira', 'llego']);
export const GUEST_ACCESS_TYPES = Object.freeze(['ambos', 'qr', 'enlace', 'manual']);
export const QR_ACCESS_TYPES = Object.freeze(['ambos', 'qr']);

export class GuestContractError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

/**
 * Normaliza los campos descriptivos del invitado sin persistirlo ni generar
 * identificadores. `estado` es la fuente de verdad de confirmado y llegada.
 */
export function normalizeGuestData(data = {}, { requireName = false, strict = false } = {}) {
    const source = data && typeof data === 'object' ? data : {};
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

    if (requireName && !nombre) throw new GuestContractError('guest/invalid-name');
    if (strict && correo && !isValidEmail(correo)) throw new GuestContractError('guest/invalid-email');
    if (strict && telefono && !isValidPhone(telefono)) throw new GuestContractError('guest/invalid-phone');

    return {
        codigoInvitado,
        nombre,
        correo,
        telefono,
        pases,
        mesa,
        estado,
        confirmado,
        llegadaRegistrada,
        horaLlegada,
        tipoAcceso,
        notas: normalizeText(source.notas ?? source.comentarios ?? source.observaciones, 1000)
    };
}

/** True only for the two values that the versioned UI defines as QR-capable. */
export function supportsQrAccess(tipoAcceso) {
    return QR_ACCESS_TYPES.includes(normalizeAccessType(tipoAcceso, { strict: false }));
}

/** A cryptographically random token accepted by the existing Portal QR parser. */
export function generateGuestQrToken() {
    return randomBase64Url(32);
}

/**
 * A visible code independent of the Firestore document ID. It is random rather
 * than a count so simultaneous creates cannot produce a sequential collision.
 */
export function generateGuestVisibleCode() {
    return `INV-${randomBase64Url(16)}`;
}

/**
 * Canonical creation boundary used by both manual creation and Excel batches.
 * Numeric input such as the string "4" is converted before it reaches
 * Firestore. Existing input tokens are kept; a token is never regenerated.
 */
export function normalizeGuestForCreate(data = {}, options = {}) {
    const guest = normalizeGuestData(data, { requireName: true, strict: true });
    const qrEnabled = supportsQrAccess(guest.tipoAcceso);
    const suppliedToken = normalizeQrToken(data.qrToken);

    if (qrEnabled && suppliedToken && !isValidQrToken(suppliedToken)) {
        throw new GuestContractError('guest/invalid-qr-token');
    }

    // A newly created guest marked as already arrived is an explicit exception:
    // keep the arrival semantics and make its counters consistent.
    const isAlreadyArrived = guest.llegadaRegistrada === true;
    return {
        ...guest,
        codigoInvitado: guest.codigoInvitado || generateGuestVisibleCode(),
        pasesUtilizados: isAlreadyArrived ? guest.pases : 0,
        pasesDisponibles: isAlreadyArrived ? 0 : guest.pases,
        llegadaRegistrada: isAlreadyArrived,
        horaLlegada: isAlreadyArrived ? guest.horaLlegada : null,
        qrToken: qrEnabled ? (suppliedToken || generateGuestQrToken()) : null,
        qrActivo: qrEnabled
    };
}

/**
 * Normalizes an Admin edit while retaining operational counters and an existing
 * QR token. Total passes may grow, but can never be reduced below used passes.
 */
export function normalizeGuestForUpdate(data = {}, current = {}) {
    const source = current && typeof current === 'object' ? current : {};
    const cleanInput = data && typeof data === 'object' ? data : {};
    const currentState = resolveGuestPassState(source, { strict: true });
    const guest = normalizeGuestData({ ...source, ...cleanInput }, { requireName: true, strict: true });

    if (guest.pases < currentState.pasesUtilizados) {
        throw new GuestContractError('guest/passes-below-used');
    }

    const qrEnabled = supportsQrAccess(guest.tipoAcceso);
    const existingToken = normalizeQrToken(source.qrToken);
    const requestedToken = Object.prototype.hasOwnProperty.call(cleanInput, 'qrToken')
        ? normalizeQrToken(cleanInput.qrToken)
        : null;
    if (existingToken && requestedToken && existingToken !== requestedToken) {
        throw new GuestContractError('guest/qr-token-regeneration-not-allowed');
    }
    if (requestedToken && !isValidQrToken(requestedToken)) {
        throw new GuestContractError('guest/invalid-qr-token');
    }

    const token = qrEnabled ? (existingToken || requestedToken || generateGuestQrToken()) : existingToken;
    const hasStoredQrFlag = typeof source.qrActivo === 'boolean';
    const isAlreadyArrived = guest.llegadaRegistrada === true;
    return {
        ...guest,
        codigoInvitado: guest.codigoInvitado || normalizeStoredCode(source) || generateGuestVisibleCode(),
        pasesUtilizados: currentState.pasesUtilizados,
        pasesDisponibles: guest.pases - currentState.pasesUtilizados,
        llegadaRegistrada: isAlreadyArrived,
        horaLlegada: isAlreadyArrived
            ? (normalizeArrivalTime(source.horaLlegada) ?? normalizeArrivalTime(cleanInput.horaLlegada))
            : null,
        qrToken: token,
        qrActivo: qrEnabled ? (hasStoredQrFlag ? source.qrActivo : Boolean(token)) : false
    };
}

/**
 * Converts a stored document to the complete in-memory contract. It does not
 * write or generate a new token/code, which keeps reads side-effect free.
 */
export function normalizeStoredGuestData(data = {}, { documentId = '' } = {}) {
    const source = data && typeof data === 'object' ? data : {};
    const guest = normalizeGuestData(source);
    const passState = resolveGuestPassState(source);
    const token = normalizeQrToken(source.qrToken);
    const qrEnabled = supportsQrAccess(guest.tipoAcceso);
    return {
        ...guest,
        codigoInvitado: guest.codigoInvitado || normalizeStoredCode(source, documentId),
        ...passState,
        qrToken: token,
        qrActivo: qrEnabled && source.qrActivo === true && isValidQrToken(token)
    };
}

/**
 * Resolves legacy pass fields without changing the source document. Strict
 * mode is used before writes and rejects inconsistent data.
 */
export function resolveGuestPassState(data = {}, { strict = false } = {}) {
    const source = data && typeof data === 'object' ? data : {};
    const total = parseInteger(source.pases);
    if (!isValidPassTotal(total)) return failPassState(strict);

    const hasUsed = hasValue(source.pasesUtilizados) || hasValue(source.pasesUsados);
    const hasAvailable = hasValue(source.pasesDisponibles);
    const declaredUsed = parseInteger(source.pasesUtilizados ?? source.pasesUsados);
    const declaredAvailable = parseInteger(source.pasesDisponibles);

    let pasesUtilizados = hasUsed ? declaredUsed : null;
    let pasesDisponibles = hasAvailable ? declaredAvailable : null;

    if (!hasUsed && !hasAvailable) {
        pasesUtilizados = source.llegadaRegistrada === true || source.estado === 'llego' ? total : 0;
        pasesDisponibles = total - pasesUtilizados;
    } else if (!hasUsed) {
        pasesUtilizados = total - pasesDisponibles;
    } else if (!hasAvailable) {
        pasesDisponibles = total - pasesUtilizados;
    }

    const isConsistent = Number.isInteger(pasesUtilizados)
        && Number.isInteger(pasesDisponibles)
        && pasesUtilizados >= 0
        && pasesDisponibles >= 0
        && pasesUtilizados <= total
        && pasesDisponibles <= total
        && pasesUtilizados + pasesDisponibles === total;

    if (!isConsistent) return failPassState(strict, total);
    return { pases: total, pasesUtilizados, pasesDisponibles };
}

/**
 * Calculates an additive patch for the controlled prestige migration. It never
 * changes identity fields or an existing QR token. `generateTokens` is false
 * by default so a dry run has no token side effects.
 */
export function planGuestPrestigeMigration(data = {}, { generateTokens = false } = {}) {
    const source = data && typeof data === 'object' ? data : {};
    const total = parseInteger(source.pases);
    if (!isValidPassTotal(total)) {
        return { status: 'invalid', reason: 'guest/invalid-passes', patch: {}, needsQrToken: false, hasExistingToken: hasValue(source.qrToken) };
    }

    let state;
    try {
        state = resolveGuestPassState(source, { strict: true });
    } catch (error) {
        return { status: 'invalid', reason: error?.code || 'guest/invalid-pass-state', patch: {}, needsQrToken: false, hasExistingToken: hasValue(source.qrToken) };
    }

    const patch = {};
    if (source.pases !== total) patch.pases = total;
    if (source.pasesUtilizados !== state.pasesUtilizados) patch.pasesUtilizados = state.pasesUtilizados;
    if (source.pasesDisponibles !== state.pasesDisponibles) patch.pasesDisponibles = state.pasesDisponibles;

    const guest = normalizeGuestData({ ...source, pases: total });
    const qrEnabled = supportsQrAccess(guest.tipoAcceso);
    const existingToken = normalizeQrToken(source.qrToken);
    const hasExistingToken = Boolean(existingToken);
    const needsQrToken = qrEnabled && !existingToken;

    if (qrEnabled && existingToken && !isValidQrToken(existingToken)) {
        return { status: 'invalid', reason: 'guest/invalid-existing-qr-token', patch: {}, needsQrToken: false, hasExistingToken: true };
    }
    if (needsQrToken && generateTokens) patch.qrToken = generateGuestQrToken();
    if (qrEnabled && typeof source.qrActivo !== 'boolean') patch.qrActivo = true;

    const hasPatch = Object.keys(patch).length > 0 || needsQrToken;
    return {
        status: hasPatch ? 'update' : 'correct',
        reason: null,
        patch,
        needsQrToken,
        hasExistingToken
    };
}

export function isValidQrToken(value) {
    return /^[A-Za-z0-9_-]{16,256}$/.test(String(value ?? ''));
}

function normalizeStatus(source, { strict }) {
    const rawStatus = normalizeComparableText(source.estado ?? source.status);
    if (!rawStatus) {
        if (Boolean(source.llegadaRegistrada || source.llego || source.checkIn || source.horaLlegada)) return 'llego';
        if (Boolean(source.confirmado || source.asistenciaConfirmada)) return 'confirmado';
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
    if (value === null || value === undefined || normalizeText(value, 30) === '') return 1;
    if (isValidPassTotal(parsed)) return parsed;
    if (strict) throw new GuestContractError('guest/invalid-passes');
    return 1;
}

function normalizeTable(value, { strict }) {
    if (value === null || value === undefined || normalizeText(value, 80) === '') return null;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    const text = normalizeComparableText(value);
    const match = text.match(/^(?:mesa\s*)?(\d+)$/);
    if (match) return Number(match[1]);
    if (strict) throw new GuestContractError('guest/invalid-table');
    return null;
}

function normalizeArrivalTime(value) {
    return value === null || value === undefined || value === '' ? null : value;
}

function normalizeStoredCode(source, documentId = '') {
    const code = normalizeText(source.codigoInvitado ?? source.codigo ?? source.codigoInvitacion ?? source.folio ?? source.code, 160);
    if (code) return code;
    return /^INV-\d+$/i.test(documentId) ? documentId : '';
}

function normalizeQrToken(value) {
    return normalizeText(value, 256) || null;
}

function failPassState(strict, total = 1) {
    if (strict) throw new GuestContractError('guest/invalid-pass-state');
    return { pases: isValidPassTotal(total) ? total : 1, pasesUtilizados: 0, pasesDisponibles: isValidPassTotal(total) ? total : 1 };
}

function isValidPassTotal(value) {
    return Number.isInteger(value) && value >= 1 && value <= 999;
}

function parseInteger(value) {
    const text = normalizeText(value, 30);
    if (!text) return null;
    const parsed = Number(text.replace(',', '.'));
    return Number.isInteger(parsed) ? parsed : null;
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
