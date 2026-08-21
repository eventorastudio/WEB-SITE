// invitation-utils.js
// Módulo 6: Motor de Generación de Invitaciones Digitales

/**
 * Genera un token seguro alfanumérico de longitud especificada (mínimo 32).
 * @param {Array} existingTokens - Arreglo de tokens existentes para evitar colisiones.
 * @returns {string} Token único.
 */
export function generateToken(existingTokens = []) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    let isUnique = false;
    
    while (!isUnique) {
        token = '';
        // Utilizar la API Web Crypto para máxima seguridad
        const randomValues = new Uint32Array(32);
        crypto.getRandomValues(randomValues);
        
        for (let i = 0; i < 32; i++) {
            token += chars[randomValues[i] % chars.length];
        }
        
        if (!existingTokens.includes(token)) {
            isUnique = true;
        }
    }
    return token;
}

/**
 * Genera la URL personalizada de la invitación.
 * @param {{eventId: string, publicKey: string, rsvpToken?: string, baseUrl?: string}} options
 * @returns {string} URL completa con event/key y token opcional.
 */
export function generateInvitationURL({ eventId, publicKey, rsvpToken = '', baseUrl = 'https://eventorastudio.com/invitacion/' } = {}) {
    const normalizedEventId = String(eventId ?? '').trim();
    const normalizedPublicKey = String(publicKey ?? '').trim();
    if (!normalizedEventId || !normalizedPublicKey) {
        throw new TypeError('invitation/route-identity-required');
    }
    const url = new URL(baseUrl);
    url.pathname = '/invitacion/';
    url.hash = '';
    url.search = '';
    url.searchParams.set('event', normalizedEventId);
    url.searchParams.set('key', normalizedPublicKey);
    const normalizedToken = String(rsvpToken ?? '').trim();
    if (normalizedToken) url.searchParams.set('token', normalizedToken);
    return url.toString();
}

/**
 * Devuelve el contenido exacto que será representado en el QR.
 * En este caso, el contenido es la URL de la invitación.
 * @param {string} url - URL personalizada.
 * @returns {string} Datos del QR.
 */
export function generateQRCode(url) {
    return url;
}

/**
 * Copia texto al portapapeles utilizando la API moderna (Clipboard API).
 * @param {string} text - Texto a copiar.
 * @param {Function} onSuccess - Callback en caso de éxito.
 * @param {Function} onError - Callback en caso de error.
 */
export async function copyInvitation(text, onSuccess, onError) {
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        if (onSuccess) onSuccess();
    } catch (err) {
        console.error('Error al copiar al portapapeles:', err);
        if (onError) onError();
    }
}
