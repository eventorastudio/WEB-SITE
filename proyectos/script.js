import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { auth } from './firebase.js';
import { buildMonthGrid, calendarRange, calendarWeekdays, dateKey, eventStatus, filterEvents, monthLabel } from './calendar.js';

const AUTHORIZED_UID = 'aE9nvEOlExYjYxPfAEnoEt3XIdv2';
const AUTHORIZED_EMAIL = 'ev3ntorastudio@gmail.com';
const functionsBaseUrl = 'https://us-central1-eventorastudio-d6d95.cloudfunctions.net';
const maintenanceActivityUrl = '/registerMaintenanceActivity';
const calendarEventsUrl = '/getCalendarEvents';
const calendarEventTypes = { maintenance: 'Mantenimiento', quarterly: 'Trimestral', 'maintenance-renewal': 'Renovación · Mantenimiento', 'hosting-renewal': 'Renovación · Hosting', renewal: 'Renovación', review: 'Revisión', reminder: 'Recordatorio', client: 'Cliente', other: 'Otro' };
const statusLabels = { lead: 'Prospecto', 'awaiting-deposit': 'Esperando anticipo', active: 'Activo', 'client-review': 'Revisión del cliente', 'awaiting-final-payment': 'Esperando pago final', 'ready-to-publish': 'Listo para publicar', published: 'Publicado', paused: 'Pausado', cancelled: 'Cancelado', completed: 'Completado' };
const stageLabels = { 'not-started': 'Sin comenzar', setup: 'Configuración inicial', skeleton: 'Esqueleto / estructura', 'visual-design': 'Diseño visual', content: 'Contenido', functionality: 'Funcionalidades', responsive: 'Responsive', qa: 'QA', 'client-review': 'Revisión del cliente', revisions: 'Cambios', 'final-review': 'Revisión final', 'ready-to-publish': 'Listo para publicar', published: 'Publicado' };
const phaseOrder = ['not-started', 'setup', 'skeleton', 'visual-design', 'content', 'functionality', 'responsive', 'qa', 'client-review', 'revisions', 'final-review', 'ready-to-publish', 'published'];
const stages = Object.keys(stageLabels);
const projectFields = [
    ['businessName', 'Negocio*', 'text'], ['clientName', 'Cliente*', 'text'], ['businessType', 'Giro', 'text'], ['city', 'Ciudad', 'text'], ['whatsapp', 'WhatsApp', 'tel'], ['email', 'Correo', 'email'], ['package', 'Paquete*', 'text'], ['template', 'Diseño de referencia', 'text'], ['totalPrice', 'Precio total', 'number'], ['depositAmount', 'Anticipo', 'number'], ['remainingAmount', 'Saldo restante', 'number'], ['projectStatus', 'Estado', 'select:lead|awaiting-deposit|active|client-review|awaiting-final-payment|ready-to-publish|published|paused|cancelled|completed'], ['developmentStage', 'Fase de desarrollo', 'select:not-started|setup|skeleton|visual-design|content|functionality|responsive|qa|client-review|revisions|final-review|ready-to-publish|published'], ['paymentStatus', 'Estado de pago', 'select:pending|deposit-paid|paid'], ['hostingPlan', 'Plan de hosting', 'text'], ['hostingStartDate', 'Inicio hosting', 'date'], ['hostingRenewalDate', 'Renovación hosting', 'date'], ['maintenancePlan', 'Plan de mantenimiento', 'text'], ['maintenanceFrequency', 'Frecuencia mantenimiento', 'select:monthly'], ['maintenanceRequestsLimit', 'Límite mensual', 'number'], ['maintenanceRequestsUsed', 'Cambios utilizados', 'number'], ['maintenancePeriodStart', 'Inicio del periodo', 'date'], ['maintenancePeriodEnd', 'Fin del periodo', 'date'], ['lastMaintenanceReviewAt', 'Última revisión preventiva', 'date'], ['nextMaintenanceReviewAt', 'Próxima revisión preventiva', 'date'], ['lastQuarterlyReviewAt', 'Última revisión trimestral', 'date'], ['nextQuarterlyReviewAt', 'Próxima revisión trimestral', 'date'], ['maintenanceRenewalDate', 'Renovación mantenimiento', 'date'], ['maintenanceNotes', 'Notas de mantenimiento', 'textarea'], ['localProjectName', 'Referencia local', 'text'], ['previewUrl', 'URL de preview', 'url'], ['productionUrl', 'URL de producción', 'url'], ['repositoryUrl', 'Repositorio', 'url'], ['scope', 'Alcance', 'textarea'], ['notes', 'Notas internas', 'textarea']
];
const updateFields = [['stage', 'Fase', 'select-stages'], ['title', 'Título', 'text'], ['description', 'Descripción', 'textarea'], ['commit', 'Commit opcional', 'text']];
const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginForm = document.querySelector('#login-form');
const loginStatus = document.querySelector('#login-status');
const appStatus = document.querySelector('#app-status');
const projectList = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectDialog = document.querySelector('#project-dialog');
const updateDialog = document.querySelector('#update-dialog');
const projectForm = document.querySelector('#project-form');
const updateForm = document.querySelector('#update-form');
const projectFormStatus = document.querySelector('#project-form-status');
const updateFormStatus = document.querySelector('#update-form-status');
const projectsView = document.querySelector('#projects-view');
const calendarView = document.querySelector('#calendar-view');
const calendarGrid = document.querySelector('#calendar-grid');
const calendarAgenda = document.querySelector('#calendar-agenda');
const calendarStatus = document.querySelector('#calendar-status');
const calendarEventDialog = document.querySelector('#calendar-event-dialog');
const calendarEventForm = document.querySelector('#calendar-event-form');
const calendarEventFormStatus = document.querySelector('#calendar-event-form-status');
const calendarEventReturnButton = document.querySelector('#new-calendar-event-button');
const calendarDetailDialog = document.querySelector('#calendar-detail-dialog');
const calendarDetailContent = document.querySelector('#calendar-detail-content');
let calendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
let calendarEvents = [];
let calendarEditingEvent = null;
let currentUser = null;
let projects = [];
let currentProject = null;

