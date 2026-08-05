export class CheckinValidationError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export function isSafeDocumentId(value) {
    return typeof value === 'string'
        && value.trim().length > 0
        && value.trim().length <= 1_500
        && !value.includes('/');
}

export function validPassCount(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 999 ? parsed : null;
}

/**
 * Turns legacy check-in fields into one internally consistent operational state.
 * It does not alter the source document; the transaction persists the normalized
 * fields only after all validations succeed.
 */
export function normalizeCheckinPassState(guest = {}) {
    const pasesTotales = Number(guest.pases ?? 0);
    const pasesUtilizadosDeclarados = Number(guest.pasesUtilizados ?? 0);
    const pasesDisponiblesDeclarados = Number(guest.pasesDisponibles);
    const hasUsed = guest.pasesUtilizados !== undefined && guest.pasesUtilizados !== null;
    const hasAvailable = Number.isFinite(pasesDisponiblesDeclarados);

    let pasesUtilizados = pasesUtilizadosDeclarados;
    let pasesDisponibles = hasAvailable
        ? pasesDisponiblesDeclarados
        : Math.max(0, pasesTotales - pasesUtilizados);

    // Documents created before operational counters existed may contain only one
    // counter. Infer the other one without changing the total number of passes.
    if (!hasUsed && hasAvailable) pasesUtilizados = pasesTotales - pasesDisponibles;
    if (!hasUsed && !hasAvailable && (guest.llegadaRegistrada === true || guest.estado === 'llego')) {
        pasesUtilizados = pasesTotales;
        pasesDisponibles = 0;
    }

    const isValidInteger = (value) => Number.isInteger(value) && value >= 0;
    if (!Number.isInteger(pasesTotales) || pasesTotales <= 0
        || !isValidInteger(pasesUtilizados)
        || !isValidInteger(pasesDisponibles)
        || pasesUtilizados > pasesTotales
        || pasesDisponibles > pasesTotales
        || pasesUtilizados + pasesDisponibles !== pasesTotales) {
        throw new CheckinValidationError('checkin/invalid-guest-pass-data');
    }

    return { pasesTotales, pasesUtilizados, pasesDisponibles };
}

export function parseQrPayload(rawValue) {
    const raw = String(rawValue ?? '').trim();
    if (!raw) throw new CheckinValidationError('checkin/empty-qr');

    try {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && typeof data.token === 'string') {
            const token = data.token.trim();
            validateQrToken(token);
            return {
                token,
                eventId: typeof data.eventId === 'string' ? data.eventId.trim() || null : null
            };
        }
    } catch {
        // A secure pass URL or a direct token is also supported below.
    }

    try {
        const url = new URL(raw);
        const token = url.searchParams.get('t')?.trim();
        if (token) {
            validateQrToken(token);
            return {
                token,
                eventId: url.searchParams.get('eventId')?.trim()
                    || url.searchParams.get('event')?.trim()
                    || null
            };
        }
    } catch {
        if (/^[A-Za-z0-9_-]{16,256}$/.test(raw)) return { token: raw, eventId: null };
    }

    throw new CheckinValidationError('checkin/invalid-qr-format');
}

export function validateQrToken(token) {
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(String(token ?? ''))) {
        throw new CheckinValidationError('checkin/invalid-qr-format');
    }
}

export function isCheckinDebugMode() {
    try {
        if (typeof window === 'undefined') return false;
        const queryEnabled = new URLSearchParams(window.location.search).get('debugCheckin') === '1';
        return queryEnabled || window.localStorage.getItem('eventora:debug-checkin') === '1';
    } catch {
        return false;
    }
}

export function getCheckinErrorMessage(error, { debug = isCheckinDebugMode() } = {}) {
    const code = String(error?.code || error?.message || 'unknown').trim() || 'unknown';
    const normalized = code.replace(/^firestore\//, '');
    const messages = {
        'permission-denied': 'No tienes permisos para registrar entradas en este evento.',
        unauthenticated: 'Tu sesión terminó. Inicia sesión nuevamente.',
        'not-found': 'El invitado ya no existe o fue eliminado.',
        'failed-precondition': 'No fue posible completar el registro con el estado actual del pase.',
        unavailable: 'No fue posible conectar con el servidor.',
        'invalid-argument': 'Los datos de entrada no son válidos.',
        'resource-exhausted': 'El servicio está temporalmente saturado.',
        'checkin/invalid-request': 'Los datos de entrada no son válidos.',
        'checkin/invalid-method': 'Los datos de entrada no son válidos.',
        'checkin/invalid-pass-count': 'Los datos de entrada no son válidos.',
        'checkin/invalid-guest-pass-data': 'El pase tiene campos numéricos inválidos y no puede registrarse.',
        'checkin/guest-not-found': 'El invitado ya no existe o fue eliminado.',
        'checkin/passes-already-used': 'Todos los pases de este invitado ya fueron utilizados.',
        'checkin/insufficient-passes': 'La cantidad solicitada supera los pases disponibles.',
        'checkin/invalid-token': 'El QR cambió o ya no es válido.',
        'checkin/qr-disabled': 'Este QR está desactivado.'
    };
    const message = messages[normalized] || 'No se pudo registrar la entrada.';
    return debug ? `${message} (Código: ${normalized})` : message;
}
