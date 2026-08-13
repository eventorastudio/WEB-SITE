import { PACKAGE_REGISTRY } from '../core/section-registry.js';

export function initPackageSelector({ container, state }) {
    if (!container || !state) return () => {};

    const select = container.querySelector('#builder-package');
    const source = container.querySelector('#builder-package-source');

    if (select) {
        select.replaceChildren(...PACKAGE_REGISTRY.map((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            return option;
        }));
        select.addEventListener('change', () => state.setPackage(select.value));
    }

    const render = ({ draft }) => {
        if (!draft) return;
        if (select && select.value !== draft.packageId) select.value = draft.packageId;
        if (source) {
            source.textContent = draft.meta.packageSource === 'event'
                ? 'Paquete leído del evento.'
                : 'Selección local de Fase 1; no se guarda todavía.';
        }
    };

    render(state.getSnapshot());
    return state.subscribe(({ snapshot }) => render(snapshot), { source: 'package-selector' });
}