renderFields(document.querySelector('#project-fields'), projectFields);
renderFields(document.querySelector('#update-fields'), updateFields);
loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginStatus.textContent = '';
    const email = document.querySelector('#login-email').value.trim().toLowerCase();
    const password = document.querySelector('#login-password').value;
    if (!email || !password) { loginStatus.textContent = 'Escribe tu correo y contraseña.'; return; }
    const button = loginForm.querySelector('button'); button.disabled = true; button.textContent = 'ENTRANDO...';
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch { loginStatus.textContent = 'No pudimos iniciar sesión con esos datos.'; button.disabled = false; button.textContent = 'ENTRAR'; }
});
document.querySelector('#logout-button').addEventListener('click', () => signOut(auth));
document.querySelector('#refresh-button').addEventListener('click', loadProjects);
document.querySelector('#new-project-button').addEventListener('click', () => openProjectDialog());
document.querySelector('#project-search').addEventListener('input', renderProjectList);
document.querySelector('#project-status-filter').addEventListener('change', renderProjectList);
document.querySelector('#project-stage-filter').addEventListener('change', renderProjectList);
document.querySelector('#maintenance-filter').addEventListener('change', renderProjectList);
document.querySelector('#projects-tab').addEventListener('click', (event) => { event.preventDefault(); history.replaceState(null, '', `${location.pathname}${location.search}`); activateView('projects'); });
document.querySelector('#calendar-tab').addEventListener('click', (event) => { event.preventDefault(); history.replaceState(null, '', `${location.pathname}${location.search}#calendario`); activateView('calendar'); });
document.querySelector('#previous-month-button').addEventListener('click', () => changeCalendarMonth(-1));
document.querySelector('#next-month-button').addEventListener('click', () => changeCalendarMonth(1));
document.querySelector('#today-button').addEventListener('click', () => { const now = new Date(); calendarDate = new Date(now.getFullYear(), now.getMonth(), 1, 12); loadCalendar(); });
document.querySelector('#new-calendar-event-button').addEventListener('click', () => openCalendarEventDialog());
document.querySelector('#calendar-type-filter').addEventListener('change', renderCalendar);
document.querySelector('#calendar-project-filter').addEventListener('change', renderCalendar);
document.querySelector('#calendar-search').addEventListener('input', renderCalendar);
calendarEventForm.addEventListener('submit', saveCalendarEvent);
document.querySelector('#close-calendar-event-button').addEventListener('click', closeCalendarEventDialog);
document.querySelector('#cancel-calendar-event-button').addEventListener('click', closeCalendarEventDialog);
calendarEventDialog.addEventListener('click', (event) => { if (event.target === calendarEventDialog) closeCalendarEventDialog(); });
calendarEventDialog.addEventListener('close', () => { calendarEventForm.reset(); calendarEventFormStatus.textContent = ''; calendarEditingEvent = null; calendarEventReturnButton.focus({ preventScroll: true }); });
document.querySelector('#close-calendar-detail-button').addEventListener('click', () => calendarDetailDialog.close());
projectForm.addEventListener('submit', saveProject);
updateForm.addEventListener('submit', saveUpdate);
document.querySelector('#save-project-button').addEventListener('click', saveProject);
document.querySelector('#save-update-button').addEventListener('click', saveUpdate);
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) { showLogin(); return; }
    const authorized = user.uid === AUTHORIZED_UID && user.email?.trim().toLowerCase() === AUTHORIZED_EMAIL;
    if (!authorized) { await signOut(auth); loginStatus.textContent = 'Acceso no autorizado.'; return; }
    showApp(); await loadProjects(); if (location.hash === '#calendario') activateView('calendar');
});

