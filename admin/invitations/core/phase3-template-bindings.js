import {
    entityHasContent,
    getCollectionMode,
    getRenderableLocations,
    giftTypeLabel,
    linkTypeLabel,
    locationTypeLabel
} from './logistics-schema.js?v=phase3-logistics-20260813';
import { buildGoogleCalendarUrl, buildWhatsAppUrl, safeUrlForField } from './safe-url.js?v=phase3-logistics-20260813';
import { applyAlohaPhase3Bindings } from './aloha-template-bindings.js?v=phase126-accommodation-icons-place-library-20260824';

function clean(value, maxLength = 1800) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function node(documentRoot, tag, className = '', value = '') {
    const element = documentRoot.createElement(tag);
    if (className) element.className = className;
    if (value) element.textContent = clean(value);
    return element;
}

function meaningful(items = []) {
    return items.filter(entityHasContent);
}

function getRoot(documentRoot, selector) {
    try { return documentRoot.querySelector(selector); } catch { return null; }
}

function updateFeatureToken(element, feature, enabled) {
    if (!element?.dataset) return;
    const features = new Set(clean(element.dataset.prestigeFeature).split(' ').filter(Boolean));
    if (enabled) features.add(feature);
    else features.delete(feature);
    if (features.size) element.dataset.prestigeFeature = [...features].join(' ');
    else element.removeAttribute('data-prestige-feature');
}

function resolveFeatureRoot(documentRoot, feature, { create = false } = {}) {
    const candidate = getRoot(documentRoot, `[data-prestige-feature~="${feature}"]`);
    if (candidate && !candidate.matches?.('a,button')) return candidate;
    if (candidate) {
        const container = candidate.closest('section,article') ?? candidate.parentElement;
        if (container) {
            updateFeatureToken(container, feature, true);
            updateFeatureToken(candidate, feature, false);
            return container;
        }
        return candidate;
    }
    if (!create || !documentRoot?.body) return null;

    const section = documentRoot.createElement('section');
    section.className = 'builder-generated-feature builder-generated-gift-registry';
    section.dataset.prestigeFeature = feature;
    const insertionPoint = getRoot(documentRoot, '[data-prestige-feature~="rsvp"], footer');
    if (insertionPoint) insertionPoint.before(section);
    else documentRoot.body.append(section);
    return section;
}

function prepareRoot(root, sectionId, variant) {
    root.hidden = false;
    delete root.dataset.builderSectionVisibility;
    delete root.dataset.builderPhase3Demo;
    delete root.dataset.builderDemoCopy;
    delete root.dataset.builderDemoContainer;
    delete root.dataset.builderEventSpecificDemo;
    root.querySelector(':scope > [data-builder-phase3-section]')?.remove();
    [...root.children].forEach((child) => {
        if (child.dataset.builderPhase3Section) return;
        child.hidden = true;
        child.dataset.builderPhase3Demo = 'hidden';
    });
    const wrapper = node(root.ownerDocument, 'div', `builder-phase3 builder-phase3-${variant}`);
    wrapper.dataset.builderPhase3Section = sectionId;
    root.prepend(wrapper);
    root.dataset.builderContentState = 'configured';
    return wrapper;
}

function markCleared(root) {
    root.querySelector(':scope > [data-builder-phase3-section]')?.remove();
    root.dataset.builderContentState = 'cleared';
}

function heading(wrapper, eyebrow, title, body = '') {
    const documentRoot = wrapper.ownerDocument;
    const copy = node(documentRoot, 'header', 'builder-phase3-heading');
    if (eyebrow) copy.append(node(documentRoot, 'span', 'builder-phase3-eyebrow', eyebrow));
    if (title) copy.append(node(documentRoot, 'h2', '', title));
    if (body) copy.append(node(documentRoot, 'p', '', body));
    wrapper.append(copy);
}

