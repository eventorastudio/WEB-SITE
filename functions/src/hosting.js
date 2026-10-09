import dns from 'node:dns/promises';
import net from 'node:net';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { applyProjectCors, requireProjectAdmin } from './project-auth.js';

const region = 'us-central1';
const db = () => getFirestore();
const monitorCollection = 'websiteMonitors';
const checksSubcollection = 'checks';
const incidentsSubcollection = 'incidents';
const CHECK_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const DEGRADED_THRESHOLD_MS = 1_000;
const STALE_AFTER_MS = 15 * 60 * 1000;
const CHECK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const getHostingMonitors = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'Método no permitido.' });
    if (!await requireProjectAdmin(req, res)) return;
    try {
        const monitors = await syncHostingMonitors();
        const result = await Promise.all(monitors.map((monitor) => serializeMonitor(monitor)));
        res.json({ ok: true, monitors: result });
    } catch (error) {
        logger.error('Hosting monitor list failed.', { message: String(error?.message || '') });
        res.status(500).json({ ok: false, message: 'No pudimos cargar el estado de hosting.' });
    }
});

export const getHostingMonitor = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'Método no permitido.' });
    if (!await requireProjectAdmin(req, res)) return;
    const id = readId(req.query?.id);
    if (!id) return res.status(400).json({ ok: false, message: 'Monitor inválido.' });
    try {
        const monitor = await db().collection(monitorCollection).doc(id).get();
        if (!monitor.exists) return res.status(404).json({ ok: false, message: 'Monitor no encontrado.' });
        res.json({ ok: true, monitor: await serializeMonitor(monitor) });
    } catch (error) {
        logger.error('Hosting monitor detail failed.', { message: String(error?.message || '') });
        res.status(500).json({ ok: false, message: 'No pudimos cargar el detalle del monitor.' });
    }
});

export const getHostingHistory = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'Método no permitido.' });
    if (!await requireProjectAdmin(req, res)) return;
    const id = readId(req.query?.id);
    if (!id) return res.status(400).json({ ok: false, message: 'Monitor inválido.' });
    try {
        const snapshot = await db().collection(monitorCollection).doc(id).collection(checksSubcollection).orderBy('checkedAt', 'desc').limit(50).get();
        const incidents = await db().collection(monitorCollection).doc(id).collection(incidentsSubcollection).orderBy('startedAt', 'desc').limit(20).get();
        res.json({ ok: true, checks: snapshot.docs.map(serializeCheck), incidents: incidents.docs.map(serializeIncident) });
    } catch (error) {
        logger.error('Hosting monitor history failed.', { message: String(error?.message || '') });
        res.status(500).json({ ok: false, message: 'No pudimos cargar el historial.' });
    }
});

export const runHostingCheck = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Método no permitido.' });
    if (!await requireProjectAdmin(req, res)) return;
    const id = readId(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, message: 'Monitor inválido.' });
    try {
        const ref = db().collection(monitorCollection).doc(id);
        const current = await ref.get();
        if (!current.exists) return res.status(404).json({ ok: false, message: 'Monitor no encontrado.' });
        const data = current.data();
        if (data.lastManualCheckAt && Date.now() - toMillis(data.lastManualCheckAt) < 30_000) return res.status(429).json({ ok: false, message: 'Espera unos segundos antes de revisar de nuevo.' });
        await ref.update({ lastManualCheckAt: FieldValue.serverTimestamp() });
        const result = await performCheck(ref, data);
        res.json({ ok: true, result });
    } catch (error) {
        logger.error('Manual hosting check failed.', { message: String(error?.message || '') });
        res.status(500).json({ ok: false, message: 'No pudimos revisar el sitio.' });
    }
});

export const updateHostingMonitor = onRequest({ region, invoker: 'public' }, async (req, res) => {
    if (!applyProjectCors(req, res)) return;
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Método no permitido.' });
    if (!await requireProjectAdmin(req, res)) return;
    const id = readId(req.body?.id);
    if (!id || typeof req.body?.enabled !== 'boolean') return res.status(400).json({ ok: false, message: 'Configuración inválida.' });
    try {
        await db().collection(monitorCollection).doc(id).update({ enabled: req.body.enabled, updatedAt: FieldValue.serverTimestamp() });
        res.json({ ok: true });
    } catch (error) {
        logger.error('Hosting monitor update failed.', { message: String(error?.message || '') });
        res.status(500).json({ ok: false, message: 'No pudimos actualizar el monitor.' });
    }
});

export const scheduledHostingChecks = onSchedule({ region, schedule: 'every 5 minutes', timeZone: 'America/Mexico_City', timeoutSeconds: 540, memory: '256MiB' }, async () => {
    const monitors = await syncHostingMonitors();
    const active = monitors.filter((monitor) => monitor.data().enabled === true);
    for (const monitor of active) {
        try { await performCheck(monitor.ref, monitor.data()); }
        catch (error) { logger.error('Scheduled hosting check failed.', { monitorId: monitor.id, message: String(error?.message || '') }); }
    }
});