async function loadProjects() {
    setAppStatus('Cargando proyectos...');
    try { const result = await authorizedFetch('/getProjects'); projects = Array.isArray(result.projects) ? result.projects : []; renderSummary(); renderProjectList(); setAppStatus(''); openQueryProject(); }
    catch (error) { setAppStatus(friendlyError(error, 'No pudimos cargar los proyectos.')); }
}
function activateView(view) { const calendar = view === 'calendar'; projectsView.hidden = calendar; calendarView.hidden = !calendar; document.querySelector('#projects-tab').classList.toggle('active', !calendar); document.querySelector('#projects-tab').toggleAttribute('aria-current', !calendar); document.querySelector('#calendar-tab').classList.toggle('active', calendar); document.querySelector('#calendar-tab').toggleAttribute('aria-current', calendar); if (calendar) { populateCalendarProjects(); loadCalendar(); } }
async function loadCalendar() {
    const range = calendarRange(calendarDate.getFullYear(), calendarDate.getMonth()); calendarStatus.textContent = 'Cargando eventos...';
    try { const result = await authorizedFetch(`${calendarEventsUrl}?start=${range.start}&end=${range.end}`); calendarEvents = Array.isArray(result.events) ? result.events : []; populateCalendarProjects(); renderCalendar(); calendarStatus.textContent = ''; } catch (error) { calendarStatus.textContent = friendlyError(error, 'No pudimos cargar el calendario.'); calendarEvents = []; renderCalendar(); }
}
function changeCalendarMonth(offset) { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + offset, 1, 12); loadCalendar(); }
function populateCalendarProjects() { const selects = [document.querySelector('#calendar-project-filter'), calendarEventForm.querySelector('[name="projectId"]')]; const values = [...new Map(projects.map((project) => [project.id, project.businessName || 'Proyecto sin nombre'])).entries()]; selects.forEach((select, index) => { const selected = select.value; select.replaceChildren(); if (index === 0) select.append(new Option('Todos', 'all')); else select.append(new Option('Sin proyecto', '')); values.forEach(([id, name]) => select.append(new Option(name, id))); select.value = values.some(([id]) => id === selected) ? selected : index === 0 ? 'all' : ''; }); }
function renderCalendar() { const range = calendarRange(calendarDate.getFullYear(), calendarDate.getMonth()); const filtered = filterEvents(calendarEvents, { type: document.querySelector('#calendar-type-filter').value, projectId: document.querySelector('#calendar-project-filter').value, query: document.querySelector('#calendar-search').value }); document.querySelector('#calendar-month-label').textContent = monthLabel(calendarDate.getFullYear(), calendarDate.getMonth()); renderCalendarSummary(calendarEvents); renderCalendarGrid(range, filtered); renderCalendarAgenda(filtered); }
function renderCalendarSummary(events) { const today = dateKey(new Date()); const now = new Date(); const inSeven = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 12); setText('#today-events-count', events.filter((event) => event.date === today).length); setText('#next-events-count', events.filter((event) => event.date > today && event.date <= dateKey(inSeven)).length); setText('#overdue-events-count', events.filter((event) => event.date < today).length); const overdue = events.filter((event) => event.date < today).length; const badge = document.querySelector('#calendar-pending-badge'); badge.hidden = !overdue; badge.textContent = overdue ? `${overdue} pendientes` : ''; }
function renderCalendarGrid(range, events) { calendarGrid.replaceChildren(...calendarWeekdays.map((day) => { const heading = document.createElement('div'); heading.className = 'calendar-weekday'; heading.textContent = day; return heading; })); const today = dateKey(new Date()); buildMonthGrid(calendarDate.getFullYear(), calendarDate.getMonth()).forEach((cell) => { const day = document.createElement('article'); day.className = `calendar-day ${cell.outside ? 'outside' : ''} ${cell.key === today ? 'today' : ''}`; const number = document.createElement('div'); number.className = 'calendar-day-number'; number.textContent = cell.day; if (cell.key === today) { const mark = document.createElement('span'); mark.className = 'today-mark'; mark.title = 'Hoy'; number.append(mark); day.setAttribute('aria-current', 'date'); } const list = document.createElement('div'); list.className = 'calendar-event-list'; events.filter((event) => event.date === cell.key).slice(0, 3).forEach((event) => list.append(createCalendarEventButton(event))); const more = events.filter((event) => event.date === cell.key).length - 3; if (more > 0) { const label = document.createElement('p'); label.className = 'calendar-more'; label.textContent = `+${more} más`; list.append(label); } day.append(number, list); day.addEventListener('click', (event) => { if (event.target.closest('.calendar-event')) return; openCalendarEventDialog(cell.key); }); calendarGrid.append(day); }); }
function renderCalendarAgenda(events) { calendarAgenda.replaceChildren(); const days = [...new Set(events.map((event) => event.date))].sort(); if (!days.length) { calendarAgenda.append(createMessage('No hay eventos programados este mes.', 'empty-state')); return; } days.forEach((dayKey) => { const section = document.createElement('section'); section.className = 'agenda-day'; const heading = document.createElement('h3'); heading.textContent = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${dayKey}T12:00:00`)); const dateText = document.createElement('span'); dateText.textContent = dayKey; heading.append(dateText); const list = document.createElement('div'); list.className = 'calendar-event-list'; events.filter((event) => event.date === dayKey).forEach((event) => list.append(createCalendarEventButton(event))); section.append(heading, list); calendarAgenda.append(section); }); }
function createCalendarEventButton(event) { const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-event'; button.dataset.type = event.type; const content = document.createElement('span'); const title = document.createElement('strong'); title.textContent = event.title; const meta = document.createElement('span'); meta.textContent = `${event.projectName || 'Eventora'} · ${event.time || event.typeLabel || calendarEventTypes[event.type] || 'Evento'}`; content.append(title, meta); button.append(content); button.addEventListener('click', () => openCalendarDetail(event)); return button; }
function openCalendarDetail(event) { document.querySelector('#calendar-detail-title').textContent = event.title; calendarDetailContent.replaceChildren(definitionList([['Proyecto', event.projectName || 'Sin proyecto'], ['Tipo', event.typeLabel || calendarEventTypes[event.type] || 'Evento'], ['Fecha', formatDateOnly(event.date)], ['Estado', event.status === 'today' ? 'Hoy' : event.status === 'overdue' ? 'Vencido' : 'Próximo'], ['Notas', event.notes || 'Sin notas.']])); const actions = document.createElement('div'); actions.className = 'event-detail-actions'; if (event.projectId) actions.append(actionButton('Abrir proyecto', () => { calendarDetailDialog.close(); activateView('projects'); showDetail(event.projectId); })); if (event.canEdit) { actions.append(actionButton('Editar', () => { calendarDetailDialog.close(); openCalendarEventDialog('', event); }), actionButton('Eliminar', () => deleteCalendarEvent(event))); } calendarDetailContent.append(actions); calendarDetailDialog.showModal(); }
function openCalendarEventDialog(date = '', event = null) { calendarEditingEvent = event; document.querySelector('#calendar-event-dialog-title').textContent = event ? 'Editar evento' : 'Añadir evento'; calendarEventFormStatus.textContent = ''; const values = { title: event?.title || '', date: date || event?.date || dateKey(new Date()), time: event?.time || '', type: event?.type || 'reminder', projectId: event?.projectId || '', notes: event?.notes || '' }; calendarEventForm.reset(); Object.entries(values).forEach(([key, value]) => { const field = calendarEventForm.elements[key]; if (field) field.value = value; }); populateCalendarProjects(); calendarEventForm.elements.projectId.value = values.projectId; calendarEventDialog.showModal(); calendarEventForm.elements.title.focus({ preventScroll: true }); }
function closeCalendarEventDialog() { if (calendarEventDialog.open) calendarEventDialog.close(); else { calendarEventForm.reset(); calendarEditingEvent = null; calendarEventReturnButton.focus({ preventScroll: true }); } }
async function saveCalendarEvent(event) { event.preventDefault(); if (!calendarEventForm.reportValidity()) return; calendarEventFormStatus.textContent = 'Guardando...'; try { const body = { ...formDataToObject(calendarEventForm) }; const path = calendarEditingEvent ? '/updateCalendarEvent' : '/createCalendarEvent'; if (calendarEditingEvent) body.id = calendarEditingEvent.id; await authorizedFetch(path, { method: 'POST', body: JSON.stringify(body) }); calendarEventDialog.close(); await loadCalendar(); } catch (error) { calendarEventFormStatus.textContent = friendlyError(error, 'No pudimos guardar el evento.'); } }
async function deleteCalendarEvent(event) { if (!window.confirm(`¿Eliminar el evento “${event.title}”?`)) return; try { await authorizedFetch('/deleteCalendarEvent', { method: 'POST', body: JSON.stringify({ id: event.id }) }); calendarDetailDialog.close(); await loadCalendar(); } catch (error) { calendarStatus.textContent = friendlyError(error, 'No pudimos eliminar el evento.'); } }
async function openQueryProject() { const id = new URLSearchParams(location.search).get('id'); if (id) await showDetail(id); }
async function showDetail(id) {
    setAppStatus('Cargando detalle...');
    try {
        const [projectResult, updatesResult] = await Promise.all([authorizedFetch(`/getProject?id=${encodeURIComponent(id)}`), authorizedFetch(`/getProjectUpdates?id=${encodeURIComponent(id)}`)]);
        currentProject = projectResult.project; renderDetail(currentProject, updatesResult.updates || []); detailView.hidden = false; projectList.hidden = true; window.scrollTo({ top: 0, behavior: 'smooth' }); setAppStatus('');
    } catch (error) { setAppStatus(friendlyError(error, 'No pudimos cargar el proyecto.')); }
}
function renderSummary() {
    setText('#total-count', projects.length); setText('#active-count', projects.filter((p) => ['active', 'client-review', 'awaiting-final-payment', 'ready-to-publish'].includes(p.projectStatus)).length); setText('#review-count', projects.filter((p) => p.projectStatus === 'client-review' || p.developmentStage === 'client-review').length); setText('#payment-count', projects.filter((p) => ['awaiting-deposit', 'awaiting-final-payment'].includes(p.projectStatus)).length); setText('#published-count', projects.filter((p) => p.projectStatus === 'published').length);
}
function renderProjectList() {
    const query = normalizeText(document.querySelector('#project-search').value); const status = document.querySelector('#project-status-filter').value; const stage = document.querySelector('#project-stage-filter').value; const maintenance = document.querySelector('#maintenance-filter').value;
    const filtered = projects.filter((project) => !query || [project.businessName, project.clientName, project.city].some((value) => normalizeText(value).includes(query))).filter((project) => status === 'all' || project.projectStatus === status).filter((project) => stage === 'all' || project.developmentStage === stage).filter((project) => maintenance === 'all' || maintenanceState(project) === maintenance);
    setText('#results-summary', projects.length ? `${filtered.length} de ${projects.length} proyectos` : ''); projectList.replaceChildren(); projectList.hidden = false; detailView.hidden = true;
    if (!filtered.length) { projectList.append(createMessage(projects.length ? 'No hay proyectos con estos filtros.' : 'Todavía no hay proyectos.', 'empty-state')); return; }
    filtered.forEach((project) => projectList.append(createProjectCard(project)));
}
function createProjectCard(project) {
    const card = document.createElement('article'); card.className = 'project-card';
    const top = document.createElement('div'); top.className = 'card-top'; const heading = document.createElement('div'); const title = document.createElement('h3'); title.textContent = project.businessName || 'Proyecto sin nombre'; const client = document.createElement('p'); client.textContent = project.clientName || 'Cliente sin nombre'; heading.append(title, client); top.append(heading, createPill(statusLabels[project.projectStatus] || 'Sin estado', project.projectStatus));
    const meta = document.createElement('div'); meta.className = 'project-meta'; meta.append(metaItem('Fase', stageLabels[project.developmentStage] || 'Sin comenzar'), metaItem('Paquete', project.package || 'Sin definir')); if (project.maintenanceEnabled) meta.append(metaItem('Mantenimiento', maintenanceStateLabel(project)));
    const update = document.createElement('p'); update.textContent = project.lastUpdateSummary || 'Sin avances registrados.';
    const button = document.createElement('button'); button.className = 'button button-light'; button.type = 'button'; button.textContent = 'Ver proyecto'; button.addEventListener('click', () => showDetail(project.id)); card.append(top, meta, update, button); return card;
}
function renderDetail(project, updates) {
    detailView.replaceChildren();
    const header = document.createElement('div'); header.className = 'detail-header'; const titleBox = document.createElement('div'); const title = document.createElement('h2'); title.textContent = project.businessName || 'Proyecto'; const subtitle = document.createElement('p'); subtitle.className = 'muted'; subtitle.textContent = `${project.clientName || 'Cliente'} · ${statusLabels[project.projectStatus] || 'Sin estado'}`; titleBox.append(title, subtitle); const actions = document.createElement('div'); actions.className = 'detail-header-actions'; actions.append(actionButton('Registrar avance', () => openUpdateDialog(project)), actionButton('Editar proyecto', () => openProjectDialog(project)), actionButton('Eliminar', () => deleteProject(project)), actionButton('Volver', () => { history.replaceState(null, '', location.pathname); renderProjectList(); })); header.append(titleBox, actions);
    const columns = document.createElement('div'); columns.className = 'detail-columns'; const main = document.createElement('div'); const side = document.createElement('div');
    main.append(detailBlock('Resumen', definitionList([['Estado', statusLabels[project.projectStatus] || 'Sin definir'], ['Fase actual', stageLabels[project.developmentStage] || 'Sin comenzar'], ['Último avance', project.lastUpdateSummary || 'Sin avances registrados.'], ['Última actualización', formatDate(project.lastUpdateAt || project.updatedAt)]])), detailBlock('Historial de desarrollo', createTimeline(updates)));
    side.append(detailBlock('Progreso', createPhaseTrack(project.developmentStage)), detailBlock('Comercial', definitionList([['Paquete', project.package || 'Sin definir'], ['Precio total', formatMoney(project.totalPrice)], ['Anticipo', formatMoney(project.depositAmount)], ['Saldo', formatMoney(project.remainingAmount)], ['Pago', paymentLabel(project.paymentStatus)]])), createMaintenanceBlock(project), detailBlock('Enlaces', createLinks(project)), detailBlock('Notas internas', createMessage(project.notes || 'Sin notas internas.', 'muted')));
    columns.append(main, side); detailView.append(header, columns);
}
function detailBlock(title, content) { const block = document.createElement('section'); block.className = 'detail-block'; const heading = document.createElement('h3'); heading.textContent = title; block.append(heading, content); return block; }
function definitionList(items) { const dl = document.createElement('dl'); dl.className = 'detail-list'; items.forEach(([term, value]) => { const dt = document.createElement('dt'); dt.textContent = term; const dd = document.createElement('dd'); dd.textContent = value; dl.append(dt, dd); }); return dl; }
function createPhaseTrack(current) { const list = document.createElement('div'); list.className = 'phase-track'; const index = phaseOrder.indexOf(current); phaseOrder.forEach((stage, position) => { const item = document.createElement('div'); item.className = `phase-step ${position < index ? 'done' : ''} ${stage === current ? 'current' : ''}`; item.textContent = stageLabels[stage]; list.append(item); }); return list; }
function createTimeline(updates) { const list = document.createElement('div'); list.className = 'timeline'; if (!updates.length) return createMessage('Todavía no hay avances registrados.', 'muted'); updates.forEach((update) => { const item = document.createElement('article'); item.className = 'timeline-item'; const time = document.createElement('time'); time.textContent = formatDate(update.createdAt); const content = document.createElement('div'); const title = document.createElement('strong'); title.textContent = update.title; const description = document.createElement('p'); description.textContent = update.description; content.append(title, description); item.append(time, content); list.append(item); }); return list; }
function createLinks(project) { const list = document.createElement('div'); list.className = 'link-list'; [['Preview', project.previewUrl], ['Producción', project.productionUrl], ['Repositorio', project.repositoryUrl]].forEach(([label, url]) => { if (!url) return; const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = label; list.append(link); }); if (!list.children.length) list.append(createMessage('Sin enlaces registrados.', 'muted')); return list; }
function openProjectDialog(project = null) { document.querySelector('#project-dialog-title').textContent = project ? 'Editar proyecto' : 'Nuevo proyecto'; projectFields.forEach(([key]) => { const input = document.querySelector(`#project-fields [name="${key}"]`); if (input) input.value = project?.[key] ?? ''; }); if (!project) { setField('projectStatus', 'lead'); setField('developmentStage', 'not-started'); setField('paymentStatus', 'pending'); } projectForm.dataset.id = project?.id || ''; projectFormStatus.textContent = ''; projectDialog.showModal(); }
function openUpdateDialog(project) { currentProject = project; document.querySelector('#update-fields [name="stage"]').value = project.developmentStage || 'not-started'; updateForm.reset(); document.querySelector('#update-fields [name="stage"]').value = project.developmentStage || 'not-started'; updateForm.dataset.id = project.id; updateFormStatus.textContent = ''; updateDialog.showModal(); }
async function saveProject(event) { event.preventDefault(); if (event.submitter?.value === 'cancel') { projectDialog.close(); return; } projectFormStatus.textContent = 'Guardando...'; const data = formDataToObject(projectForm); data.hostingEnabled = Boolean(data.hostingPlan || data.hostingRenewalDate); data.maintenanceEnabled = Boolean(data.maintenancePlan || data.maintenanceRenewalDate); try { const path = projectForm.dataset.id ? '/updateProject' : '/createProject'; await authorizedFetch(path, { method: 'POST', body: JSON.stringify({ ...data, id: projectForm.dataset.id }) }); projectDialog.close(); await loadProjects(); }
    catch (error) { projectFormStatus.textContent = friendlyError(error, 'No pudimos guardar el proyecto.'); } }
async function saveUpdate(event) { event.preventDefault(); if (event.submitter?.value === 'cancel') { updateDialog.close(); return; } updateFormStatus.textContent = 'Registrando...'; try { await authorizedFetch('/addProjectUpdate', { method: 'POST', body: JSON.stringify({ id: updateForm.dataset.id, ...formDataToObject(updateForm), source: 'manual' }) }); updateDialog.close(); await showDetail(updateForm.dataset.id); }
    catch (error) { updateFormStatus.textContent = friendlyError(error, 'No pudimos registrar el avance.'); } }
async function deleteProject(project) { const confirmation = window.prompt(`Para eliminar este proyecto escribe exactamente: ${project.id}`); if (confirmation !== project.id) return; setAppStatus('Eliminando proyecto...'); try { await authorizedFetch('/deleteProject', { method: 'POST', body: JSON.stringify({ id: project.id, confirmation }) }); currentProject = null; history.replaceState(null, '', location.pathname); await loadProjects(); } catch (error) { setAppStatus(friendlyError(error, 'No pudimos eliminar el proyecto.')); } }
function renderFields(container, fields) { fields.forEach(([key, label, type]) => { const wrapper = document.createElement('label'); wrapper.className = type === 'textarea' ? 'full' : ''; wrapper.textContent = label; let input; if (type === 'textarea') input = document.createElement('textarea'); else if (type.startsWith('select:') || type === 'select-stages') { input = document.createElement('select'); const values = type === 'select-stages' ? stages : type.slice(7).split('|'); values.forEach((value) => input.append(new Option(stageLabels[value] || statusLabels[value] || paymentLabel(value), value))); } else { input = document.createElement('input'); input.type = type; } input.name = key; wrapper.append(input); container.append(wrapper); }); }
function formDataToObject(form) { const data = {}; new FormData(form).forEach((value, key) => { data[key] = typeof value === 'string' ? value.trim() : value; }); return data; }
function setField(name, value) { const input = document.querySelector(`#project-fields [name="${name}"]`); if (input) input.value = value; }
function metaItem(label, value) { const wrapper = document.createElement('div'); const small = document.createElement('small'); small.textContent = label; const strong = document.createElement('strong'); strong.textContent = value; wrapper.append(small, strong); return wrapper; }
function actionButton(label, handler) { const button = document.createElement('button'); button.className = 'button button-light'; button.type = 'button'; button.textContent = label; button.addEventListener('click', handler); return button; }
function createPill(text, status) { const pill = document.createElement('span'); pill.className = `pill ${status === 'client-review' ? 'review' : status?.includes('payment') ? 'payment' : ''}`; pill.textContent = text; return pill; }
function createMessage(text, className) { const message = document.createElement('p'); message.className = className; message.textContent = text; return message; }
async function authorizedFetch(path, options = {}) { const token = await currentUser.getIdToken(); const response = await fetch(`${functionsBaseUrl}${path}`, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }); const result = await response.json().catch(() => ({})); if (!response.ok || !result.ok) throw new Error(result.message || 'La operación no pudo completarse.'); return result; }
function showLogin() { loginView.hidden = false; appView.hidden = true; }
function showApp() { loginView.hidden = true; appView.hidden = false; }
function setAppStatus(value) { appStatus.textContent = value; }
function setText(selector, value) { document.querySelector(selector).textContent = String(value); }
function friendlyError(error, fallback) { return error?.message && !/firebase|permission|function|network/i.test(error.message) ? error.message : fallback; }
function normalizeText(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function formatDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Pendiente'; }
function formatMoney(value) { const amount = Number(value); if (!amount) return 'Sin definir'; return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount); }
function paymentLabel(value) { return ({ pending: 'Pendiente', 'deposit-paid': 'Anticipo pagado', paid: 'Pagado' })[value] || 'Sin definir'; }
function hostingLabel(value) { return ({ 'not-applicable': 'No aplica', pending: 'Pendiente', active: 'Activo', expiring: 'Por renovar', expired: 'Vencido', cancelled: 'Cancelado' })[value] || 'Sin definir'; }
function createMaintenanceBlock(project) {
    if (!project.maintenanceEnabled) return detailBlock('Hosting y mantenimiento', definitionList([['Hosting', project.hostingEnabled ? `${project.hostingPlan || 'Plan pendiente'} · ${hostingLabel(project.hostingStatus)}` : 'No contratado'], ['Mantenimiento', 'No contratado']]));
    const used = Number.isInteger(project.maintenanceRequestsUsed) ? project.maintenanceRequestsUsed : 0;
    const limit = Number.isInteger(project.maintenanceRequestsLimit) ? project.maintenanceRequestsLimit : 2;
    const content = document.createElement('div');
    content.append(definitionList([['Hosting', `${project.hostingPlan || 'Plan pendiente'} · ${hostingLabel(project.hostingStatus)}`], ['Mantenimiento', `${project.maintenancePlan || 'Plan pendiente'} · ${hostingLabel(project.maintenanceStatus)}`], ['Revisión preventiva', 'Cada 30 días'], ['Última revisión', formatDateOnly(project.lastMaintenanceReviewAt)], ['Próxima revisión', formatDateOnly(project.nextMaintenanceReviewAt)], ['Revisión general', 'Cada 3 meses'], ['Última trimestral', formatDateOnly(project.lastQuarterlyReviewAt)], ['Próxima trimestral', formatDateOnly(project.nextQuarterlyReviewAt)], ['Cambios utilizados', `${used} / ${limit}`], ['Periodo actual', `${formatDateOnly(project.maintenancePeriodStart)} – ${formatDateOnly(project.maintenancePeriodEnd)}`], ['Renovación', project.maintenanceRenewalDate || 'Pendiente']]));
    const actions = document.createElement('div'); actions.className = 'detail-actions';
    actions.append(actionButton('Registrar revisión preventiva', () => registerMaintenance(project, 'preventive')), actionButton('Registrar revisión trimestral', () => registerMaintenance(project, 'quarterly')), actionButton(used >= limit ? 'Registrar fuera de plan' : 'Registrar solicitud incluida', () => registerMaintenance(project, 'request', used >= limit ? 'extra' : 'included')));
    content.append(actions); return detailBlock('Hosting y mantenimiento', content);
}
async function registerMaintenance(project, type, requestType = '') {
    const prompt = type === 'preventive' ? 'Notas de la revisión preventiva:' : type === 'quarterly' ? 'Notas de la revisión trimestral:' : requestType === 'extra' ? 'Describe el trabajo fuera de plan:' : 'Describe la solicitud incluida:';
    const description = window.prompt(prompt); if (!description?.trim()) return;
    setAppStatus('Registrando actividad...');
    try { await authorizedFetch(maintenanceActivityUrl, { method: 'POST', body: JSON.stringify({ id: project.id, type, requestType, description: description.trim() }) }); await showDetail(project.id); await loadProjects(); setAppStatus('Actividad registrada.'); }
    catch (error) { setAppStatus(friendlyError(error, 'No pudimos registrar la actividad.')); }
}
function maintenanceState(project) { if (!project.maintenanceEnabled) return 'disabled'; const next = parseDateOnly(project.nextMaintenanceReviewAt); if (!next) return 'upcoming'; const days = Math.ceil((next - startOfToday()) / 86400000); return days < 0 ? 'overdue' : days <= 7 ? 'upcoming' : 'current'; }
function maintenanceStateLabel(project) { return ({ disabled: 'No activo', current: 'Al día', upcoming: 'Revisión próxima', overdue: 'Revisión pendiente' })[maintenanceState(project)] || 'Mantenimiento activo'; }
function parseDateOnly(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? new Date(`${value}T12:00:00`) : null; }
function startOfToday() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12); }
function formatDateOnly(value) { const date = parseDateOnly(value); return date ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date) : 'Pendiente'; }
