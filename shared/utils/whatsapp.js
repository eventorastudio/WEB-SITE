export function normalizeWhatsAppNumber(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (digits.length < 10) throw new TypeError('Número de WhatsApp inválido.');
    return digits;
}

export function buildWhatsAppUrl(phone, message = '') {
    const number = normalizeWhatsAppNumber(phone);
    const query = String(message) ? `?text=${encodeURIComponent(String(message))}` : '';
    return `https://wa.me/${number}${query}`;
}
