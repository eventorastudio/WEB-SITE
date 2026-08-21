import { INVITATION_FORMATS, PACKAGE_REGISTRY } from '../core/section-registry.js?v=phase93-package-sections-format-20260821';

export function initPackageSelector({ container, state }) {
    if (!container || !state) return () => {};

    const select = container.querySelector('#builder-package');
    const source = container.querySelector('#builder-package-source');
    const field = select?.closest('.package-field');
    const format = container.querySelector('#builder-format');
    const formatStatus = container.querySelector('#builder-format-status');
    const capabilities = container.querySelector('#package-capabilities');

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

    if (format) {
        format.replaceChildren(...INVITATION_FORMATS.map((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.id === 'website' ? item.name : `${item.name} · Próximamente`;
            option.disabled = item.id !== 'website';
            return option;
        }));
        format.addEventListener('change', () => {
            if (format.value !== 'website') return;
            state.setFormat(format.value);
        });
    }

    const render = ({ draft }) => {
        if (!draft) return;
        if (select && select.value !== (draft.packageId ?? '')) select.value = draft.packageId ?? '';
        if (format && format.value !== (draft.settings?.format ?? 'website')) format.value = draft.settings?.format ?? 'website';
        if (formatStatus) {
            formatStatus.textContent = draft.settings?.format && draft.settings.format !== 'website'
                ? 'Este formato estÃ¡ conservado en el draft, pero aÃºn no estÃ¡ disponible para nuevas selecciones.'
                : 'Formato disponible';
        }
        field?.classList.toggle('is-required', !draft.packageId);
        if (source) {
            source.textContent = draft.meta.packageSource === 'event'
                ? 'Paquete leído del evento.'
                : draft.packageId
                    ? 'Selección local; no se guarda todavía.'
                    : 'Selecciona un paquete para habilitar sus secciones.';
        }
        if (capabilities) {
            const selected = PACKAGE_REGISTRY.find((item) => item.id === draft.packageId);
            capabilities.replaceChildren();
            if (selected) {
                selected.commercialFeatures.forEach((feature) => {
                    const item = document.createElement('li');
                    item.textContent = feature;
                    capabilities.append(item);
                });
            }
        }
    };

    render(state.getSnapshot());
    return state.subscribe(({ snapshot }) => render(snapshot), { source: 'package-selector' });
}
