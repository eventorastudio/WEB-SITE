const monthFormatter = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'long' });

export const calendarWeekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function dateKey(date) {
    const value = date instanceof Date ? date : new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function parseDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? new Date(`${value}T12:00:00`) : null;
}

export function buildMonthGrid(year, month) {
    const first = new Date(year, month, 1, 12);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset, 12);
    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start); date.setDate(start.getDate() + index);
        return { date, key: dateKey(date), day: date.getDate(), outside: date.getMonth() !== month };
    });
}

export function monthLabel(year, month) { return monthFormatter.format(new Date(year, month, 1, 12)).replace(/^./, (character) => character.toUpperCase()); }
export function weekdayLabel(date) { return weekdayFormatter.format(date); }
export function calendarRange(year, month) { const cells = buildMonthGrid(year, month); return { start: cells[0].key, end: cells[cells.length - 1].key }; }

export function eventStatus(date, today = dateKey(new Date())) { return date === today ? 'today' : date < today ? 'overdue' : 'upcoming'; }
export function filterEvents(events, { type = 'all', projectId = 'all', query = '' } = {}) {
    const normalized = String(query).trim().toLocaleLowerCase('es-MX');
    return events.filter((event) => (type === 'all' || (type === 'manual' ? event.source === 'manual' : event.type === type || (type === 'renewal' && event.type.includes('renewal')))) && (projectId === 'all' || event.projectId === projectId) && (!normalized || `${event.title} ${event.projectName}`.toLocaleLowerCase('es-MX').includes(normalized)));
}

export function deriveProjectEvents(project, range) {
    const events = [];
    const add = (date, type, title, typeLabel) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || date < range.start || date > range.end) return;
        events.push({ id: `project-${project.id}-${type}`, source: 'project', projectId: project.id, projectName: project.businessName || 'Proyecto sin nombre', title, type, typeLabel, date, time: '', status: eventStatus(date), notes: 'Fecha derivada automáticamente del proyecto.', canEdit: false });
    };
    if (project.maintenanceEnabled === true) {
        add(project.nextMaintenanceReviewAt, 'maintenance', 'Mantenimiento preventivo', 'Mantenimiento');
        add(project.nextQuarterlyReviewAt, 'quarterly', 'Revisión trimestral', 'Trimestral');
        add(project.maintenanceRenewalDate, 'maintenance-renewal', 'Renovación de mantenimiento', 'Renovación · Mantenimiento');
    }
    if (project.hostingEnabled === true) add(project.hostingRenewalDate, 'hosting-renewal', 'Renovación de hosting', 'Renovación · Hosting');
    return events;
}
