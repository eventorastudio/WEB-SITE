import { getThemeById } from '../core/theme-registry.js?v=phase86-appearance-20260820';

export function initAppearanceEditor({ container, state }) {
    if (!container || !state) return () => {};
    let input = null;
    let definition = null;
    const sync = () => {
        if (input) input.value = state.getSnapshot().draft?.appearance?.accentColor || definition?.default || '#000000';
    };
    const render = (snapshot) => {
        container.replaceChildren();
        input = null;
        definition = getThemeById(snapshot.draft?.themeId)?.appearance?.accentColor ?? null;
        const group = document.createElement('section');
        group.className = 'information-group';
        group.innerHTML = '<header><span>IDENTIDAD VISUAL</span><h3>Personaliza con seguridad</h3><p>Solo se modifica el color de acento que la colección ya contempla.</p></header>';
        if (!definition) {
            const empty = document.createElement('p');
            empty.className = 'content-editor-empty';
            empty.textContent = 'Esta colección conserva su apariencia predeterminada.';
            group.append(empty);
        } else {
            const form = document.createElement('form');
            form.className = 'content-fields-grid';
            const field = document.createElement('label');
            field.className = 'field';
            field.innerHTML = '<span>Color de acento</span><small>Se aplica a elementos visuales compartidos por la colección.</small>';
            input = document.createElement('input');
            input.type = 'color';
            input.name = 'accentColor';
            input.addEventListener('input', () => state.setAppearanceAccentColor(input.value));
            field.append(input);
            form.append(field);
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.className = 'media-action';
            reset.textContent = 'Restaurar predeterminado';
            reset.addEventListener('click', () => state.setAppearanceAccentColor(''));
            form.append(reset);
            group.append(form);
        }
        container.append(group);
        sync();
    };
    render(state.getSnapshot());
    const unsubscribe = state.subscribe(({ snapshot, reason }) => {
        if (reason === 'initialized' || reason === 'theme-changed') render(snapshot);
        else if (reason === 'appearance-changed') sync();
    }, { source: 'appearance-editor' });
    return () => unsubscribe();
}
