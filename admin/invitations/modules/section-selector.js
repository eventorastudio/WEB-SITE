import {
    PACKAGE_REGISTRY,
    getSectionsForPackage,
    getSectionById
} from '../core/section-registry.js';

function minimumPackageName(capability) {
    return PACKAGE_REGISTRY.find((item) => item.capabilities.includes(capability))?.name ?? 'No disponible';
}

export function initSectionSelector({ container, summary, state, ui }) {
    if (!container || !state) return () => {};

    const render = ({ draft }) => {
        if (!draft) return;
        const enabled = new Set(draft.enabledSections);
        const availability = getSectionsForPackage(draft.packageId);
        container.replaceChildren();

        availability.forEach((item) => {
            const retained = enabled.has(item.id) && !item.allowed;
            const label = document.createElement('label');
            label.className = 'section-option';
            label.classList.toggle('is-locked', !item.allowed);
            label.classList.toggle('is-retained', retained);

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = enabled.has(item.id);
            input.disabled = !item.allowed;
            input.addEventListener('change', () => {
                const result = state.toggleSection(item.id, input.checked);
                if (!result.ok) {
                    input.checked = false;
                    ui?.showToast?.({ message: 'Esta sección no está disponible en el paquete seleccionado.', type: 'warning' });
                }
            });

            const marker = document.createElement('span');
            marker.className = 'section-option-marker';
            marker.setAttribute('aria-hidden', 'true');

            const copy = document.createElement('span');
            copy.className = 'section-option-copy';
            const title = document.createElement('strong');
            const description = document.createElement('small');
            title.textContent = item.name;
            description.textContent = item.description;
            copy.append(title, description);

            const badge = document.createElement('span');
            badge.className = 'section-option-badge';
            badge.textContent = retained ? 'Conservada' : (item.allowed ? 'Disponible' : minimumPackageName(item.requiredCapability));
            label.append(input, marker, copy, badge);
            container.append(label);
        });

        if (summary) {
            const retainedCount = draft.enabledSections.filter((id) => {
                const item = getSectionById(id);
                return item && !availability.find((candidate) => candidate.id === id)?.allowed;
            }).length;
            summary.textContent = retainedCount
                ? `${draft.enabledSections.length} activas · ${retainedCount} conservada(s) fuera del paquete actual.`
                : `${draft.enabledSections.length} de ${availability.filter((item) => item.allowed).length} secciones disponibles activas.`;
        }
    };

    render(state.getSnapshot());
    return state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'package-changed', 'sections-changed'].includes(reason)) render(snapshot);
    });
}
