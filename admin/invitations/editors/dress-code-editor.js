import { DRESS_COLOR_GROUPS } from '../core/logistics-schema.js?v=phase3-logistics-20260813';

const GROUP_LABELS = Object.freeze({
    recommendedColors: 'Colores recomendados',
    avoidedColors: 'Colores a evitar'
});

function button(label, action) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.dataset.colorAction = action;
    return control;
}

export function initDressCodeEditor({ container, state }) {
    if (!container || !state) return () => {};
    let snapshot = state.getSnapshot();

    const render = (focusId = '') => {
        const scroller = document.getElementById('builder-editor');
        const scrollTop = scroller?.scrollTop ?? 0;
        const section = document.createElement('section');
        section.className = 'phase3-entity-editor dress-color-editor';
        section.dataset.entityCollection = 'dressCodeColors';
        const header = document.createElement('header');
        header.className = 'phase3-entity-heading';
        const copy = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = 'Paleta del Dress Code';
        const description = document.createElement('p');
        description.textContent = 'La colección decide cómo presentar estos colores; el draft conserva únicamente su significado.';
        copy.append(title, description);
        header.append(copy);
        section.append(header);

        DRESS_COLOR_GROUPS.forEach((group) => {
            const block = document.createElement('div');
            block.className = 'dress-color-group';
            block.dataset.colorGroup = group;
            const heading = document.createElement('header');
            const name = document.createElement('strong');
            name.textContent = GROUP_LABELS[group];
            const add = button('+ Agregar color', 'add');
            heading.append(name, add);
            const list = document.createElement('div');
            list.className = 'dress-color-list';
            const colors = snapshot.draft.content.dressCode[group] ?? [];
            colors.forEach((color, index) => {
                const row = document.createElement('div');
                row.className = 'dress-color-row';
                row.dataset.colorId = color.id;
                const picker = document.createElement('input');
                picker.type = 'color';
                picker.value = color.value;
                picker.dataset.colorField = 'value';
                picker.setAttribute('aria-label', `Color ${index + 1}`);
                const label = document.createElement('input');
                label.type = 'text';
                label.value = color.name;
                label.maxLength = 160;
                label.placeholder = 'Nombre del color';
                label.dataset.colorField = 'name';
                const up = button('↑', 'up');
                up.disabled = index === 0;
                const down = button('↓', 'down');
                down.disabled = index === colors.length - 1;
                const remove = button('×', 'delete');
                remove.className = 'is-danger';
                row.append(picker, label, up, down, remove);
                list.append(row);
            });
            if (!colors.length) {
                const empty = document.createElement('p');
                empty.className = 'entity-empty-state';
                empty.textContent = 'Sin colores configurados.';
                list.append(empty);
            }
            block.append(heading, list);
            section.append(block);
        });
        container.replaceChildren(section);
        if (scroller) scroller.scrollTop = scrollTop;
        if (focusId) {
            const target = container.querySelector(`[data-color-id="${focusId}"] input[type="text"]`);
            try { target?.focus({ preventScroll: true }); } catch { target?.focus(); }
            if (scroller) scroller.scrollTop = scrollTop;
        }
    };

    const handleInput = (event) => {
        const input = event.target.closest?.('[data-color-field]');
        const row = input?.closest('[data-color-id]');
        const group = input?.closest('[data-color-group]')?.dataset.colorGroup;
        if (!input || !row || !group) return;
        state.updateDressColor(group, row.dataset.colorId, { [input.dataset.colorField]: input.value });
    };

    const handleClick = (event) => {
        const control = event.target.closest?.('[data-color-action]');
        if (!control || !container.contains(control)) return;
        const group = control.closest('[data-color-group]')?.dataset.colorGroup;
        const id = control.closest('[data-color-id]')?.dataset.colorId;
        if (control.dataset.colorAction === 'add') {
            const result = state.addDressColor(group);
            if (result.ok) { snapshot = state.getSnapshot(); render(result.entity.id); }
        } else if (control.dataset.colorAction === 'delete') state.removeDressColor(group, id);
        else state.moveDressColor(group, id, control.dataset.colorAction);
    };

    container.addEventListener('input', handleInput);
    container.addEventListener('change', handleInput);
    container.addEventListener('click', handleClick);
    render();
    const unsubscribe = state.subscribe((payload) => {
        if (payload.reason !== 'entities-changed' || payload.details.collection !== 'dressCodeColors') return;
        snapshot = payload.snapshot;
        if (payload.details.operation !== 'update') render();
    }, { source: 'dress-code-editor' });
    return () => {
        unsubscribe();
        container.removeEventListener('input', handleInput);
        container.removeEventListener('change', handleInput);
        container.removeEventListener('click', handleClick);
    };
}