async function syncHostingMonitors() {
    const projects = await db().collection('projects').limit(200).get();
    const eligible = projects.docs.filter((doc) => isEligibleProject(doc.data()));
    const existing = await db().collection(monitorCollection).get();
    const byProject = new Map(existing.docs.map((doc) => [doc.data().projectId, doc]));
    const batch = db().batch();
    for (const project of eligible) {
        const data = project.data();
        const current = byProject.get(project.id);
        const ref = current?.ref || db().collection(monitorCollection).doc(`project_${project.id}`);
        batch.set(ref, {
            projectId: project.id, businessName: data.businessName || 'Sitio sin nombre', url: normalizeHttpsUrl(data.productionUrl),
            hostingEnabled: true, hostingStatus: data.hostingStatus || 'active', hostingPlan: data.hostingPlan || '', maintenanceEnabled: data.maintenanceEnabled === true,
            hostingRenewalDate: data.hostingRenewalDate || '', enabled: current?.data().enabled !== false, currentStatus: current?.data().currentStatus || 'unknown',
            createdAt: current?.data().createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    }
    if (eligible.length) await batch.commit();
    return (await db().collection(monitorCollection).get()).docs.filter((doc) => eligible.some((project) => project.id === doc.data().projectId));
}

function isEligibleProject(data) {
    return data?.hostingEnabled === true && data?.hostingStatus === 'active' && data?.projectStatus === 'published' && /^https:\/\//i.test(String(data.productionUrl || '')) && isSafeUrl(data.productionUrl);
}

async function performCheck(ref, monitor) {
    const started = Date.now();
    let result;
    try { result = await requestSite(monitor.url); }
    catch (error) { result = { ok: false, responseTimeMs: Date.now() - started, errorType: error.code || classifyError(error), errorMessage: humanError(error), httpStatus: null }; }
    const checkedAt = Timestamp.now();
    const previous = monitor.currentStatus || 'unknown';
    const failure = !result.ok && !isHttpClientError(result.httpStatus);
    const consecutiveFailures = failure ? Number(monitor.consecutiveFailures || 0) + 1 : 0;
    const confirmedDown = failure && consecutiveFailures >= 2;
    const currentStatus = confirmedDown ? 'down' : result.ok ? (result.responseTimeMs >= DEGRADED_THRESHOLD_MS ? 'degraded' : 'healthy') : 'unknown';
    const check = { monitorId: ref.id, projectId: monitor.projectId, checkedAt, status: currentStatus, httpStatus: result.httpStatus, responseTimeMs: result.responseTimeMs, errorType: result.errorType || null, errorMessageSanitized: result.errorMessage || null };
    await ref.collection(checksSubcollection).add(check);
    await updateIncident(ref, monitor, { ...result, status: currentStatus, checkedAt }, previous, confirmedDown);
    await ref.update({ currentStatus, lastCheckedAt: checkedAt, nextCheckAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), lastHttpStatus: result.httpStatus, lastResponseTimeMs: result.responseTimeMs, consecutiveFailures, lastSuccessAt: result.ok ? checkedAt : monitor.lastSuccessAt || null, lastFailureAt: failure ? checkedAt : monitor.lastFailureAt || null, updatedAt: FieldValue.serverTimestamp() });
    await cleanupChecks(ref);
    return { ...serializePlain(check), sslStatus: 'https' };
}

async function requestSite(inputUrl) {
    let url = normalizeHttpsUrl(inputUrl);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        await assertSafeRemoteUrl(url);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
        const started = Date.now();
        try {
            let response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
            if ([405, 501].includes(response.status)) response = await fetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Range: 'bytes=0-2048' } });
            const responseTimeMs = Date.now() - started;
            if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
                if (redirects === MAX_REDIRECTS) throw Object.assign(new Error('Redirect loop.'), { code: 'REDIRECT_LOOP' });
                url = new URL(response.headers.get('location'), url).toString(); continue;
            }
            if (response.status >= 200 && response.status < 400) return { ok: true, httpStatus: response.status, responseTimeMs };
            return { ok: false, httpStatus: response.status, responseTimeMs, errorType: response.status >= 500 ? 'HTTP_5XX' : 'HTTP_4XX', errorMessage: `El sitio respondió HTTP ${response.status}.` };
        } finally { clearTimeout(timer); }
    }
    throw Object.assign(new Error('Redirect loop.'), { code: 'REDIRECT_LOOP' });
}

async function assertSafeRemoteUrl(value) {
    if (!isSafeUrl(value)) throw Object.assign(new Error('URL no permitida.'), { code: 'INVALID_URL' });
    const host = new URL(value).hostname;
    if (net.isIP(host) && isPrivateIp(host)) throw Object.assign(new Error('IP privada no permitida.'), { code: 'PRIVATE_IP' });
    const addresses = await dns.lookup(host, { all: true });
    if (addresses.some(({ address }) => isPrivateIp(address))) throw Object.assign(new Error('El dominio resuelve a una IP privada.'), { code: 'PRIVATE_IP' });
}

