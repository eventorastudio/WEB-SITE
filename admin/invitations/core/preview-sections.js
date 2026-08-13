function assertPreviewSectionContract(sections, enabledSections) {
    if (!Array.isArray(sections)) throw new TypeError('preview/sections-must-be-array');
    if (!Array.isArray(enabledSections) || enabledSections.some((sectionId) => typeof sectionId !== 'string')) {
        throw new TypeError('preview/enabled-sections-must-be-string-array');
    }
}

export function applyPreviewSectionVisibility(root, sections = [], enabledSections = [], { groups = [], onBindingError } = {}) {
    assertPreviewSectionContract(sections, enabledSections);
    const enabled = new Set(enabledSections);
    const result = { matchedElements: 0, missingBindings: [], invalidBindings: [] };

    sections.forEach((section) => {
        if (!section || typeof section.id !== 'string') {
            throw new TypeError(`preview/invalid-section:${String(section?.id)}`);
        }
        if (!Array.isArray(section.previewSelectors)) {
            throw new TypeError(`preview/invalid-selectors:${section.id}`);
        }

        section.previewSelectors.forEach((selector) => {
            let elements;
            try {
                elements = [...root.querySelectorAll(selector)];
            } catch (error) {
                const failure = { sectionId: section.id, selector, error };
                result.invalidBindings.push(failure);
                onBindingError?.(failure);
                return;
            }

            if (!elements.length) result.missingBindings.push({ sectionId: section.id, selector });
            elements.forEach((element) => {
                const visible = enabled.has(section.id);
                const builderDemoHidden = element.dataset?.builderDemoCopy === 'hidden'
                    || element.dataset?.builderDemoContainer === 'hidden'
                    || element.dataset?.builderEventSpecificDemo === 'hidden';
                element.hidden = !visible || builderDemoHidden;
                if (element.dataset) element.dataset.builderSectionVisibility = visible ? 'visible' : 'hidden';
                else element.setAttribute('data-builder-section-visibility', visible ? 'visible' : 'hidden');
                result.matchedElements += 1;
            });
        });
    });

    groups.forEach((group) => {
        if (!group || typeof group.selector !== 'string' || !Array.isArray(group.anyOf)) {
            throw new TypeError(`preview/invalid-section-group:${String(group?.id)}`);
        }
        let elements;
        try {
            elements = [...root.querySelectorAll(group.selector)];
        } catch (error) {
            const failure = { sectionId: group.id, selector: group.selector, error };
            result.invalidBindings.push(failure);
            onBindingError?.(failure);
            return;
        }
        const visible = group.anyOf.some((sectionId) => enabled.has(sectionId));
        elements.forEach((element) => {
            element.hidden = !visible;
            element.dataset.builderSectionGroupVisibility = visible ? 'visible' : 'hidden';
            result.matchedElements += 1;
        });
    });

    return result;
}
