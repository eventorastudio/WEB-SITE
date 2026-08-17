import {
    INVITATION_EDITABLE_FIELDS,
    getDraftValue
} from '../core/content-schema.js?v=phase54a-rsvp-time-20260817';
import { isSectionAllowed } from '../core/section-registry.js?v=phase3-logistics-20260813';
import {
    getDetectedIanaTimeZone,
    getSupportedIanaTimeZones
} from '../core/rsvp-time.js?v=phase54a-rsvp-time-20260817';

function fieldId(path) {
    return `invitation-${path.replace(/[^a-z0-9]+/gi, '-')}`;
}

export function createEditorField(definition, onInput) {
    const schema = INVITATION_EDITABLE_FIELDS[definition.path];
    if (!schema) throw new TypeError(`builder/editor-field-without-schema:${definition.path}`);

    const label = document.createElement('label');
    label.className = `field${definition.kind === 'textarea' || definition.wide ? ' field-wide' : ''}${definition.kind === 'toggle' ? ' field-toggle' : ''}`;
    label.htmlFor = fieldId(definition.path);
    if (definition.visibleWhen) label.dataset.visibleWhen = JSON.stringify(definition.visibleWhen);

    const caption = document.createElement('span');
    caption.textContent = definition.label;

    const control = document.createElement(
        definition.kind === 'textarea' ? 'textarea' : (definition.kind === 'select' ? 'select' : 'input')
    );
    control.id = label.htmlFor;
    control.dataset.draftPath = definition.path;
    if (schema.maxLength > 0 && control.tagName !== 'SELECT') control.maxLength = schema.maxLength;
    control.autocomplete = 'off';
    if (control.tagName === 'TEXTAREA') control.rows = definition.rows ?? 3;
    else if (control.tagName === 'SELECT') {
        (definition.options ?? []).forEach((item) => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            if (item.requiredSection) option.dataset.requiredSection = item.requiredSection;
            control.append(option);
        });
    } else control.type = definition.kind === 'toggle' ? 'checkbox' : (definition.kind === 'date' || definition.kind === 'time' ? definition.kind : 'text');
    if (definition.placeholder) control.placeholder = definition.placeholder;
    let dataList = null;
    if (definition.kind === 'timezone') {
        dataList = document.createElement('datalist');
        dataList.id = `${control.id}-options`;
        control.setAttribute('list', dataList.id);
        getSupportedIanaTimeZones().forEach((timeZone) => {
            const option = document.createElement('option');
            option.value = timeZone;
            option.label = `${timeZone.split('/').at(-1).replaceAll('_', ' ')} (${timeZone})`;
            dataList.append(option);
        });
        if (definition.suggestDetectedTimeZone) {
            const detected = getDetectedIanaTimeZone();
            if (detected) control.placeholder = `Sugerida: ${detected}`;
        }
    }
    if (definition.required) control.required = true;
    const commit = () => {
        const scroller = document.getElementById('builder-editor');
        const scrollTop = scroller?.scrollTop ?? 0;
        const value = definition.kind === 'toggle' ? control.checked : control.value;
        onInput(definition.path, value);
        if (scroller && scroller.scrollTop !== scrollTop) scroller.scrollTop = scrollTop;
        if (document.activeElement !== control && control.isConnected) control.focus({ preventScroll: true });
    };
    control.addEventListener(['toggle', 'select'].includes(definition.kind) ? 'change' : 'input', commit);

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

    label.append(caption);
    if (definition.kind === 'toggle') {
        const row = document.createElement('span');
        row.className = 'field-toggle-row';
        const stateLabel = document.createElement('strong');
        stateLabel.dataset.toggleStateFor = definition.path;
        row.append(control, stateLabel);
        label.append(row);
    } else {
        label.append(control);
        if (dataList) label.append(dataList);
    }
    if (definition.help) {
        const help = document.createElement('small');
        help.className = 'field-help';
        help.textContent = definition.help;
        label.append(help);
    }
    label.append(footer);
    return label;
}

export function syncEditorFields(scope, snapshot) {
    if (!scope || !snapshot?.draft) return;
    scope.querySelectorAll('[data-draft-path]').forEach((control) => {
        const path = control.dataset.draftPath;
        const rawValue = getDraftValue(snapshot.draft, path);
        const value = String(rawValue ?? '');
        if (control.type === 'checkbox') control.checked = rawValue === true;
        else if (document.activeElement !== control && control.value !== value) control.value = value;
        const field = control.closest('.field');
        if (field?.dataset.visibleWhen) {
            const conditions = JSON.parse(field.dataset.visibleWhen);
            field.hidden = !conditions.every(({ path: conditionPath, equals }) => getDraftValue(snapshot.draft, conditionPath) === equals);
        }
        if (control.tagName === 'SELECT') {
            [...control.options].forEach((option) => {
                const requiredSection = option.dataset.requiredSection;
                if (requiredSection) option.disabled = !isSectionAllowed(requiredSection, snapshot.draft.packageId);
            });
        }
        const toggleState = scope.querySelector(`[data-toggle-state-for="${path}"]`);
        if (toggleState) toggleState.textContent = control.checked ? 'Activo' : 'Inactivo';
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