function detail(documentRoot, label, value) {
    const cleanValue = clean(value);
    if (!cleanValue) return null;
    const row = node(documentRoot, 'p', 'builder-phase3-detail');
    row.append(node(documentRoot, 'strong', '', label), documentRoot.createTextNode(cleanValue));
    return row;
}

function action(documentRoot, label, rawUrl, actionType, field = 'url', linkType = 'custom') {
    const parsed = safeUrlForField(rawUrl, field, linkType);
    const control = node(documentRoot, parsed.ok && parsed.value ? 'a' : 'button', 'builder-phase3-action', label);
    control.dataset.builderAction = actionType;
    if (parsed.ok && parsed.value) control.setAttribute('href', parsed.value);
    else {
        control.setAttribute('type', 'button');
        control.disabled = true;
        control.dataset.builderInvalidUrl = rawUrl ? 'true' : 'empty';
    }
    return control;
}

function hideOriginalActions(documentRoot, actionTypes) {
    actionTypes.forEach((actionType) => {
        documentRoot.querySelectorAll(`[data-demo-action="${actionType}"]`).forEach((element) => {
            if (element.closest('[data-builder-phase3-section]')) return;
            element.hidden = true;
            element.dataset.builderPhase3Demo = 'hidden';
        });
    });
}

function renderLocations(documentRoot, draft, variant) {
    const root = getRoot(documentRoot, '[data-prestige-feature~="multiple-locations"]');
    if (!root) return;
    const locationMode = getCollectionMode(draft, 'locations');
    const accommodationMode = getCollectionMode(draft, 'accommodations');
    const linkMode = getCollectionMode(draft, 'links');
    const locationCopyTouched = (draft.meta?.touchedPaths ?? []).some((path) => path.startsWith('content.location.'));
    const sourceLocations = meaningful(getRenderableLocations(draft));
    const accommodations = meaningful(draft.accommodations);
    const links = meaningful(draft.links);
    const copy = draft.content?.location ?? {};
    const copyHasValue = [copy.title, copy.intro].some((value) => Boolean(clean(value)));
    const configured = sourceLocations.length || accommodations.length || links.length || copyHasValue;
    const groupTouched = [locationMode, accommodationMode, linkMode].some((mode) => mode !== 'untouched') || locationCopyTouched;
    if (!groupTouched && !configured) return;
    if (!configured) { markCleared(root); return; }

    const wrapper = prepareRoot(root, 'location', variant);
    heading(wrapper, 'Ubicaciones', copy.title || 'Lugares del evento', copy.intro);
    const locationList = node(documentRoot, 'div', 'builder-phase3-grid builder-phase3-locations');
    sourceLocations.forEach((location) => {
        const card = node(documentRoot, 'article', 'builder-phase3-card builder-location-card');
        card.dataset.entityId = location.id;
        card.append(node(documentRoot, 'span', 'builder-phase3-card-label', locationTypeLabel(location.type)));
        if (location.title) card.append(node(documentRoot, 'h3', '', location.title));
        if (location.venueName) card.append(node(documentRoot, 'strong', 'builder-phase3-venue', location.venueName));
        const meta = [location.time, location.address, [location.city, location.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
        if (meta) card.append(node(documentRoot, 'p', 'builder-phase3-meta', meta));
        if (location.description) card.append(node(documentRoot, 'p', '', location.description));
        if (location.notes) card.append(node(documentRoot, 'p', 'builder-phase3-note', location.notes));
        const actions = node(documentRoot, 'div', 'builder-phase3-actions');
        if (location.mapsUrl) actions.append(action(documentRoot, 'Maps', location.mapsUrl, 'maps', 'mapsUrl'));
        if (location.wazeUrl) actions.append(action(documentRoot, 'Waze', location.wazeUrl, 'waze', 'wazeUrl'));
        if (actions.children.length) card.append(actions);
        locationList.append(card);
    });
    if (locationList.children.length) wrapper.append(locationList);

    if (accommodations.length) {
        const block = node(documentRoot, 'section', 'builder-phase3-subsection builder-phase3-accommodations');
        block.append(node(documentRoot, 'h3', '', 'Hospedaje sugerido'));
        accommodations.forEach((hotel) => {
            const card = node(documentRoot, 'article', 'builder-phase3-card');
            if (hotel.name) card.append(node(documentRoot, 'h4', '', hotel.name));
            [detail(documentRoot, 'Dirección · ', hotel.address), detail(documentRoot, 'Teléfono · ', hotel.phone), detail(documentRoot, 'Código · ', hotel.reservationCode)]
                .filter(Boolean).forEach((item) => card.append(item));
            if (hotel.description) card.append(node(documentRoot, 'p', '', hotel.description));
            if (hotel.notes) card.append(node(documentRoot, 'p', 'builder-phase3-note', hotel.notes));
            const actions = node(documentRoot, 'div', 'builder-phase3-actions');
            if (hotel.reservationUrl) actions.append(action(documentRoot, 'Reservar', hotel.reservationUrl, 'hotel', 'reservationUrl'));
            if (hotel.mapsUrl) actions.append(action(documentRoot, 'Maps', hotel.mapsUrl, 'maps', 'mapsUrl'));
            if (actions.children.length) card.append(actions);
            block.append(card);
        });
        wrapper.append(block);
        hideOriginalActions(documentRoot, ['hotel']);
    }

    if (links.length) {
        const block = node(documentRoot, 'section', 'builder-phase3-subsection builder-phase3-links');
        block.append(node(documentRoot, 'h3', '', 'Enlaces útiles'));
        const actions = node(documentRoot, 'div', 'builder-phase3-actions');
        links.forEach((link) => {
            const label = link.label || linkTypeLabel(link.type);
            let url = link.url;
            if (link.type === 'calendar') url = buildGoogleCalendarUrl(draft, sourceLocations[0]);
            if (link.type === 'whatsapp') url = buildWhatsAppUrl(link);
            const control = action(documentRoot, label, url, link.type, 'url', link.type);
            if (link.description) control.setAttribute('aria-description', clean(link.description, 800));
            actions.append(control);
        });
        block.append(actions);
        wrapper.append(block);
        hideOriginalActions(documentRoot, links.map(({ type }) => type === 'whatsapp' ? 'rsvp' : type));
    }
    if (sourceLocations.length) hideOriginalActions(documentRoot, ['maps']);
}

function renderItinerary(documentRoot, draft, variant) {
    const root = getRoot(documentRoot, '[data-prestige-feature~="itinerary"]');
    if (!root) return;
    const mode = getCollectionMode(draft, 'itinerary');
    if (mode === 'untouched') return;
    const items = meaningful(draft.itinerary);
    if (!items.length) { markCleared(root); return; }
    const wrapper = prepareRoot(root, 'itinerary', variant);
    const copy = draft.content?.itinerary ?? {};
    heading(wrapper, 'Itinerario', copy.title || 'Agenda del evento', copy.intro);
    const locations = new Map((draft.locations ?? []).map((location) => [location.id, location]));
    const list = node(documentRoot, 'ol', 'builder-phase3-timeline');
    items.forEach((item) => {
        const row = node(documentRoot, 'li', 'builder-phase3-timeline-item');
        row.dataset.entityId = item.id;
        row.append(node(documentRoot, 'time', '', item.time || '—'), node(documentRoot, 'h3', '', item.title || 'Actividad'));
        const location = locations.get(item.locationId);
        if (location) row.append(node(documentRoot, 'span', 'builder-phase3-meta', location.venueName || location.title));
        if (item.description) row.append(node(documentRoot, 'p', '', item.description));
        if (item.notes) row.append(node(documentRoot, 'p', 'builder-phase3-note', item.notes));
        list.append(row);
    });
    wrapper.append(list);
}

function renderDressCode(documentRoot, draft, variant) {
    const root = getRoot(documentRoot, '[data-prestige-feature~="dress-code"]');
    if (!root) return;
    const touched = (draft.meta?.touchedCollections ?? []).includes('dressCodeColors');
    if (!touched) return;
    const content = draft.content?.dressCode ?? {};
    const recommended = content.recommendedColors ?? [];
    const avoided = content.avoidedColors ?? [];
    const hasCopy = [content.title, content.name, content.description, content.note].some((value) => Boolean(clean(value)));
    if (!hasCopy && !recommended.length && !avoided.length) { markCleared(root); return; }
    const wrapper = prepareRoot(root, 'dress-code', variant);
    heading(wrapper, content.title || 'Código de vestimenta', content.name || '', content.description);
    if (content.note) wrapper.append(node(documentRoot, 'p', 'builder-phase3-note', content.note));
    [['Recomendados', recommended], ['Evitar', avoided]].forEach(([label, colors]) => {
        if (!colors.length) return;
        const palette = node(documentRoot, 'div', 'builder-phase3-palette');
        palette.append(node(documentRoot, 'strong', '', label));
        colors.forEach((color) => {
            const swatch = node(documentRoot, 'span', 'builder-phase3-swatch');
            swatch.style.setProperty('--builder-swatch', color.value);
            swatch.append(node(documentRoot, 'i'), node(documentRoot, 'small', '', color.name || color.value));
            palette.append(swatch);
        });
        wrapper.append(palette);
    });
}

function renderGifts(documentRoot, draft, variant) {
    const mode = getCollectionMode(draft, 'gifts');
    const root = resolveFeatureRoot(documentRoot, 'gift-registry', { create: mode !== 'untouched' });
    if (!root) return;
    if (mode === 'untouched') return;
    const gifts = meaningful(draft.gifts);
    if (!gifts.length) { markCleared(root); return; }
    const wrapper = prepareRoot(root, 'gift-registry', variant);
    const copy = draft.content?.gifts ?? {};
    heading(wrapper, 'Mesa de regalos', copy.title || 'Opciones de regalo', copy.description);
    const grid = node(documentRoot, 'div', 'builder-phase3-grid builder-phase3-gifts');
    gifts.forEach((gift) => {
        const card = node(documentRoot, 'article', 'builder-phase3-card');
        card.dataset.entityId = gift.id;
        card.append(node(documentRoot, 'span', 'builder-phase3-card-label', giftTypeLabel(gift.type)));
        if (gift.name) card.append(node(documentRoot, 'h3', '', gift.name));
        if (gift.description) card.append(node(documentRoot, 'p', '', gift.description));
        if (gift.reference) card.append(detail(documentRoot, 'Referencia · ', gift.reference));
        const details = gift.details ?? {};
        [
            ['Banco · ', details.bank], ['Beneficiario · ', details.beneficiary], ['Cuenta · ', details.account],
            ['CLABE · ', details.clabe], ['Concepto · ', details.concept], ['Instrucciones · ', details.instructions]
        ].map(([label, value]) => detail(documentRoot, label, value)).filter(Boolean).forEach((item) => card.append(item));
        if (gift.url) card.append(action(documentRoot, copy.ctaLabel || 'Ver opción', gift.url, 'gifts'));
        grid.append(card);
    });
    wrapper.append(grid);
    hideOriginalActions(documentRoot, ['gifts']);
}

export function applyPhase3TemplateBindings(documentRoot, adapter, draft = {}) {
    if (!documentRoot || !draft.content) return { applied: false };
    const variant = adapter?.phase3Variant ?? adapter?.themeId ?? 'custom';
    documentRoot.body.dataset.builderTheme = variant;
    if (variant === 'aloha') return applyAlohaPhase3Bindings(documentRoot, draft);
    renderLocations(documentRoot, draft, variant);
    renderItinerary(documentRoot, draft, variant);
    renderDressCode(documentRoot, draft, variant);
    renderGifts(documentRoot, draft, variant);
    return { applied: true, variant };
}
