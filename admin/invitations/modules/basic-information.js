const FIELD_MAP = Object.freeze({
    'invitation-title': 'title',
    'invitation-date': 'date',
    'invitation-time': 'time',
    'invitation-event-type': 'eventType',
    'invitation-city': 'city'
});

export function initBasicInformation({ form, state }) {
    if (!form || !state) return () => {};

    Object.entries(FIELD_MAP).forEach(([id, field]) => {
        const input = form.querySelector(`#${id}`);
        input?.addEventListener('input', () => state.updateContent({ [field]: input.value }));
    });

    const render = ({ draft, ui }) => {
        if (!draft) return;
        Object.entries(FIELD_MAP).forEach(([id, field]) => {
            const input = form.querySelector(`#${id}`);
            if (input && document.activeElement !== input && input.value !== draft.content[field]) {
                input.value = draft.content[field] ?? '';
            }
        });

        form.querySelectorAll('[data-error-for]').forEach((element) => {
            const message = ui.validationErrors[element.dataset.errorFor] ?? '';
            element.textContent = message;
            element.hidden = !message;
            const inputId = Object.entries(FIELD_MAP).find(([, field]) => field === element.dataset.errorFor)?.[0];
            const input = inputId ? form.querySelector(`#${inputId}`) : null;
            input?.setAttribute('aria-invalid', String(Boolean(message)));
        });
    };

    render(state.getSnapshot());
    return state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'content-changed'].includes(reason)) render(snapshot);
    });
}
