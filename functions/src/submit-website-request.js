import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import nodemailer from 'nodemailer';

const emailUser = defineSecret('EMAIL_USER');
const emailAppPassword = defineSecret('EMAIL_APP_PASSWORD');
const recipient = 'Ev3ntorastudio@gmail.com';
const region = 'us-central1';
const maxBodyLength = 20000;
const maxLengths = {
    contactName: 120,
    whatsapp: 40,
    email: 254,
    businessName: 160,
    businessType: 160,
    city: 160,
    notes: 700
};
const allowedPlans = new Set(['esencial', 'profesional', 'a-medida', 'no-estoy-seguro']);
const allowedTemplates = new Set(['template-01', 'template-02', 'template-03', 'no-estoy-seguro', 'algo-diferente']);
const allowedNeeds = new Set(['Servicios', 'Productos', 'Galería', 'Horarios', 'Ubicación', 'WhatsApp', 'Redes sociales', 'Nosotros', 'Otro']);
const allowedOrigins = new Set([
    'https://eventorastudio.com',
    'https://www.eventorastudio.com',
    'http://localhost:5000',
    'http://localhost:5500',
    'http://localhost:8000',
    'http://localhost:8080',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8080'
]);

const labels = {
    esencial: 'Esencial',
    profesional: 'Profesional',
    'a-medida': 'A medida',
    'no-estoy-seguro': 'No estoy seguro',
    'template-01': 'Template 01',
    'template-02': 'Template 02',
    'template-03': 'Template 03',
    'algo-diferente': 'Quiero algo diferente'
};

