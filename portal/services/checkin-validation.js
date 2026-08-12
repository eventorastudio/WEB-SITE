import {
    GuestContractError,
    normalizeGuestData,
    resolveGuestPassState
} from '../../shared/guest-contract.js';
import { allocateNextCheckin } from '../../shared/checkin-numbering.js';
import { parseQrPayloadValue } from '../../shared/qr-code.js';

export const CHECKIN_GUEST_UPDATE_FIELDS = Object.freeze([
    'pasesUtilizados',
    'pasesDisponibles',
    'llegadaRegistrada',
    'horaLlegada',
    'estado',
    'checkinSecuencia',
    'ultimoCheckinId',
    'fechaActualizacion'
]);

export const CHECKIN_RECORD_FIELDS = Object.freeze([
    'eventId',
    'invitadoId',
    'codigoInvitado',
    'nombreInvitado',
    'pasesRegistrados',
    'pasesDisponiblesDespues',
    'fechaHora',
    'registradoPor',
    'metodo',
    'resultado',
    'checkinSecuencia'
]);

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

/** Delegates the operational pass contract to the shared canonical module. */
export function normalizeCheckinPassState(guest = {}) {
    try {
        const state = resolveGuestPassState(guest, { strict: true });
        return {
            pasesTotales: state.pases,
            pasesUtilizados: state.pasesUtilizados,
            pasesDisponibles: state.pasesDisponibles
        };
    } catch (error) {
        if (error instanceof GuestContractError) {
            throw new CheckinValidationError('checkin/invalid-guest-pass-data');
        }
        throw error;
    }
}

/**
 * Pure representation of the exact writes used by the Firestore transaction.
 * `timestamp` is supplied by the service as one serverTimestamp transform and
 * makes the mutation testable without Firebase.
 */
export function buildCheckinMutation({
    guest,
    eventId,
    guestId,
    requestedPasses,
    method,
    qrToken = null,
    userId,
    timestamp
}) {
    if (!isSafeDocumentId(eventId) || !isSafeDocumentId(guestId) || !isSafeDocumentId(userId)) {
        throw new CheckinValidationError('checkin/invalid-request');
    }
    if (!['qr', 'manual'].includes(method)) throw new CheckinValidationError('checkin/invalid-method');
    if (!validPassCount(requestedPasses)) throw new CheckinValidationError('checkin/invalid-pass-count');
    if (!timestamp) throw new CheckinValidationError('checkin/timestamp-required');
    if (method === 'qr') validateQrToken(qrToken);

    const raw = guest && typeof guest === 'object' ? guest : {};
    if (method === 'qr' && (raw.qrActivo !== true || raw.qrToken !== qrToken)) {
        throw new CheckinValidationError(raw.qrActivo === false ? 'checkin/qr-disabled' : 'checkin/invalid-token');
    }

    let allocation;
    try {
        allocation = allocateNextCheckin(guestId, raw.checkinSecuencia);
    } catch {
        throw new CheckinValidationError('checkin/invalid-sequence');
    }

    const { pasesTotales, pasesUtilizados, pasesDisponibles } = normalizeCheckinPassState(raw);
    if (pasesDisponibles <= 0) throw new CheckinValidationError('checkin/passes-already-used');
    if (requestedPasses > pasesDisponibles) throw new CheckinValidationError('checkin/insufficient-passes');

    const pasesUtilizadosDespues = pasesUtilizados + requestedPasses;
    const pasesDisponiblesDespues = pasesTotales - pasesUtilizadosDespues;
    const resultado = pasesDisponiblesDespues > 0 ? 'parcial' : 'aprobado';
    const canonicalGuest = normalizeGuestData(raw);
    return {
        guest: {
            ...canonicalGuest,
            pases: pasesTotales,
            pasesUtilizados: pasesUtilizadosDespues,
            pasesDisponibles: pasesDisponiblesDespues,
            checkinSecuencia: allocation.sequence,
            ultimoCheckinId: allocation.id
        },
        guestUpdate: {
            pasesUtilizados: pasesUtilizadosDespues,
            pasesDisponibles: pasesDisponiblesDespues,
            llegadaRegistrada: true,
            horaLlegada: raw.horaLlegada ?? timestamp,
            estado: 'llego',
            checkinSecuencia: allocation.sequence,
            ultimoCheckinId: allocation.id,
            fechaActualizacion: timestamp
        },
        checkinRecord: {
            eventId,
            invitadoId: guestId,
            codigoInvitado: String(canonicalGuest.codigoInvitado || ''),
            nombreInvitado: String(canonicalGuest.nombre || ''),
            pasesRegistrados: requestedPasses,
            pasesDisponiblesDespues,
            fechaHora: timestamp,
            registradoPor: userId,
            metodo: method,
            resultado,
            checkinSecuencia: allocation.sequence
        },
        checkinId: allocation.id,
        checkinSequence: allocation.sequence,
        passesRegistered: requestedPasses,
        result: resultado
    };
}

/** Equivalente puro de affectedKeys() para el patch emitido por el cliente. */
export function getGuestAffectedFields(guest = {}, guestUpdate = {}) {
    return Object.keys(guestUpdate).filter((field) => !Object.is(guest[field], guestUpdate[field]));
}

export function parseQrPayload(rawValue) {
    try {
        return parseQrPayloadValue(rawValue);
    } catch (error) {
        const code = error?.message === 'qr/empty-payload' ? 'checkin/empty-qr' : 'checkin/invalid-qr-format';
        throw new CheckinValidationError(code);
    }
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
        'checkin/invalid-sequence': 'El contador de check-ins no está inicializado correctamente. Ejecuta primero la migración preparada.',
        'checkin/id-conflict': 'El siguiente ID de check-in ya existe. Detén los registros y revisa la secuencia del invitado.',
        'checkin/renumbering-in-progress': 'El historial de entradas se está renumerando. Intenta nuevamente en unos minutos.',
        'checkin/guest-renumbering-in-progress': 'La numeración de invitados se está finalizando. Intenta nuevamente en unos minutos.',
        'checkin/event-not-found': 'El evento ya no existe o no está disponible.',
        'checkin/guest-not-found': 'El invitado ya no existe o fue eliminado.',
        'checkin/passes-already-used': 'Todos los pases de este invitado ya fueron utilizados.',
        'checkin/insufficient-passes': 'La cantidad solicitada supera los pases disponibles.',
        'checkin/invalid-token': 'El QR cambió o ya no es válido.',
        'checkin/qr-disabled': 'Este QR está desactivado.'
    };
    const message = messages[normalized] || 'No se pudo registrar la entrada.';
    return debug ? `${message} (Código: ${normalized})` : message;
}
