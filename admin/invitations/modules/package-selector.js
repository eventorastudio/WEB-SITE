import { PACKAGE_REGISTRY } from '../core/section-registry.js?v=phase2-content-20260813';

export function initPackageSelector({ container, state }) {
    if (!container || !state) return () => {};

    const select = container.querySelector('#builder-package');
    const source = container.querySelector('#builder-package-source');
    const field = select?.closest('.package-field');

    if (select) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Selecciona un paquete';
        placeholder.disabled = true;
        select.replaceChildren(placeholder, ...PACKAGE_REGISTRY.map((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            return option;
        }));
        select.required = true;
        select.addEventListener('change', () => {
            if (select.value) state.setPackage(select.value);
        });
    }

    const render = ({ draft }) => {
        if (!draft) return;
        if (select && select.value !== (draft.packageId ?? '')) select.value = draft.packageId ?? '';
        field?.classList.toggle('is-required', !draft.packageId);
        if (source) {
            source.textContent = draft.meta.packageSource === 'event'
                ? 'Paquete leído del evento.'
                : draft.packageId
                    ? 'Selección local; no se guarda todavía.'
                    : 'Selecciona un paquete para habilitar sus secciones.';
        }
    };

    render(state.getSnapshot());
    return state.subscribe(({ snapshot }) => render(snapshot), { source: 'package-selector' });
}
