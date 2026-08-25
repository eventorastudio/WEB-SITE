import { entityHasContent } from '../core/logistics-schema.js?v=phase141-aloha-gift-letter-picker-20260825';
import { createLocationIcon, LOCATION_ICON_OPTIONS } from '../core/location-icon-registry.js?v=phase113-aloha-location-cards-20260823';
import { GIFT_LETTER_OPTIONS, inferGiftLetterKey } from '../core/gift-letter-registry.js?v=phase141-aloha-gift-letter-picker-20260825';

function element(tag, className, text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function createControl(definition, item, snapshot, collection) {
    const label = element('label', `entity-field${definition.wide ? ' entity-field-wide' : ''}`);
    label.append(element('span', '', definition.label));
    let control;
    if (definition.type === 'iconPicker' || definition.type === 'giftLetterPicker') {
        const isGift = definition.type === 'giftLetterPicker';
        control = element(isGift ? 'details' : 'div', isGift ? 'gift-letter-picker' : 'location-icon-picker');
        const source = definition.nested ? item[definition.nested]?.[definition.field] : item[definition.field];
        const selected = isGift ? inferGiftLetterKey(item) : String(source ?? '');
        const options = definition.options ?? (isGift ? GIFT_LETTER_OPTIONS : LOCATION_ICON_OPTIONS);
        if (isGift) {
            const summary = element('summary', 'gift-letter-picker-trigger');
            const selectedOption = options.find(({ value }) => value === selected) ?? options[0];
            summary.append(element('span', 'gift-letter-picker-current', selectedOption.value));
            summary.append(element('span', '', selectedOption.label));
            control.append(summary);
        }
        const optionsRoot = isGift ? element('div', 'gift-letter-picker-menu') : control;
        options.forEach(({ value, label: optionLabel }) => {
            const option = element('button', isGift ? 'gift-letter-option' : 'location-icon-option');
            option.type = 'button';
            option.dataset.entityIconField = definition.field;
            option.dataset.entityIconValue = value;
            option.setAttribute('aria-pressed', String(selected === value));
            option.title = optionLabel;
            if (isGift) option.append(element('span', 'gift-letter-option-medallion', value));
            else { const icon = createLocationIcon(document, value); if (icon) option.append(icon); }
            option.append(element('span', '', optionLabel));
            optionsRoot.append(option);
        });
        if (isGift) control.append(optionsRoot);
    } else if (definition.type === 'select') {
        control = document.createElement('select');
        (definition.options ?? []).forEach(({ value, label: optionLabel }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = optionLabel;
            control.append(option);
        });
    } else if (definition.type === 'textarea') {
        control = document.createElement('textarea');
        control.rows = definition.rows ?? 3;
    } else {
        control = document.createElement('input');
        control.type = definition.type ?? 'text';
    }
    if (definition.type !== 'iconPicker' && definition.type !== 'giftLetterPicker') {
        control.autocomplete = 'off';
        control.dataset.entityField = definition.field;
        if (definition.nested) control.dataset.entityNested = definition.nested;
        if (definition.placeholder) control.placeholder = definition.placeholder;
        if (definition.maxLength) control.maxLength = definition.maxLength;
        const source = definition.nested ? item[definition.nested]?.[definition.field] : item[definition.field];
        control.value = String(source ?? '');
    }

    const error = element('small', 'entity-field-error');
    const errorPath = definition.errorPath?.(item) ?? `${collection}.${item.id}.${definition.field}`;
    error.dataset.entityError = errorPath;
    error.textContent = snapshot.ui.validationErrors[errorPath] ?? '';
    error.hidden = !error.textContent;
    control.setAttribute('aria-invalid', String(Boolean(error.textContent)));
    label.append(control, error);
    return label;
}

function preserveScroll(callback, focusSelector = '') {
    const scroller = document.getElementById('builder-editor');
    const scrollTop = scroller?.scrollTop ?? 0;
    callback();
    if (scroller) scroller.scrollTop = scrollTop;
    if (focusSelector) {
        const target = document.querySelector(focusSelector);
        try { target?.focus({ preventScroll: true }); } catch { target?.focus(); }
        if (scroller) scroller.scrollTop = scrollTop;
    }
}

export function initEntityListEditor({
    container,
    state,
    collection,
    title,
    description,
    addLabel,
    getItems = (snapshot) => snapshot.draft[collection] ?? [],
    fields,
    summary,
    addMethod,
    updateMethod,
    removeMethod,
    moveMethod,
    canAdd = () => true,
    addUnavailableMessage = '',
    emptyMessage = 'Todavía no hay elementos configurados.',
    rerenderFields = [],
    refreshOnCollections = [],
    onFieldChange = null
}) {
    if (!container || !state) return () => {};
    let snapshot = state.getSnapshot();
    let expandedId = null;

    const render = ({ focusId = '' } = {}) => preserveScroll(() => {
        const items = getItems(snapshot);
        const wrapper = element('section', 'phase3-entity-editor');
        wrapper.dataset.entityCollection = collection;
        const header = element('header', 'phase3-entity-heading');
        const copy = element('div');
        copy.append(element('h3', '', title), element('p', '', description));
        const add = element('button', 'entity-add-button', addLabel);
        add.type = 'button';
        add.dataset.entityAction = 'add';
        add.disabled = !canAdd(snapshot);
        if (add.disabled && addUnavailableMessage) add.title = addUnavailableMessage;
        header.append(copy, add);
        wrapper.append(header);

        if (!items.length) wrapper.append(element('p', 'entity-empty-state', emptyMessage));
        const list = element('div', 'entity-list');
        items.forEach((item, index) => {
            const details = element('details', 'entity-card');
            details.dataset.entityId = item.id;
            details.open = expandedId === item.id || (!expandedId && index === 0);
            const heading = element('summary', 'entity-card-summary');
            const summaryCopy = summary(item, index, snapshot);
            const names = element('span', 'entity-card-copy');
            names.append(element('strong', '', summaryCopy.title), element('small', '', summaryCopy.subtitle || item.id));
            const status = element('span', 'entity-card-status', summaryCopy.status ?? 'Configurado');
            const controls = element('span', 'entity-card-controls');
            if (moveMethod) {
                const up = element('button', 'entity-icon-button', '↑');
                up.type = 'button'; up.dataset.entityAction = 'up'; up.disabled = index === 0; up.setAttribute('aria-label', 'Subir');
                const down = element('button', 'entity-icon-button', '↓');
                down.type = 'button'; down.dataset.entityAction = 'down'; down.disabled = index === items.length - 1; down.setAttribute('aria-label', 'Bajar');
                controls.append(up, down);
            }
            const remove = element('button', 'entity-icon-button is-danger', '×');
            remove.type = 'button'; remove.dataset.entityAction = 'delete'; remove.setAttribute('aria-label', 'Eliminar');
            controls.append(remove);
            heading.append(names, status, controls);

            const body = element('div', 'entity-card-body');
            const grid = element('div', 'entity-fields-grid');
            fields(item, snapshot).filter((definition) => definition.when?.(item, snapshot) !== false)
                .forEach((definition) => grid.append(createControl(definition, item, snapshot, collection)));
            const confirmation = element('div', 'entity-delete-confirmation');
            confirmation.hidden = true;
            confirmation.append(
                element('span', '', 'Este elemento tiene contenido. ¿Deseas eliminarlo?'),
                Object.assign(element('button', 'entity-confirm-cancel', 'Cancelar'), { type: 'button' }),
                Object.assign(element('button', 'entity-confirm-delete', 'Eliminar'), { type: 'button' })
            );
            confirmation.children[1].dataset.entityAction = 'cancel-delete';
            confirmation.children[2].dataset.entityAction = 'confirm-delete';
            body.append(grid, confirmation);
            details.append(heading, body);
            list.append(details);
        });
        wrapper.append(list);
        container.replaceChildren(wrapper);
    }, focusId ? `[data-entity-collection="${collection}"] [data-entity-id="${focusId}"] [data-entity-field]` : '');

    const sync = () => {
        const items = getItems(snapshot);
        container.querySelectorAll('[data-entity-id]').forEach((card) => {
            const item = items.find(({ id }) => id === card.dataset.entityId);
            if (!item) return;
            card.querySelectorAll('[data-entity-field]').forEach((control) => {
                const value = control.dataset.entityNested
                    ? item[control.dataset.entityNested]?.[control.dataset.entityField]
                    : item[control.dataset.entityField];
                if (document.activeElement !== control && control.value !== String(value ?? '')) control.value = String(value ?? '');
                const path = control.parentElement.querySelector('[data-entity-error]')?.dataset.entityError;
                const error = path ? snapshot.ui.validationErrors[path] ?? '' : '';
                const errorNode = control.parentElement.querySelector('[data-entity-error]');
                if (errorNode) { errorNode.textContent = error; errorNode.hidden = !error; }
                control.setAttribute('aria-invalid', String(Boolean(error)));
            });
            card.querySelectorAll('[data-entity-icon-field]').forEach((control) => {
                const value = item[control.dataset.entityIconField] ?? '';
                control.setAttribute('aria-pressed', String(value === control.dataset.entityIconValue));
            });
            const index = items.indexOf(item);
            const summaryCopy = summary(item, index, snapshot);
            const strong = card.querySelector('.entity-card-copy strong');
            const small = card.querySelector('.entity-card-copy small');
            if (strong) strong.textContent = summaryCopy.title;
            if (small) small.textContent = summaryCopy.subtitle || item.id;
        });
    };

    const handleInput = (event) => {
        const control = event.target.closest?.('[data-entity-field]');
        const card = control?.closest('[data-entity-id]');
        if (!control || !card) return;
        const field = control.dataset.entityField;
        const patch = control.dataset.entityNested
            ? { [control.dataset.entityNested]: { [field]: control.value } }
            : { [field]: control.value };
        const result = state[updateMethod](card.dataset.entityId, patch);
        if (result?.ok && result.changed && onFieldChange) {
            onFieldChange({
                id: card.dataset.entityId,
                field,
                value: control.value,
                snapshot: state.getSnapshot()
            });
        }
        if (rerenderFields.includes(field)) {
            snapshot = state.getSnapshot();
            expandedId = card.dataset.entityId;
            render();
        }
    };

    const handleClick = (event) => {
        const iconButton = event.target.closest?.('[data-entity-icon-field]');
        if (iconButton && container.contains(iconButton)) {
            event.preventDefault();
            event.stopPropagation();
            const card = iconButton.closest('[data-entity-id]');
            if (!card) return;
            const field = iconButton.dataset.entityIconField;
            const value = iconButton.dataset.entityIconValue ?? '';
            const result = state[updateMethod](card.dataset.entityId, { [field]: value });
            if (result?.ok && result.changed && onFieldChange) {
                onFieldChange({ id: card.dataset.entityId, field, value, snapshot: state.getSnapshot() });
            }
            snapshot = state.getSnapshot();
            expandedId = card.dataset.entityId;
            render();
            return;
        }
        const button = event.target.closest?.('[data-entity-action]');
        if (!button || !container.contains(button)) return;
        event.preventDefault();
        event.stopPropagation();
        const action = button.dataset.entityAction;
        const card = button.closest('[data-entity-id]');
        const id = card?.dataset.entityId;
        if (action === 'add') {
            const result = state[addMethod]();
            if (result.ok && result.changed) {
                snapshot = state.getSnapshot();
                expandedId = result.entity.id;
                render({ focusId: expandedId });
            }
            return;
        }
        if (!id) return;
        if (action === 'up' || action === 'down') state[moveMethod](id, action);
        else if (action === 'delete') {
            const item = getItems(snapshot).find((candidate) => candidate.id === id);
            if (entityHasContent(item)) card.querySelector('.entity-delete-confirmation').hidden = false;
            else state[removeMethod](id);
        } else if (action === 'cancel-delete') card.querySelector('.entity-delete-confirmation').hidden = true;
        else if (action === 'confirm-delete') state[removeMethod](id);
    };

    const handleToggle = (event) => {
        if (event.target.matches?.('details[data-entity-id]') && event.target.open) expandedId = event.target.dataset.entityId;
    };

    container.addEventListener('input', handleInput);
    container.addEventListener('change', handleInput);
    container.addEventListener('click', handleClick);
    container.addEventListener('toggle', handleToggle, true);
    render();
    const unsubscribe = state.subscribe((payload) => {
        if (payload.reason === 'media-changed' && refreshOnCollections.includes('media')) {
            snapshot = payload.snapshot;
            render();
            return;
        }
        if (payload.reason !== 'entities-changed') return;
        if (refreshOnCollections.includes(payload.details.collection)) {
            snapshot = payload.snapshot;
            render();
            return;
        }
        if (payload.details.collection !== collection) return;
        snapshot = payload.snapshot;
        if (payload.details.operation === 'update') sync();
        else render();
    }, { source: `${collection}-editor` });
    return () => {
        unsubscribe();
        container.removeEventListener('input', handleInput);
        container.removeEventListener('change', handleInput);
        container.removeEventListener('click', handleClick);
        container.removeEventListener('toggle', handleToggle, true);
    };
}

export function textField(field, label, options = {}) { return { field, label, ...options }; }
export function selectField(field, label, options, extra = {}) { return { field, label, type: 'select', options, ...extra }; }
export function iconPickerField(field, label, extra = {}) { return { field, label, type: 'iconPicker', options: LOCATION_ICON_OPTIONS, ...extra }; }
export function giftLetterPickerField(field, label, extra = {}) { return { field, label, type: 'giftLetterPicker', options: GIFT_LETTER_OPTIONS, ...extra }; }
export function textareaField(field, label, options = {}) { return { field, label, type: 'textarea', wide: true, ...options }; }