export const submitWebsiteRequest = onRequest({
    region,
    invoker: 'public',
    cors: false,
    secrets: [emailUser, emailAppPassword],
    timeoutSeconds: 30,
    memory: '256MiB'
}, async (req, res) => {
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) {
        res.status(403).json({ ok: false, message: 'Origen no permitido.' });
        return;
    }

    if (origin) res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ ok: false, message: 'Método no permitido.' });
        return;
    }

    if (!String(req.get('content-type') || '').toLowerCase().includes('application/json')) {
        res.status(415).json({ ok: false, message: 'Formato no permitido.' });
        return;
    }

    if (Number(req.get('content-length') || 0) > maxBodyLength) {
        res.status(413).json({ ok: false, message: 'Solicitud demasiado grande.' });
        return;
    }

    const payload = req.body;
    if (!isPlainObject(payload) || JSON.stringify(payload).length > maxBodyLength) {
        res.status(400).json({ ok: false, message: 'Solicitud inválida.' });
        return;
    }

    if (String(payload.website || '').trim()) {
        res.status(400).json({ ok: false, message: 'Solicitud inválida.' });
        return;
    }

    const unexpectedKeys = Object.keys(payload).filter((key) => !new Set([
        'contactName', 'whatsapp', 'email', 'businessName', 'businessType', 'city',
        'plan', 'template', 'needs', 'notes', 'website'
    ]).has(key));
    if (unexpectedKeys.length) {
        res.status(400).json({ ok: false, message: 'Solicitud inválida.' });
        return;
    }

    const data = normalizePayload(payload);
    const validationError = validatePayload(data);
    if (validationError) {
        res.status(400).json({ ok: false, message: validationError });
        return;
    }

    try {
        const sender = emailUser.value();
        const password = emailAppPassword.value();
        if (!sender || !password) throw new Error('Email secrets are not configured.');

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: sender, pass: password }
        });
        const subject = data.businessName
            ? `Nueva solicitud Eventora — ${data.businessName}`
            : 'Nueva solicitud Eventora';

        await transporter.sendMail({
            from: `Eventora Studio <${sender}>`,
            to: recipient,
            replyTo: data.email || undefined,
            subject,
            text: buildTextEmail(data),
            html: buildHtmlEmail(data)
        });

        res.status(200).json({ ok: true });
    } catch (error) {
        logger.error('Website request email failed.', {
            code: 'website-request/email-failed',
            mailCode: safeMailErrorCode(error),
            smtpCode: Number.isInteger(error?.responseCode) ? error.responseCode : undefined,
            command: typeof error?.command === 'string' ? error.command : undefined
        });
        res.status(500).json({ ok: false, message: 'No pudimos enviar tu solicitud. Inténtalo nuevamente en unos momentos.' });
    }
});

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizePayload(payload) {
    return {
        contactName: normalizeString(payload.contactName),
        whatsapp: normalizeString(payload.whatsapp),
        email: normalizeString(payload.email).toLowerCase(),
        businessName: normalizeString(payload.businessName),
        businessType: normalizeString(payload.businessType),
        city: normalizeString(payload.city),
        plan: normalizeString(payload.plan),
        template: normalizeString(payload.template),
        needs: Array.isArray(payload.needs)
            ? [...new Set(payload.needs.filter((value) => typeof value === 'string').map((value) => value.trim()))]
            : [],
        notes: normalizeString(payload.notes)
    };
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function validatePayload(data) {
    for (const [key, limit] of Object.entries(maxLengths)) {
        if (data[key].length > limit) return 'Uno o más campos exceden el tamaño permitido.';
    }
    if (!data.contactName) return 'Falta el nombre.';
    if (!/^\+?[\d\s()-]{10,40}$/.test(data.whatsapp) || data.whatsapp.replace(/\D/g, '').length < 10) return 'El WhatsApp no es válido.';
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'El correo no es válido.';
    if (!data.businessName || !data.businessType) return 'Faltan datos del negocio.';
    if (!allowedPlans.has(data.plan) || !allowedTemplates.has(data.template)) return 'El paquete o diseño no es válido.';
    if (!data.needs.length || data.needs.length > allowedNeeds.size || data.needs.some((need) => !allowedNeeds.has(need))) return 'Selecciona necesidades válidas.';
    return '';
}

function buildTextEmail(data) {
    return [
        'NUEVA SOLICITUD — EVENTORA STUDIO', '',
        'DATOS DEL CLIENTE',
        `Nombre: ${data.contactName}`,
        `WhatsApp: ${data.whatsapp}`,
        `Correo: ${data.email || 'No proporcionado'}`, '',
        'NEGOCIO',
        `Nombre del negocio: ${data.businessName}`,
        `Giro: ${data.businessType}`,
        `Ciudad/Zona: ${data.city || 'No especificada'}`, '',
        'PAQUETE', labels[data.plan] || data.plan, '',
        'DISEÑO', labels[data.template] || data.template, '',
        'NECESITA', ...data.needs.map((need) => `- ${need}`), '',
        'COMENTARIOS', data.notes || 'Sin comentario adicional.'
    ].join('\n');
}

function buildHtmlEmail(data) {
    const rows = [
        ['Nombre', data.contactName], ['WhatsApp', data.whatsapp], ['Correo', data.email || 'No proporcionado'],
        ['Nombre del negocio', data.businessName], ['Giro', data.businessType], ['Ciudad/Zona', data.city || 'No especificada'],
        ['Paquete', labels[data.plan] || data.plan], ['Diseño', labels[data.template] || data.template],
        ['Necesita', data.needs.join(', ')], ['Comentarios', data.notes || 'Sin comentario adicional.']
    ].map(([label, value]) => `<tr><th align="left" valign="top" style="padding:8px 12px 8px 0;color:#666;font-weight:600;">${escapeHtml(label)}</th><td style="padding:8px 0;">${escapeHtml(value).replace(/\n/g, '<br>')}</td></tr>`).join('');
    return `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#171717;max-width:640px"><h2>Nueva solicitud — Eventora Studio</h2><table style="border-collapse:collapse;width:100%">${rows}</table></div>`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function safeMailErrorCode(error) {
    const code = String(error?.code || 'unknown').toUpperCase();
    return /^[A-Z0-9_-]+$/.test(code) ? code : 'UNKNOWN';
}
