import { normalizeStoredGuestData } from './guest-contract.js';

// Contrato canónico de estadísticas de un evento. Este módulo es puro y se
// comparte entre Admin, Portal y scripts; nunca importa Firebase.
export const EVENT_STATS_SCHEMA_VERSION = 1;

export const EVENT_STATS_FIELDS = Object.freeze([
    'guestCount',
    'totalPases',
    'pasesConfirmados',
    'pasesPendientes',
    'pasesNoAsistiran',
    'pasesUtilizados',
    'pasesDisponibles',
    'gruposConfirmados',
    'gruposPendientes',
    'gruposNoAsistiran',
    'gruposConLlegada'
]);

export function createEmptyEventStats() {
    return {
        guestCount: 0,
        totalPases: 0,
        pasesConfirmados: 0,
        pasesPendientes: 0,
        pasesNoAsistiran: 0,
        pasesUtilizados: 0,
        pasesDisponibles: 0,
        gruposConfirmados: 0,
        gruposPendientes: 0,
        gruposNoAsistiran: 0,
        gruposConLlegada: 0
    };
}

/** Calcula la única representación válida a partir de documentos de invitados. */
export function calculateEventStats(guests = []) {
    if (!Array.isArray(guests)) throw new TypeError('event-stats/guests-must-be-array');

    return guests.reduce((stats, source, index) => {
        const documentId = String(source?.id ?? source?.documentId ?? `guest-${index}`);
        const guest = normalizeStoredGuestData(source, { documentId });
        stats.guestCount += 1;
        stats.totalPases += guest.pases;
        stats.pasesUtilizados += guest.pasesUtilizados;
        stats.pasesDisponibles += guest.pasesDisponibles;

        if (guest.estado === 'confirmado' || guest.estado === 'llego') {
            stats.pasesConfirmados += guest.pases;
            stats.gruposConfirmados += 1;
        } else if (guest.estado === 'no_asistira') {
            stats.pasesNoAsistiran += guest.pases;
            stats.gruposNoAsistiran += 1;
        } else {
            stats.pasesPendientes += guest.pases;
            stats.gruposPendientes += 1;
        }

        if (guest.pasesUtilizados > 0) stats.gruposConLlegada += 1;
        return stats;
    }, createEmptyEventStats());
}

/** Lee únicamente el resumen canónico; deliberadamente no acepta campos legacy. */
export function getStoredEventStats(eventData = {}) {
    return normalizeEventStats(eventData?.estadisticas);
}

export function normalizeEventStats(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const normalized = {};
    for (const field of EVENT_STATS_FIELDS) {
        const number = Number(value[field]);
        if (!Number.isSafeInteger(number) || number < 0) return null;
        normalized[field] = number;
    }
    if (!hasValidInvariants(normalized)) return null;
    return normalized;
}

/** Aplica cambios de invitados a un resumen válido, para transacciones atómicas. */
export function applyGuestStatsChanges(currentStats, changes = []) {
    const current = normalizeEventStats(currentStats);
    if (!current) return null;
    const next = { ...current };

    for (const change of changes) {
        const before = change?.before ? calculateEventStats([change.before]) : createEmptyEventStats();
        const after = change?.after ? calculateEventStats([change.after]) : createEmptyEventStats();
        for (const field of EVENT_STATS_FIELDS) next[field] += after[field] - before[field];
    }

    return normalizeEventStats(next);
}

/** Patch compartido por escrituras Admin y check-in del Portal. */
export function createEventStatsMutation(eventData, changes, updatedAt) {
    const revision = toRevision(eventData?.statsRevision) + 1;
    const updatedStats = applyGuestStatsChanges(eventData?.estadisticas, changes);
    return {
        statsRevision: revision,
        ...(updatedStats ? {
            estadisticas: updatedStats,
            statsSchemaVersion: EVENT_STATS_SCHEMA_VERSION,
            statsUpdatedAt: updatedAt
        } : {})
    };
}

export function diffEventStats(stored, calculated) {
    const normalizedStored = normalizeEventStats(stored);
    const normalizedCalculated = normalizeEventStats(calculated);
    if (!normalizedCalculated) throw new TypeError('event-stats/invalid-calculated-stats');
    const differences = {};
    for (const field of EVENT_STATS_FIELDS) {
        const storedValue = normalizedStored ? normalizedStored[field] : null;
        if (storedValue !== normalizedCalculated[field]) {
            differences[field] = { stored: storedValue, actual: normalizedCalculated[field] };
        }
    }
    return differences;
}

function hasValidInvariants(stats) {
    return stats.pasesConfirmados + stats.pasesPendientes + stats.pasesNoAsistiran === stats.totalPases
        && stats.pasesUtilizados + stats.pasesDisponibles === stats.totalPases
        && stats.gruposConfirmados + stats.gruposPendientes + stats.gruposNoAsistiran === stats.guestCount
        && stats.gruposConLlegada <= stats.guestCount
        && stats.pasesUtilizados <= stats.totalPases;
}

function toRevision(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
