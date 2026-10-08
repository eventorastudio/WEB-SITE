import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import { applyProjectCors, requireProjectAdmin } from './project-auth.js';

const region = 'us-central1';
const collectionName = 'projects';
const maxProjects = 200;
const projectIdPattern = /^[A-Za-z0-9_-]{1,80}$/;
const statuses = new Set(['lead', 'awaiting-deposit', 'active', 'client-review', 'awaiting-final-payment', 'ready-to-publish', 'published', 'paused', 'cancelled', 'completed']);
const stages = new Set(['not-started', 'setup', 'skeleton', 'visual-design', 'content', 'functionality', 'responsive', 'qa', 'client-review', 'revisions', 'final-review', 'ready-to-publish', 'published']);
const paymentStatuses = new Set(['pending', 'deposit-paid', 'paid']);
const hostingStatuses = new Set(['not-applicable', 'pending', 'active', 'expiring', 'expired', 'cancelled']);
const maintenanceFrequencies = new Set(['monthly']);
const maintenanceActivityTypes = new Set(['preventive', 'quarterly', 'request']);
const maintenanceRequestTypes = new Set(['included', 'extra']);
const updateSources = new Set(['codex', 'manual']);
const fieldLimits = {
    businessName: 160, clientName: 160, businessType: 120, city: 120, whatsapp: 40, email: 254,
    package: 80, template: 80, hostingPlan: 80, maintenancePlan: 80, previewUrl: 500,
    productionUrl: 500, repositoryUrl: 500, localProjectName: 120, scope: 2000, notes: 4000, maintenanceNotes: 2000,
    hostingStartDate: 10, hostingRenewalDate: 10, maintenanceFrequency: 20, maintenancePeriodStart: 10, maintenancePeriodEnd: 10,
    lastMaintenanceReviewAt: 10, nextMaintenanceReviewAt: 10, lastQuarterlyReviewAt: 10, nextQuarterlyReviewAt: 10, maintenanceRenewalDate: 10
};

export const getProjects = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    try {
        const snapshot = await getFirestore().collection(collectionName).orderBy('updatedAt', 'desc').limit(maxProjects).get();
        res.json({ ok: true, projects: snapshot.docs.map(serializeProject) });
    } catch (error) {
        logFailure('project/list-failed', error);
        res.status(500).json({ ok: false, message: 'No pudimos cargar los proyectos.' });
    }
});

export const getProject = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    const id = readId(req.query?.id);
    if (!id) { res.status(400).json({ ok: false, message: 'Proyecto inválido.' }); return; }
    try {
        const document = await getFirestore().collection(collectionName).doc(id).get();
        if (!document.exists) { res.status(404).json({ ok: false, message: 'Proyecto no encontrado.' }); return; }
        res.json({ ok: true, project: serializeProject(document) });
    } catch (error) {
        logFailure('project/get-failed', error);
        res.status(500).json({ ok: false, message: 'No pudimos cargar el proyecto.' });
    }
});

export const createProject = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    const data = normalizeProject(req.body);
    const validationError = validateProject(data, true);
    if (validationError) { res.status(400).json({ ok: false, message: validationError }); return; }
    try {
        const reference = await getFirestore().collection(collectionName).add({
            ...data,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            lastUpdateAt: null,
            lastUpdateSummary: ''
        });
        res.status(201).json({ ok: true, id: reference.id });
    } catch (error) {
        logFailure('project/create-failed', error);
        res.status(500).json({ ok: false, message: 'No pudimos crear el proyecto.' });
    }
});

export const updateProject = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    const id = readId(req.body?.id);
    const data = normalizeProject(req.body);
    const validationError = validateProject(data, true);
    if (!id || validationError) { res.status(400).json({ ok: false, message: validationError || 'Proyecto inválido.' }); return; }
    try {
        await getFirestore().collection(collectionName).doc(id).update({ ...data, updatedAt: FieldValue.serverTimestamp() });
        res.json({ ok: true });
    } catch (error) {
        logFailure('project/update-failed', error);
        res.status(500).json({ ok: false, message: 'No pudimos actualizar el proyecto.' });
    }
});

