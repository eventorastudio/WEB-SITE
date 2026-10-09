import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import { applyProjectCors, requireProjectAdmin } from './project-auth.js';

const region = 'us-central1';
const projectsCollection = 'projects';
const eventsCollection = 'calendarEvents';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const projectIdPattern = /^[A-Za-z0-9_-]{1,80}$/;
const manualTypes = new Set(['maintenance', 'review', 'renewal', 'reminder', 'client', 'other']);

export const getCalendarEvents = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    const range = normalizeRange(req.query?.start, req.query?.end);
    if (!range) { res.status(400).json({ ok: false, message: 'Rango de calendario inválido.' }); return; }
    try {
        const db = getFirestore();
        const [projectsSnapshot, manualSnapshot] = await Promise.all([
            db.collection(projectsCollection).orderBy('updatedAt', 'desc').limit(200).get(),
            db.collection(eventsCollection).where('date', '>=', range.start).where('date', '<=', range.end).orderBy('date').limit(500).get()
        ]);
        const projects = projectsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
        const events = [
            ...projects.flatMap((project) => deriveProjectEvents(project, range)),
            ...manualSnapshot.docs.map((document) => serializeManualEvent(document))
        ].sort(compareEvents);
        res.json({ ok: true, events });
    } catch (error) {
        logger.error('Calendar events load failed.', { message: String(error?.message || '') });
        res.status(500).json({ ok: false, message: 'No pudimos cargar el calendario.' });
    }
});

export const createCalendarEvent = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    const admin = await requireProjectAdmin(req, res); if (!admin) return;
    try {
        const data = await normalizeManualEvent(req.body);
        const reference = await getFirestore().collection(eventsCollection).add({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: admin.uid });
        res.status(201).json({ ok: true, id: reference.id });
    } catch (error) {
        respondCalendarValidation(res, error, 'No pudimos crear el evento.');
    }
});

export const updateCalendarEvent = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    const id = readEventId(req.body?.id);
    if (!id) { res.status(400).json({ ok: false, message: 'Evento inválido.' }); return; }
    try {
        const data = await normalizeManualEvent(req.body);
        await getFirestore().collection(eventsCollection).doc(id).update({ ...data, updatedAt: FieldValue.serverTimestamp() });
        res.json({ ok: true });
    } catch (error) {
        respondCalendarValidation(res, error, 'No pudimos actualizar el evento.');
    }
});

export const deleteCalendarEvent = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, message: 'Método no permitido.' }); return; }
    if (!await requireProjectAdmin(req, res)) return;
    const id = readEventId(req.body?.id);
    if (!id) { res.status(400).json({ ok: false, message: 'Evento inválido.' }); return; }
    try {
        await getFirestore().collection(eventsCollection).doc(id).delete();
        res.json({ ok: true });
    } catch (error) {
        logger.error('Calendar event delete failed.', { message: String(error?.message || '') });
        res.status(500).json({ ok: false, message: 'No pudimos eliminar el evento.' });
    }
});

function deriveProjectEvents(project, range) {
    const events = [];
    const add = (date, type, title, label) => {
        if (!datePattern.test(String(date || '')) || date < range.start || date > range.end) return;
        events.push({ id: `project-${project.id}-${type}`, source: 'project', projectId: project.id, projectName: project.businessName || 'Proyecto sin nombre', title, type, typeLabel: label, date, time: '', status: eventStatus(date), notes: 'Fecha derivada automáticamente del proyecto.', canEdit: false });
    };
    if (project.maintenanceEnabled === true) {
        add(project.nextMaintenanceReviewAt, 'maintenance', 'Mantenimiento preventivo', 'Mantenimiento');
        add(project.nextQuarterlyReviewAt, 'quarterly', 'Revisión trimestral', 'Trimestral');
        add(project.maintenanceRenewalDate, 'maintenance-renewal', 'Renovación de mantenimiento', 'Renovación · Mantenimiento');
    }
    if (project.hostingEnabled === true) add(project.hostingRenewalDate, 'hosting-renewal', 'Renovación de hosting', 'Renovación · Hosting');
    return events;
}

async function normalizeManualEvent(payload) {
    const title = text(payload?.title, 160); const date = text(payload?.date, 10); const time = text(payload?.time, 5); const type = text(payload?.type, 20); const notes = text(payload?.notes, 2000); const projectId = text(payload?.projectId, 80);
    if (!title || !datePattern.test(date) || !manualTypes.has(type) || (time && !timePattern.test(time))) throw new Error('EVENT_INVALID');
    let projectName = '';
    if (projectId) {
        if (!projectIdPattern.test(projectId)) throw new Error('PROJECT_INVALID');
        const project = await getFirestore().collection(projectsCollection).doc(projectId).get();
        if (!project.exists) throw new Error('PROJECT_NOT_FOUND');
        projectName = String(project.data()?.businessName || 'Proyecto sin nombre').slice(0, 160);
    }
    return { title, date, time, type, projectId: projectId || null, projectName: projectName || null, notes: notes || null, source: 'manual' };
}

function normalizeRange(start, end) { return datePattern.test(String(start || '')) && datePattern.test(String(end || '')) && start <= end ? { start, end } : null; }
function serializeManualEvent(document) { const data = document.data(); return { id: document.id, source: 'manual', canEdit: true, ...data, status: eventStatus(data.date), createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt), typeLabel: manualTypeLabel(data.type) }; }
function compareEvents(a, b) { return `${a.date}T${a.time || '00:00'}${a.title}`.localeCompare(`${b.date}T${b.time || '00:00'}${b.title}`); }
function eventStatus(date) { const today = localDate(); return date === today ? 'today' : date < today ? 'overdue' : 'upcoming'; }
function localDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function manualTypeLabel(type) { return ({ maintenance: 'Mantenimiento', review: 'Revisión', renewal: 'Renovación', reminder: 'Recordatorio', client: 'Cliente', other: 'Otro' })[type] || 'Manual'; }
function text(value, limit) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
function readEventId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value.trim()) ? value.trim() : ''; }
function toIso(value) { return value?.toDate instanceof Function ? value.toDate().toISOString() : null; }
function respondCalendarValidation(res, error, fallback) { const code = String(error?.message || ''); const messages = { EVENT_INVALID: 'Título, fecha o tipo inválidos.', PROJECT_INVALID: 'Proyecto relacionado inválido.', PROJECT_NOT_FOUND: 'Proyecto relacionado no encontrado.' }; if (messages[code]) { res.status(400).json({ ok: false, message: messages[code] }); return; } logger.error('Calendar event operation failed.', { message: code }); res.status(500).json({ ok: false, message: fallback }); }
