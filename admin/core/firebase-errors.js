const ERROR_MESSAGES = Object.freeze({
    'permission-denied': ['Acceso denegado', 'Tu cuenta no tiene permisos para consultar estos datos. Verifica sus custom claims.'],
    unauthenticated: ['Sesión no válida', 'Tu sesión terminó. Inicia sesión nuevamente.'],
    'failed-precondition': ['Consulta no disponible', 'La consulta requiere una condición o índice que todavía no está disponible.'],
    unavailable: ['Servicio no disponible', 'Firebase no respondió temporalmente. Intenta nuevamente más tarde.'],
    'not-found': ['Recurso no encontrado', 'El recurso solicitado no existe o fue eliminado.'],
    'invalid-argument': ['Solicitud no válida', 'La consulta contiene un dato o parámetro inválido.'],
    'app-check': ['Validación de aplicación rechazada', 'App Check no pudo validar esta sesión. Revisa el dominio y la configuración del proveedor.'],
    'admin/missing-role-claim': ['Acceso administrativo no configurado', 'La sesión existe, pero no contiene un custom claim interno válido.'],
    'admin/claims-unavailable': ['No fue posible validar permisos', 'No se pudieron leer los custom claims de la sesión.']
});

export function classifyAdminFirebaseError(error) {
    const rawCode = String(error?.code || '').trim();
    const rawMessage = String(error?.message || '').trim();
    const normalizedCode = normalizeCode(rawCode, rawMessage);
    const [title, userMessage] = ERROR_MESSAGES[normalizedCode]
        || ['Error de Firebase', 'No fue posible completar la operación solicitada.'];
    return { code: normalizedCode || 'unknown', rawCode, rawMessage, title, userMessage };
}

export function reportAdminFirebaseError(error, context = {}) {
    const detail = classifyAdminFirebaseError(error);
    console.error('[Admin Firebase]', {
        code: detail.rawCode || detail.code,
        message: detail.rawMessage || String(error),
        stack: error?.stack,
        operation: context.operation,
        collection: context.collection
    });
    return detail;
}

export function createAdminAccessError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
}

function normalizeCode(rawCode, message) {
    const code = rawCode.replace(/^(firestore|auth)\//, '');
    if (/app.?check|app attestation|attestation/i.test(`${rawCode} ${message}`)) return 'app-check';
    return code;
}
