import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js';
import { auth, appCheck } from './firebase.js';
import { apiFetch, isTimeoutError } from '../../shared/api.js';

const functionsBaseUrl = 'https://us-central1-eventorastudio-d6d95.cloudfunctions.net';
const labels = { healthy: 'En línea', degraded: 'Lento', down: 'Caído', unknown: 'Sin datos', paused: 'Pausado' };
const appView = document.querySelector('#app-view');
const status = document.querySelector('#app-status');
const list = document.querySelector('#monitor-list');
const summary = document.querySelector('#summary');
const alert = document.querySelector('#alert');
const dialog = document.querySelector('#detail-dialog');
let user = null;
let monitors = [];

document.querySelector('#refresh-button').addEventListener('click', load);
document.querySelector('#search').addEventListener('input', render);
document.querySelector('#status-filter').addEventListener('change', render);
document.querySelector('#close-detail').addEventListener('click', () => dialog.close());
onAuthStateChanged(auth, async (next) => { user = next; if (!user) { document.querySelector('#login-message').hidden = false; return; } appView.hidden = false; await load(); setInterval(load, 60_000); });

async function load() {
    setStatus('Cargando estado de hosting...');
    try { const result = await authorizedFetch('/getHostingMonitors'); monitors = Array.isArray(result.monitors) ? result.monitors : []; render(); setStatus(''); }
    catch (error) { setStatus(isTimeoutError(error) ? 'La consulta está tardando demasiado.' : 'No pudimos cargar el estado de hosting. Intenta nuevamente.'); }
}
function render() {
    const counts = { healthy: 0, degraded: 0, down: 0, unknown: 0, paused: 0 }; monitors.forEach((item) => { counts[item.enabled === false ? 'paused' : item.currentStatus] = (counts[item.enabled === false ? 'paused' : item.currentStatus] || 0) + 1; });
    summary.replaceChildren(...[['Sitios monitorizados', monitors.length, ''], ['En línea', counts.healthy || 0, 'healthy'], ['Con problemas', counts.degraded || 0, 'degraded'], ['Caídos', counts.down || 0, 'down']].map(([label, value, tone]) => { const card = document.createElement('article'); card.className = tone; const strong = document.createElement('strong'); strong.textContent = value; const span = document.createElement('span'); span.textContent = label; card.append(strong, span); return card; }));
    const problems = (counts.down || 0) + (counts.degraded || 0); alert.hidden = !problems; alert.textContent = problems ? `${problems} sitio${problems === 1 ? '' : 's'} con problemas. Revisa los detalles para confirmar la causa observada.` : '';
    const query = normalize(document.querySelector('#search').value); const filter = document.querySelector('#status-filter').value;
    const visible = monitors.filter((item) => { const current = item.enabled === false ? 'paused' : item.currentStatus; return (filter === 'all' || current === filter) && (!query || normalize(`${item.businessName} ${item.url}`).includes(query)); }).sort((a, b) => priority(a) - priority(b));
    list.replaceChildren(...(visible.length ? visible.map(createCard) : [message('No hay sitios que coincidan con los filtros.', 'empty-state')]));
}
function createCard(item) {
    const card = document.createElement('article'); card.className = 'monitor-card'; const current = item.enabled === false ? 'paused' : item.currentStatus; const statusPill = document.createElement('span'); statusPill.className = `status-pill ${current}`; statusPill.textContent = labels[current] || labels.unknown;
    const heading = document.createElement('div'); heading.className = 'card-heading'; const title = document.createElement('div'); const h2 = document.createElement('h2'); h2.textContent = item.businessName; const url = document.createElement('a'); url.href = item.url; url.target = '_blank'; url.rel = 'noopener'; url.textContent = item.url; title.append(h2, url); heading.append(title, statusPill);
    const metrics = document.createElement('div'); metrics.className = 'metrics'; metrics.append(metric('HTTP', item.lastHttpStatus || '—'), metric('Latencia', item.lastResponseTimeMs ? `${item.lastResponseTimeMs} ms` : '—'), metric('Uptime 7d', formatUptime(item.uptime?.['168h'], item.uptimeCheckCount)), metric('Último check', item.lastCheckedAt ? relative(item.lastCheckedAt) : 'Sin datos'));
    const meta = document.createElement('p'); meta.className = 'card-meta'; meta.textContent = `${item.maintenanceEnabled ? 'Hosting + mantenimiento' : 'Hosting'}${item.hostingRenewalDate ? ` · Renovación ${formatDate(item.hostingRenewalDate)}` : ''}${item.statusStale ? ' · Datos desactualizados' : ''}`;
    const actions = document.createElement('div'); actions.className = 'card-actions'; const detail = action('Ver detalles', () => openDetail(item)); const check = action('Revisar ahora', async () => { check.disabled = true; check.textContent = 'Revisando...'; try { await authorizedFetch('/runHostingCheck', { method: 'POST', body: JSON.stringify({ id: item.id }) }); await load(); openDetail(monitors.find((entry) => entry.id === item.id) || item); } catch (error) { setStatus(error.message || 'No pudimos revisar el sitio.'); } finally { check.disabled = false; check.textContent = 'Revisar ahora'; } }); const open = action('Abrir ↗', () => window.open(item.url, '_blank', 'noopener')); actions.append(detail, check, open); card.append(heading, metrics, meta, actions); return card;
}
async function openDetail(item) { document.querySelector('#detail-title').textContent = item.businessName; const content = document.querySelector('#detail-content'); content.replaceChildren(message('Cargando historial...', 'status')); dialog.showModal(); try { const result = await authorizedFetch(`/getHostingHistory?id=${encodeURIComponent(item.id)}`); const checks = result.checks || []; const incidents = result.incidents || []; const blocks = [detailGrid([['URL', item.url], ['Proyecto', item.projectId], ['Estado', labels[item.currentStatus] || labels.unknown], ['HTTP', item.lastHttpStatus || '—'], ['Latencia actual', item.lastResponseTimeMs ? `${item.lastResponseTimeMs} ms` : '—'], ['Promedio 24 h', item.latencyAverageMs ? `${item.latencyAverageMs} ms` : '—'], ['Uptime 24 h', formatUptime(item.uptime?.['24h'], item.uptimeCheckCount)], ['Uptime 30 d', formatUptime(item.uptime?.['720h'], item.uptimeCheckCount)]]), section('Historial reciente', checks.length ? checks.slice(0, 30).map((check) => `${formatDateTime(check.checkedAt)} · ${labels[check.status] || check.status} · ${check.responseTimeMs || '—'} ms · ${check.httpStatus || check.errorType || '—'}`) : ['Sin checks registrados.']), section('Incidentes recientes', incidents.length ? incidents.slice(0, 10).map((incident) => `${formatDateTime(incident.startedAt)} · ${incident.resolved ? 'Resuelto' : 'Activo'} · ${incident.causeCategory || 'UNKNOWN'}${incident.durationMs ? ` · ${Math.round(incident.durationMs / 60000)} min` : ''}`) : ['Sin incidentes registrados.'])]; content.replaceChildren(...blocks); } catch { content.replaceChildren(message('No pudimos cargar el historial.', 'status')); } }
function detailGrid(items) { const grid = document.createElement('dl'); grid.className = 'detail-grid'; items.forEach(([label, value]) => { const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = value; grid.append(dt, dd); }); return grid; }
function section(title, lines) { const wrapper = document.createElement('section'); wrapper.className = 'detail-section'; const h3 = document.createElement('h3'); h3.textContent = title; const list = document.createElement('ul'); lines.forEach((line) => { const li = document.createElement('li'); li.textContent = line; list.append(li); }); wrapper.append(h3, list); return wrapper; }
function metric(label, value) { const wrapper = document.createElement('div'); const small = document.createElement('small'); small.textContent = label; const strong = document.createElement('strong'); strong.textContent = value; wrapper.append(small, strong); return wrapper; }
function action(label, handler) { const button = document.createElement('button'); button.className = 'button button-light'; button.type = 'button'; button.textContent = label; button.addEventListener('click', handler); return button; }
function message(text, className) { const p = document.createElement('p'); p.className = className; p.textContent = text; return p; }
async function authorizedFetch(path, options = {}) { return apiFetch(`${functionsBaseUrl}${path}`, { user, appCheck, getAppCheckToken: getToken, options }); }
function priority(item) { const value = item.enabled === false ? 'paused' : item.currentStatus; return ({ down: 0, degraded: 1, unknown: 2, healthy: 3, paused: 4 })[value] ?? 5; }
function setStatus(value) { status.textContent = value; }
function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function formatUptime(value, count = 0) { return value == null ? '—' : `${value.toFixed(2)}% · ${count} check${count === 1 ? '' : 's'}`; }
function formatDate(value) { return value ? new Intl.DateTimeFormat('es-MX').format(new Date(`${value}T12:00:00`)) : 'pendiente'; }
function formatDateTime(value) { return value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'; }
function relative(value) { const minutes = Math.max(0, Math.round((Date.now() - new Date(value).valueOf()) / 60000)); return minutes < 1 ? 'ahora' : `${minutes} min`; }