function isSafeUrl(value) { try { const url = new URL(String(value || '')); return url.protocol === 'https:' && !['localhost', 'metadata.google.internal'].includes(url.hostname.toLowerCase()) && !url.username && !url.password; } catch { return false; } }
function isPrivateIp(value) { if (net.isIPv4(value)) { const [a, b] = value.split('.').map(Number); return a === 10 || a === 127 || (a === 169 && b === 254) || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168); } return net.isIPv6(value) && (value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')); }
function classifyError(error) { if (error?.name === 'AbortError') return 'TIMEOUT'; if (/ENOTFOUND|EAI_AGAIN/i.test(error?.code || error?.message)) return 'DNS'; if (/certificate|TLS|SSL/i.test(error?.message)) return 'TLS'; if (/ECONNREFUSED/i.test(error?.code || error?.message)) return 'CONNECTION_REFUSED'; return 'UNKNOWN'; }
function humanError(error) { const type = classifyError(error); return ({ TIMEOUT: 'El sitio no respondió dentro de 10 segundos.', DNS: 'No fue posible resolver el dominio.', TLS: 'La conexión HTTPS no pudo establecerse correctamente.', CONNECTION_REFUSED: 'El servidor rechazó la conexión.', REDIRECT_LOOP: 'La URL entró en un ciclo de redirecciones.', PRIVATE_IP: 'La URL apunta a una red privada y fue bloqueada.', INVALID_URL: 'La URL monitorizada no es válida.' })[error?.code || type] || 'No fue posible completar la revisión.'; }
function isHttpClientError(status) { return Number(status) >= 400 && Number(status) < 500; }

async function updateIncident(ref, monitor, result, previous, confirmedDown) {
    const open = await ref.collection(incidentsSubcollection).where('resolved', '==', false).limit(1).get();
    if (confirmedDown && open.empty) await ref.collection(incidentsSubcollection).add({ startedAt: result.checkedAt, endedAt: null, durationMs: null, causeCategory: result.errorType || 'UNKNOWN', firstError: result.errorMessage || null, lastError: result.errorMessage || null, resolved: false });
    else if (confirmedDown && !open.empty) await open.docs[0].ref.update({ lastError: result.errorMessage || null, causeCategory: result.errorType || 'UNKNOWN' });
    else if (result.status !== 'down' && !open.empty) { const incident = open.docs[0]; const startedAt = incident.data().startedAt; const endedAt = result.checkedAt; await incident.ref.update({ endedAt, durationMs: Math.max(0, toMillis(endedAt) - toMillis(startedAt)), resolved: true, recoveryHttpStatus: result.httpStatus || null, recoveryResponseTimeMs: result.responseTimeMs || null }); }
}

async function serializeMonitor(document) {
    const data = document.data();
    const checks = await document.ref.collection(checksSubcollection).orderBy('checkedAt', 'desc').limit(50).get();
    const checkData = checks.docs.map(serializeCheck);
    return { id: document.id, ...serializePlain(data), projectStatus: data.hostingStatus || 'active', statusStale: !data.lastCheckedAt || Date.now() - toMillis(data.lastCheckedAt) > STALE_AFTER_MS, uptime: calculateUptime(checkData), latencyAverageMs: average(checkData.filter((item) => Number.isFinite(item.responseTimeMs)).map((item) => item.responseTimeMs)), recentChecks: checkData.slice(0, 24) };
}
function calculateUptime(checks) { const now = Date.now(); return [24, 168, 720].reduce((all, hours) => { const selected = checks.filter((item) => now - toMillis(item.checkedAt) <= hours * 60 * 60 * 1000); all[`${hours}h`] = selected.length ? Number((selected.filter((item) => ['healthy', 'degraded'].includes(item.status)).length / selected.length * 100).toFixed(2)) : null; return all; }, {}); }
function average(values) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null; }
function serializeCheck(document) { return { id: document.id, ...serializePlain(document.data()) }; }
function serializeIncident(document) { return { id: document.id, ...serializePlain(document.data()) }; }
function serializePlain(data) { return Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, value?.toDate instanceof Function ? value.toDate().toISOString() : value])); }
function toMillis(value) { if (!value) return 0; if (value.toMillis instanceof Function) return value.toMillis(); const date = new Date(value); return Number.isNaN(date.valueOf()) ? 0 : date.valueOf(); }
function normalizeHttpsUrl(value) { try { const url = new URL(String(value || '')); return url.toString(); } catch { return ''; } }
function readId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value.trim()) ? value.trim() : ''; }
async function cleanupChecks(ref) { const cutoff = Timestamp.fromMillis(Date.now() - CHECK_RETENTION_MS); const old = await ref.collection(checksSubcollection).where('checkedAt', '<', cutoff).limit(100).get(); if (!old.empty) { const batch = db().batch(); old.docs.forEach((doc) => batch.delete(doc.ref)); await batch.commit(); } }