export const deleteProject = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    const id = readId(req.body?.id);
    if (!id || req.body?.confirmation !== id) { res.status(400).json({ ok: false, message: 'Escribe el identificador del proyecto para confirmar.' }); return; }
    try {
        const updates = await getFirestore().collection(collectionName).doc(id).collection('updates').get();
        const batch = getFirestore().batch();
        updates.docs.forEach((document) => batch.delete(document.ref));
        batch.delete(getFirestore().collection(collectionName).doc(id));
        await batch.commit();
        res.json({ ok: true });
    } catch (error) {
        logFailure('project/delete-failed', error);
        res.status(500).json({ ok: false, message: 'No pudimos eliminar el proyecto.' });
    }
});

export const getProjectUpdates = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    const id = readId(req.query?.id);
    if (!id) { res.status(400).json({ ok: false, message: 'Proyecto inválido.' }); return; }
    try {
        const snapshot = await getFirestore().collection(collectionName).doc(id).collection('updates').orderBy('createdAt', 'desc').limit(200).get();
        res.json({ ok: true, updates: snapshot.docs.map((document) => serializeUpdate(document)) });
    } catch (error) {
        logFailure('project/updates-failed', error);
        res.status(500).json({ ok: false, message: 'No pudimos cargar el historial.' });
    }
});

export const addProjectUpdate = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    const id = readId(req.body?.id);
    const update = normalizeUpdate(req.body);
    if (!id || !update.stage || !stages.has(update.stage) || !update.title || !update.description) { res.status(400).json({ ok: false, message: 'Actualización inválida.' }); return; }
    try {
        const db = getFirestore();
        const projectRef = db.collection(collectionName).doc(id);
        const updateRef = projectRef.collection('updates').doc();
        const batch = db.batch();
        batch.set(updateRef, { ...update, createdAt: FieldValue.serverTimestamp() });
        batch.update(projectRef, { developmentStage: update.stage, lastUpdateAt: FieldValue.serverTimestamp(), lastUpdateSummary: update.description, updatedAt: FieldValue.serverTimestamp() });
        await batch.commit();
        res.status(201).json({ ok: true, id: updateRef.id });
    } catch (error) {
        logFailure('project/update-create-failed', error);
        res.status(500).json({ ok: false, message: 'No pudimos registrar el avance.' });
    }
});

export const registerMaintenanceActivity = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    const id = readId(req.body?.id);
    const activity = normalizeMaintenanceActivity(req.body);
    if (!id || !maintenanceActivityTypes.has(activity.type) || !activity.description) { res.status(400).json({ ok: false, message: 'Actividad de mantenimiento inválida.' }); return; }
    if (activity.type === 'request' && !maintenanceRequestTypes.has(activity.requestType)) { res.status(400).json({ ok: false, message: 'Tipo de solicitud inválido.' }); return; }
    try {
        const db = getFirestore();
        const projectRef = db.collection(collectionName).doc(id);
        let result;
        await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(projectRef);
            if (!snapshot.exists) throw new Error('PROJECT_NOT_FOUND');
            const project = normalizeStoredProject(snapshot.data());
            if (!project.maintenanceEnabled) throw new Error('MAINTENANCE_DISABLED');
            const today = localDate();
            const period = ensureMaintenancePeriod(project, today);
            const patch = { maintenancePeriodStart: period.start, maintenancePeriodEnd: period.end, updatedAt: FieldValue.serverTimestamp() };
            let title = 'Actividad de mantenimiento registrada';
            let description = activity.description;
            if (activity.type === 'preventive') {
                patch.lastMaintenanceReviewAt = today;
                patch.nextMaintenanceReviewAt = addMonths(today, 1);
                title = 'Revisión preventiva realizada';
            } else if (activity.type === 'quarterly') {
                patch.lastQuarterlyReviewAt = today;
                patch.nextQuarterlyReviewAt = addMonths(today, 3);
                title = 'Revisión trimestral realizada';
            } else if (activity.requestType === 'included') {
                if (period.used >= project.maintenanceRequestsLimit) throw new Error('MAINTENANCE_LIMIT_REACHED');
                patch.maintenanceRequestsUsed = period.used + 1;
                title = 'Solicitud de mantenimiento incluida';
                description = `${activity.description} (${patch.maintenanceRequestsUsed}/${project.maintenanceRequestsLimit} utilizadas en el periodo)`;
            } else {
                title = 'Solicitud de mantenimiento fuera de plan';
            }
            const updateRef = projectRef.collection('updates').doc();
            transaction.set(updateRef, { stage: project.developmentStage || 'published', title, description, source: 'admin', commit: null, activityType: activity.type, requestType: activity.requestType || null, createdAt: FieldValue.serverTimestamp() });
            transaction.update(projectRef, { ...patch, lastUpdateAt: FieldValue.serverTimestamp(), lastUpdateSummary: description });
            result = { updateId: updateRef.id, title, periodStart: period.start, periodEnd: period.end, requestsUsed: patch.maintenanceRequestsUsed ?? period.used };
        });
        res.status(201).json({ ok: true, ...result });
    } catch (error) {
        const code = String(error?.message || '');
        if (code === 'PROJECT_NOT_FOUND') { res.status(404).json({ ok: false, message: 'Proyecto no encontrado.' }); return; }
        if (code === 'MAINTENANCE_DISABLED') { res.status(400).json({ ok: false, message: 'El mantenimiento no está activo para este proyecto.' }); return; }
        if (code === 'MAINTENANCE_LIMIT_REACHED') { res.status(409).json({ ok: false, message: 'Límite mensual incluido alcanzado.' }); return; }
        logFailure('project/maintenance-activity-failed', error);
        res.status(500).json({ ok: false, message: 'No pudimos registrar la actividad de mantenimiento.' });
    }
});

