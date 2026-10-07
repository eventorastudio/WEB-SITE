import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
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

export const submitWebsiteRequest = onRequest({
    region,
    invoker: 'public',
    cors: false,
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
        const reference = await getFirestore().collection('websiteRequests').add({
            createdAt: FieldValue.serverTimestamp(),
            status: 'new',
            contactName: data.contactName,
            whatsapp: data.whatsapp,
            email: data.email,
            businessName: data.businessName,
            businessType: data.businessType,
            city: data.city,
            plan: data.plan,
            template: data.template,
            needs: data.needs,
            notes: data.notes
        });
        res.status(200).json({ ok: true, id: reference.id });
    } catch {
        res.status(500).json({ ok: false, message: 'No pudimos guardar tu solicitud. Inténtalo nuevamente en unos momentos.' });
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
