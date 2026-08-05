// Contrato canónico compartido para cualquier superficie de Eventora Studio.
// No contiene Firebase, permisos ni acceso a red.

export const GUEST_STATUSES = Object.freeze(['pendiente', 'confirmado', 'no_asistira', 'llego']);
export const GUEST_ACCESS_TYPES = Object.freeze(['ambos', 'qr', 'enlace', 'manual']);

/**
 * Normaliza datos de invitados sin alterar el documento de origen.
 * `estado` es la fuente de verdad para confirmado y llegada.
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

    if (requireName && !nombre) throw new Error('guest/invalid-name');
    if (strict && correo && !isValidEmail(correo)) throw new Error('guest/invalid-email');
    if (strict && telefono && !isValidPhone(telefono)) throw new Error('guest/invalid-phone');

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
    if (strict) throw new Error('guest/invalid-status');
    return 'pendiente';
}

function normalizeAccessType(value, { strict }) {
    const comparable = normalizeComparableText(value);
    if (!comparable || comparable.includes('ambos')) return 'ambos';
    if (comparable.includes('qr')) return 'qr';
    if (comparable.includes('enlace') || comparable.includes('link') || comparable.includes('url')) return 'enlace';
    if (comparable.includes('manual') || comparable.includes('impreso') || comparable.includes('print')) return 'manual';
    if (strict) throw new Error('guest/invalid-access-type');
    return 'manual';
}

function normalizePasses(value, { strict }) {
    const text = normalizeText(value, 30);
    if (!text) return 1;
    const parsed = Number(text.replace(',', '.'));
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 999) return parsed;
    if (strict) throw new Error('guest/invalid-passes');
    return 1;
}

function normalizeTable(value, { strict }) {
    if (value === null || value === undefined || normalizeText(value, 80) === '') return null;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;

    const text = normalizeComparableText(value);
    const match = text.match(/^(?:mesa\s*)?(\d+)$/);
    if (match) return Number(match[1]);
    if (strict) throw new Error('guest/invalid-table');
    return null;
}

function normalizeArrivalTime(value) {
    if (value === null || value === undefined || value === '') return null;
    return value;
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