function normalizeProject(payload) {
    const text = (key) => typeof payload?.[key] === 'string' ? payload[key].trim() : '';
    const amount = (key) => Number.isFinite(Number(payload?.[key])) ? Math.max(0, Number(payload[key])) : 0;
    const hostingEnabled = payload?.hostingEnabled === true;
    const maintenanceEnabled = payload?.maintenanceEnabled === true;
    const maintenanceRequestsLimit = integer('maintenanceRequestsLimit') || (maintenanceEnabled ? 2 : 0);
    return {
        businessName: text('businessName'), clientName: text('clientName'), businessType: text('businessType'), city: text('city'),
        whatsapp: text('whatsapp'), email: text('email').toLowerCase(), package: text('package'), template: text('template'),
        projectStatus: text('projectStatus'), developmentStage: text('developmentStage'), totalPrice: amount('totalPrice'),
        depositAmount: amount('depositAmount'), remainingAmount: amount('remainingAmount'), paymentStatus: text('paymentStatus'),
        hostingEnabled, hostingPlan: text('hostingPlan'), hostingStatus: hostingEnabled ? (text('hostingStatus') || 'pending') : 'not-applicable',
        hostingStartDate: text('hostingStartDate'), hostingRenewalDate: text('hostingRenewalDate'), maintenanceEnabled, maintenancePlan: text('maintenancePlan'),
        maintenanceStatus: maintenanceEnabled ? (text('maintenanceStatus') || 'pending') : 'not-applicable', maintenanceFrequency: maintenanceEnabled ? (text('maintenanceFrequency') || 'monthly') : '',
        maintenanceRequestsLimit, maintenanceRequestsUsed: integer('maintenanceRequestsUsed'), maintenancePeriodStart: text('maintenancePeriodStart'), maintenancePeriodEnd: text('maintenancePeriodEnd'),
        lastMaintenanceReviewAt: text('lastMaintenanceReviewAt'), nextMaintenanceReviewAt: text('nextMaintenanceReviewAt'), lastQuarterlyReviewAt: text('lastQuarterlyReviewAt'), nextQuarterlyReviewAt: text('nextQuarterlyReviewAt'), maintenanceRenewalDate: text('maintenanceRenewalDate'), maintenanceNotes: text('maintenanceNotes'),
        previewUrl: text('previewUrl'), productionUrl: text('productionUrl'), repositoryUrl: text('repositoryUrl'), localProjectName: text('localProjectName'),
        scope: text('scope'), notes: text('notes')
    };
    function integer(key) { return Number.isInteger(Number(payload?.[key])) ? Number(payload[key]) : 0; }
}

