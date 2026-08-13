import { getDraftValue } from '../core/content-schema.js?v=phase21-normalization-20260813';

const FIELD_MAP = Object.freeze({
    'invitation-title': 'content.identity.primaryName',
    'invitation-date': 'content.schedule.date',
    'invitation-time': 'content.schedule.time',
    'invitation-event-type': 'content.identity.eventType',
    'invitation-city': 'content.place.city'
});
const ERROR_PATHS = Object.freeze({
    title: 'content.identity.primaryName',
    date: 'content.schedule.date',
    time: 'content.schedule.time'
});

export function initBasicInformation({ form, state }) {
    if (!form || !state) return () => {};

    Object.entries(FIELD_MAP).forEach(([id, field]) => {
        const input = form.querySelector(`#${id}`);
        input?.addEventListener('input', () => state.updateDraftField(field, input.value));
    });

    const render = ({ draft, ui }) => {
        if (!draft) return;
        Object.entries(FIELD_MAP).forEach(([id, field]) => {
            const input = form.querySelector(`#${id}`);
            const value = getDraftValue(draft, field) ?? '';
            if (input && document.activeElement !== input && input.value !== value) {
                input.value = value;
            }
        });

        form.querySelectorAll('[data-error-for]').forEach((element) => {
            const mappedPath = ERROR_PATHS[element.dataset.errorFor] ?? element.dataset.errorFor;
            const message = ui.validationErrors[mappedPath] ?? '';
            element.textContent = message;
            element.hidden = !message;
            const inputId = Object.entries(FIELD_MAP).find(([, field]) => field === mappedPath)?.[0];
            const input = inputId ? form.querySelector(`#${inputId}`) : null;
            input?.setAttribute('aria-invalid', String(Boolean(message)));
        });
    };

    render(state.getSnapshot());
    return state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'content-changed'].includes(reason)) render(snapshot);
    }, { source: 'basic-information' });
}
