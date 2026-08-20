import { validateInvitationDraft } from '../core/builder-validation.js?v=phase86-review-20260820';
import { getThemeById } from '../core/theme-registry.js?v=phase86-appearance-20260820';
import { getSectionById } from '../core/section-registry.js?v=phase86-review-20260820';
import { isRsvpEnabled } from '../core/rsvp-schema.js?v=phase54a-rsvp-time-20260817';

const ERROR_TARGETS = Object.freeze({ 'content.': 'information', rsvp: 'information', media: 'media', locations: 'logistics', itinerary: 'details', gifts: 'details', accommodations: 'details', links: 'details', appearance: 'appearance' });
const text = (value, fallback = 'Sin configurar') => String(value ?? '').trim() || fallback;
const count = (value) => Array.isArray(value) ? value.length : 0;
const targetForError = (path) => Object.entries(ERROR_TARGETS).find(([prefix]) => String(path).startsWith(prefix))?.[1] ?? 'information';

export function initReviewEditor({ container, state, publishButton }) {
    if (!container || !state) return () => {};
    const goTo = (target) => document.querySelector(`.builder-step[data-step-target="${target}"]`)?.click();
    const render = (snapshot) => {
        const draft = snapshot.draft ?? {};
        const errors = validateInvitationDraft(draft);
        const theme = getThemeById(draft.themeId);
        const content = draft.content ?? {};
        const media = draft.media ?? {};
        container.replaceChildren();
        const status = document.createElement('div');
        const hasErrors = Object.keys(errors).length > 0;
        const hasPendingChanges = snapshot.ui?.isDirty === true;
        status.className = `review-status ${hasErrors ? 'is-invalid' : 'is-ready'}`;
        status.textContent = hasErrors
            ? `Hay ${Object.keys(errors).length} error(es) que debes corregir antes de publicar.`
            : (hasPendingChanges ? 'Contenido válido · cambios sin guardar' : 'Listo para publicar');
        container.append(status);
        if (Object.keys(errors).length) {
            const list = document.createElement('div');
            list.className = 'review-errors';
            Object.entries(errors).forEach(([path, message]) => {
                const item = document.createElement('button');
                item.type = 'button'; item.className = 'review-error'; item.textContent = `${path}: ${message}`;
                item.addEventListener('click', () => goTo(targetForError(path)));
                list.append(item);
            });
            container.append(list);
        }
        const summary = document.createElement('div');
        summary.className = 'review-grid';
        const sections = Array.isArray(draft.enabledSections) ? draft.enabledSections : [];
        const cards = [
            ['Tema', theme?.name ?? 'Sin seleccionar', 'theme'],
            ['Secciones activas', sections.length ? sections.map((id) => getSectionById(id)?.name ?? id).join(', ') : 'Ninguna', 'sections'],
            ['Información principal', text(content.identity?.primaryName), 'information'],
            ['Multimedia', `${media.cover ? 'Portada' : 'Sin portada'} · ${count(media.gallery)} foto(s) · ${media.video ? 'Video' : 'Sin video'}`, 'media'],
            ['Ubicaciones', `${count(draft.locations)} configurada(s)`, 'logistics'],
            ['Detalles', `${count(draft.itinerary)} itinerario · ${count(draft.gifts)} regalos · ${count(draft.accommodations)} hospedaje · ${count(draft.links)} enlace(s)`, 'details'],
            ['Pase de acceso', draft.enabledSections?.includes('access-preview')
                ? `${content.access?.showQr === false ? 'QR oculto' : 'QR activo'} · ${content.access?.showPrintPass === false ? 'sin impresión' : 'impresión disponible'}`
                : 'Sección desactivada', 'details'],
            ['Apariencia', draft.appearance?.accentColor ? `Acento ${draft.appearance.accentColor}` : 'Predeterminada', 'appearance'],
            ['RSVP', isRsvpEnabled(content.rsvp) ? 'Activo' : 'Desactivado', 'information'],
            ['Estado del borrador', snapshot.ui?.isDirty ? 'Cambios sin guardar' : 'Guardado', null]
        ];
        cards.forEach(([label, value, target]) => {
            const card = document.createElement(target ? 'button' : 'div');
            card.className = 'review-card';
            if (target) { card.type = 'button'; card.addEventListener('click', () => goTo(target)); }
            const heading = document.createElement('strong'); heading.textContent = label;
            const detail = document.createElement('span'); detail.textContent = value;
            card.append(heading, detail); summary.append(card);
        });
        container.append(summary);
        const action = document.createElement('button');
        action.type = 'button'; action.className = 'builder-save review-publish'; action.textContent = 'Publicar';
        action.addEventListener('click', () => publishButton?.click());
        container.append(action);
    };
    render(state.getSnapshot());
    return state.subscribe(({ snapshot }) => render(snapshot), { source: 'review-editor' });
}