function validateProject(data, required) {
    for (const [key, limit] of Object.entries(fieldLimits)) if (data[key].length > limit) return 'Uno o más campos exceden el tamaño permitido.';
    if (required && (!data.businessName || !data.clientName || !data.package || !statuses.has(data.projectStatus) || !stages.has(data.developmentStage))) return 'Faltan datos obligatorios del proyecto.';
    if (data.projectStatus && !statuses.has(data.projectStatus)) return 'Estado de proyecto inválido.';
    if (data.developmentStage && !stages.has(data.developmentStage)) return 'Fase de desarrollo inválida.';
    if (data.paymentStatus && !paymentStatuses.has(data.paymentStatus)) return 'Estado de pago inválido.';
    if (!hostingStatuses.has(data.hostingStatus) || !hostingStatuses.has(data.maintenanceStatus)) return 'Estado de servicio inválido.';
    if (data.maintenanceEnabled && !maintenanceFrequencies.has(data.maintenanceFrequency)) return 'Frecuencia de mantenimiento inválida.';
    if (data.maintenanceRequestsLimit < 0 || data.maintenanceRequestsLimit > 100 || data.maintenanceRequestsUsed < 0 || data.maintenanceRequestsUsed > data.maintenanceRequestsLimit) return 'Límite o uso de solicitudes inválido.';
    for (const key of ['hostingStartDate', 'hostingRenewalDate', 'maintenanceRenewalDate', 'maintenancePeriodStart', 'maintenancePeriodEnd', 'lastMaintenanceReviewAt', 'nextMaintenanceReviewAt', 'lastQuarterlyReviewAt', 'nextQuarterlyReviewAt']) if (data[key] && !isDateString(data[key])) return 'Una fecha de mantenimiento no es válida.';
    if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) return 'El correo no es válido.';
    for (const key of ['previewUrl', 'productionUrl', 'repositoryUrl']) if (data[key] && !/^https?:\/\//i.test(data[key])) return 'Las URLs deben comenzar con http o https.';
    return '';
}

function normalizeUpdate(payload) {
    const text = (key, limit) => typeof payload?.[key] === 'string' ? payload[key].trim().slice(0, limit) : '';
    return { stage: text('stage', 40), title: text('title', 180), description: text('description', 1000), source: updateSources.has(payload?.source) ? payload.source : 'manual', commit: text('commit', 80) || null };
}
function normalizeMaintenanceActivity(payload) {
    const text = (key, limit) => typeof payload?.[key] === 'string' ? payload[key].trim().slice(0, limit) : '';
    return { type: text('type', 20), requestType: text('requestType', 20), description: text('description', 1000) };
}
function normalizeStoredProject(data) {
    return { ...data, maintenanceEnabled: data.maintenanceEnabled === true, maintenanceFrequency: data.maintenanceFrequency || 'monthly', maintenanceRequestsLimit: Number.isInteger(data.maintenanceRequestsLimit) && data.maintenanceRequestsLimit >= 0 ? data.maintenanceRequestsLimit : 2, maintenanceRequestsUsed: Number.isInteger(data.maintenanceRequestsUsed) && data.maintenanceRequestsUsed >= 0 ? data.maintenanceRequestsUsed : 0 };
}
function ensureMaintenancePeriod(project, today) {
    const valid = project.maintenancePeriodStart && project.maintenancePeriodEnd && today >= project.maintenancePeriodStart && today <= project.maintenancePeriodEnd;
    if (valid) return { start: project.maintenancePeriodStart, end: project.maintenancePeriodEnd, used: project.maintenanceRequestsUsed };
    return { start: today, end: addDays(addMonths(today, 1), -1), used: 0 };
}
function localDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function addMonths(value, months) { const date = new Date(`${value}T12:00:00-06:00`); date.setMonth(date.getMonth() + months); return date.toISOString().slice(0, 10); }
function addDays(value, days) { const date = new Date(`${value}T12:00:00-06:00`); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function isDateString(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).valueOf()); }
function readId(value) { return typeof value === 'string' && projectIdPattern.test(value.trim()) ? value.trim() : ''; }
function serializeProject(document) { const data = document.data(); return { id: document.id, ...data, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt), lastUpdateAt: toIso(data.lastUpdateAt) }; }
function serializeUpdate(document) { const data = document.data(); return { id: document.id, ...data, createdAt: toIso(data.createdAt) }; }
function toIso(value) { return value?.toDate instanceof Function ? value.toDate().toISOString() : null; }
function logFailure(code, error) { logger.error('Project operation failed.', { code, message: String(error?.message || '') }); }
