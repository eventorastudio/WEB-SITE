const DEFAULT_QR_ENDPOINT = 'https://api.qrserver.com/v1/create-qr-code/';

export function buildQrCodeUrl(value, { size = 300, endpoint = DEFAULT_QR_ENDPOINT } = {}) {
    if (!String(value ?? '').trim()) throw new TypeError('El contenido del QR no puede estar vacío.');
    const base = String(endpoint).endsWith('?') ? String(endpoint) : `${String(endpoint)}?`;
    const params = new URLSearchParams({ size: `${size}x${size}`, data: String(value) });
    return `${base}${params.toString()}`;
}
