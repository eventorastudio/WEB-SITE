import { getThemeById } from '../core/theme-registry.js?v=phase86-appearance-20260820';
import { DEVICE_CATEGORIES, DEVICE_LABELS, normalizeDeviceAvailability } from '../core/device-availability.js?v=phase168-device-availability-20260825';

export function initAppearanceEditor({ container, state }) {
    if (!container || !state) return () => {};
    let input = null;
    let definition = null;
    const deviceInputs = new Map();
    let deviceFeedback = null;
    const sync = () => {
        if (input) input.value = state.getSnapshot().draft?.appearance?.accentColor || definition?.default || '#000000';
        const availability = normalizeDeviceAvailability(state.getSnapshot().draft?.settings?.deviceAvailability);
        deviceInputs.forEach((control, device) => { control.checked = availability[device]; });
    };
    const renderDeviceSettings = (container) => {
        const group = document.createElement('section');
        group.className = 'information-group';
        group.innerHTML = '<header><span>ACCESO PÚBLICO</span><h3>Dispositivos permitidos</h3><p>Elige desde qué dispositivos podrán abrir tu invitación.</p></header>';
        const form = document.createElement('form');
        form.className = 'content-fields-grid';
        DEVICE_CATEGORIES.forEach((device) => {
            const row = document.createElement('label');
            row.className = 'field-toggle-row';
            const control = document.createElement('input');
            control.type = 'checkbox';
            control.checked = true;
            control.addEventListener('change', () => {
                const result = state.setDeviceAvailability(device, control.checked);
                if (!result.ok) {
                    control.checked = true;
                    if (deviceFeedback) deviceFeedback.textContent = 'Debes mantener al menos un dispositivo activo.';
                    return;
                }
                if (deviceFeedback) deviceFeedback.textContent = '';
            });
            const text = document.createElement('strong');
            text.textContent = DEVICE_LABELS[device];
            row.append(control, text);
            form.append(row);
            deviceInputs.set(device, control);
        });
        deviceFeedback = document.createElement('small');
        deviceFeedback.className = 'field-help';
        deviceFeedback.setAttribute('aria-live', 'polite');
        form.append(deviceFeedback);
        group.append(form);
        container.append(group);
    };
    const render = (snapshot) => {
        container.replaceChildren();
        input = null;
        deviceInputs.clear();
        deviceFeedback = null;
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
        renderDeviceSettings(container);
        sync();
    };
    render(state.getSnapshot());
    const unsubscribe = state.subscribe(({ snapshot, reason }) => {
        if (reason === 'initialized' || reason === 'theme-changed') render(snapshot);
        else if (reason === 'appearance-changed' || reason === 'settings-changed') sync();
    }, { source: 'appearance-editor' });
    return () => unsubscribe();
}
