import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import { applyAdminCors, requireAuthorizedAdmin } from './admin-auth.js';

const region = 'us-central1';
const allowedStatuses = new Set(['new', 'contacted', 'in_progress', 'completed']);

export const getWebsiteRequests = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyAdminCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireAuthorizedAdmin(req, res)) return;

    try {
        const snapshot = await getFirestore()
            .collection('websiteRequests')
            .orderBy('createdAt', 'desc')
            .limit(200)
            .get();
        res.json({ ok: true, requests: snapshot.docs.map((document) => serializeRequest(document)) });
    } catch (error) {
        logger.error('Website request list failed.', { code: 'website-request/admin-list-failed', message: String(error?.message || '') });
        res.status(500).json({ ok: false, message: 'No pudimos cargar las solicitudes.' });
    }
});

export const updateWebsiteRequestStatus = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyAdminCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireAuthorizedAdmin(req, res)) return;

    const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
    const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
    if (!id || !allowedStatuses.has(status)) {
        res.status(400).json({ ok: false, message: 'Solicitud inválida.' });
        return;
    }

    try {
        await getFirestore().collection('websiteRequests').doc(id).update({
            status,
            updatedAt: FieldValue.serverTimestamp()
        });
        res.json({ ok: true });
    } catch (error) {
        logger.error('Website request status update failed.', { code: 'website-request/admin-status-failed', message: String(error?.message || '') });
        res.status(500).json({ ok: false, message: 'No pudimos actualizar el estado.' });
    }
});

export const deleteWebsiteRequest = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyAdminCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireAuthorizedAdmin(req, res)) return;

    const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
    if (!id) { res.status(400).json({ ok: false, message: 'Solicitud inválida.' }); return; }

    try {
        await getFirestore().collection('websiteRequests').doc(id).delete();
        res.json({ ok: true });
    } catch (error) {
        logger.error('Website request deletion failed.', { code: 'website-request/admin-delete-failed', message: String(error?.message || '') });
        res.status(500).json({ ok: false, message: 'No pudimos eliminar la solicitud.' });
    }
});

export function serializeRequest(document) {
    const data = document.data();
    return {
        id: document.id,
        contactName: data.contactName || '',
        whatsapp: data.whatsapp || '',
        email: data.email || '',
        businessName: data.businessName || '',
        businessType: data.businessType || '',
        city: data.city || '',
        plan: data.plan || '',
        template: data.template || '',
        hostingPreference: data.hostingPreference || '',
        needs: Array.isArray(data.needs) ? data.needs : [],
        notes: data.notes || '',
        status: allowedStatuses.has(data.status) ? data.status : 'new',
        createdAt: toIsoString(data.createdAt),
        updatedAt: toIsoString(data.updatedAt)
    };
}

function toIsoString(value) {
    return value?.toDate instanceof Function ? value.toDate().toISOString() : null;
}
