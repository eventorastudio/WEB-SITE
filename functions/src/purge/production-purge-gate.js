// Production purge gate: intentionally closed in Fase 2E2D.
// No environment variable, frontend flag, query parameter or callable can
// switch this value on.
export const PRODUCTION_PROJECT_ID = 'eventorastudio-d6d95';
export const PRODUCTION_STORAGE_BUCKET = 'eventorastudio-d6d95.firebasestorage.app';
export const PRODUCTION_PURGE_KILL_SWITCH = false;

export function assertProductionPurgeGate() {
    const error = new Error('PRODUCTION_PURGE_DISABLED');
    error.code = 'PRODUCTION_PURGE_DISABLED';
    throw error;
}
