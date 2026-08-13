import {
    INVITATION_EDITABLE_FIELDS,
    getDraftValue
} from '../core/content-schema.js?v=phase21-normalization-20260813';

function fieldId(path) {
    return `invitation-${path.replace(/[^a-z0-9]+/gi, '-')}`;
}

export function createEditorField(definition, onInput) {
    const schema = INVITATION_EDITABLE_FIELDS[definition.path];
    if (!schema) throw new TypeError(`builder/editor-field-without-schema:${definition.path}`);

    const label = document.createElement('label');
    label.className = `field${definition.kind === 'textarea' ? ' field-wide' : ''}`;
    label.htmlFor = fieldId(definition.path);

    const caption = document.createElement('span');
    caption.textContent = definition.label;

    const control = document.createElement(definition.kind === 'textarea' ? 'textarea' : 'input');
    control.id = label.htmlFor;
    control.dataset.draftPath = definition.path;
    control.maxLength = schema.maxLength;
    control.autocomplete = 'off';
    if (control.tagName === 'TEXTAREA') control.rows = definition.rows ?? 3;
    else control.type = definition.kind === 'date' || definition.kind === 'time' ? definition.kind : 'text';
    if (definition.placeholder) control.placeholder = definition.placeholder;
    if (definition.required) control.required = true;
    control.addEventListener('input', () => onInput(definition.path, control.value));

    const footer = document.createElement('span');
    footer.className = 'field-footer';
    const error = document.createElement('small');
    error.className = 'field-error';
    error.dataset.errorFor = definition.path;
    error.hidden = true;
    footer.append(error);

    if (definition.kind === 'textarea') {
        const counter = document.createElement('small');
        counter.className = 'field-counter';
        counter.dataset.characterCountFor = definition.path;
        counter.textContent = `0 / ${schema.maxLength}`;
        footer.append(counter);
    }

    label.append(caption, control, footer);
    return label;
}

export function syncEditorFields(scope, snapshot) {
    if (!scope || !snapshot?.draft) return;
    scope.querySelectorAll('[data-draft-path]').forEach((control) => {
        const path = control.dataset.draftPath;
        const value = String(getDraftValue(snapshot.draft, path) ?? '');
        if (document.activeElement !== control && control.value !== value) control.value = value;
        const error = scope.querySelector(`[data-error-for="${path}"]`);
        const message = snapshot.ui.validationErrors[path] ?? '';
        if (error) {
            error.textContent = message;
            error.hidden = !message;
        }
        control.setAttribute('aria-invalid', String(Boolean(message)));
        const counter = scope.querySelector(`[data-character-count-for="${path}"]`);
        if (counter) counter.textContent = `${control.value.length} / ${control.maxLength}`;
    });
}

export function createEditorFieldsGrid(fields, state) {
    const grid = document.createElement('div');
    grid.className = 'content-fields-grid';
    fields.forEach((definition) => {
        grid.append(createEditorField(definition, (path, value) => state.updateDraftField(path, value)));
    });
    return grid;
}
