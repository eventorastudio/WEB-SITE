import {
    PACKAGE_REGISTRY,
    getSectionsForPackage,
    getSectionById
} from '../core/section-registry.js?v=phase3-logistics-20260813';

function minimumPackageName(capability) {
    return PACKAGE_REGISTRY.find((item) => item.capabilities.includes(capability))?.name ?? 'No disponible';
}

export function initSectionSelector({ container, summary, state, ui, onError, onTrace }) {
    if (!container || !state) return () => {};

    let disposed = false;
    let renderQueued = false;
    let queuedSnapshot = null;

    const render = ({ draft }) => {
        if (!draft) return;
        const enabled = new Set(draft.enabledSections);
        const availability = getSectionsForPackage(draft.packageId);
        const fragment = document.createDocumentFragment();

        availability.forEach((item) => {
            if (typeof item.id !== 'string' || !getSectionById(item.id)) {
                throw new TypeError(`builder/section-card-without-registry-entry:${String(item.id)}`);
            }
            const retained = enabled.has(item.id) && !item.allowed;
            const label = document.createElement('label');
            label.className = 'section-option';
            label.dataset.sectionId = item.id;
            label.classList.toggle('is-locked', !item.allowed);
            label.classList.toggle('is-retained', retained);

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.sectionId = item.id;
            input.checked = enabled.has(item.id);
            input.disabled = !item.allowed;

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
            badge.textContent = !draft.packageId
                ? 'Elige paquete'
                : retained
                    ? 'Conservada'
                    : (item.allowed ? 'Disponible' : minimumPackageName(item.requiredCapability));
            label.append(input, marker, copy, badge);
            fragment.append(label);
        });

        // El DOM anterior permanece intacto hasta que todas las cards son válidas.
        container.replaceChildren(fragment);
        onTrace?.('section-render-committed', {
            sectionCards: availability.length,
            enabledSections: [...draft.enabledSections]
        });

        if (summary) {
            const retainedCount = draft.enabledSections.filter((id) => {
                const item = getSectionById(id);
                return item && !availability.find((candidate) => candidate.id === id)?.allowed;
            }).length;
            summary.textContent = !draft.packageId
                ? 'Selecciona el paquete de la invitación para habilitar sus secciones.'
                : retainedCount
                    ? `${draft.enabledSections.length} activas · ${retainedCount} conservada(s) fuera del paquete actual.`
                    : `${draft.enabledSections.length} de ${availability.filter((item) => item.allowed).length} secciones disponibles activas.`;
        }
    };

    const handleChange = (event) => {
        const input = event.target.closest?.('input[type="checkbox"][data-section-id]');
        if (!input || !container.contains(input)) return;

        const sectionId = input.dataset.sectionId;
        const section = getSectionById(sectionId);
        if (!section) {
            input.checked = false;
            throw new TypeError(`builder/section-card-without-registry-entry:${String(sectionId)}`);
        }

        onTrace?.('section-change-before', { sectionId, checked: input.checked, targetConnected: input.isConnected });
        const result = state.toggleSection(sectionId, input.checked);
        onTrace?.('section-change-after-state', {
            sectionId,
            checked: input.checked,
            result,
            targetConnected: input.isConnected
        });
        if (!result.ok) {
            input.checked = state.getSnapshot().draft.enabledSections.includes(sectionId);
            ui?.showToast?.({ message: 'Esta sección no está disponible en el paquete seleccionado.', type: 'warning' });
        }
    };

    const queueRender = (snapshot) => {
        queuedSnapshot = snapshot;
        if (renderQueued) return;
        renderQueued = true;
        queueMicrotask(() => {
            renderQueued = false;
            if (disposed || !queuedSnapshot) return;
            const nextSnapshot = queuedSnapshot;
            queuedSnapshot = null;
            try {
                render(nextSnapshot);
            } catch (error) {
                if (typeof onError === 'function') {
                    onError(error, {
                        source: 'section-selector',
                        reason: 'sections-changed',
                        retry: () => render(nextSnapshot)
                    });
                } else {
                    console.error('[InvitationBuilder] Falló el render diferido del selector de secciones.', error);
                }
            }
        });
    };

    container.addEventListener('change', handleChange);
    render(state.getSnapshot());
    const unsubscribe = state.subscribe(({ snapshot, reason }) => {
        if (reason === 'sections-changed') queueRender(snapshot);
        else if (['initialized', 'package-changed'].includes(reason)) render(snapshot);
    }, { source: 'section-selector' });

    return () => {
        disposed = true;
        unsubscribe();
        container.removeEventListener('change', handleChange);
    };
}
