import { entityHasContent, getRenderableLocations } from './logistics-schema.js?v=phase3-logistics-20260813';
import { buildGoogleCalendarUrl, safeUrlForField } from './safe-url.js?v=phase3-logistics-20260813';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const source = (asset) => clean(asset?.previewUrl || asset?.downloadUrl);

function node(documentRoot, tag, className = '', value = '') {
    const element = documentRoot.createElement(tag);
    if (className) element.className = className;
    if (value) element.textContent = clean(value);
    return element;
}

function action(documentRoot, label, url, type, field = 'url') {
    const result = safeUrlForField(url, field, type);
    const element = node(documentRoot, result.ok && result.value ? 'a' : 'button', 'tropical-button', label);
    element.dataset.builderAction = type;
    if (result.ok && result.value) element.href = result.value;
    else element.disabled = true;
    return element;
}

function renderLocations(documentRoot, draft) {
    const root = documentRoot.querySelector('[data-prestige-feature~="multiple-locations"]');
    if (!root) return;
    const locations = getRenderableLocations(draft).filter(entityHasContent);
    if (!locations.length) return;
    const copy = draft.content?.location ?? {};
    const content = root.querySelector('.location-copy');
    if (!content) return;
    const visual = root.querySelector('.location-visual');
    content.replaceChildren();
    content.append(node(documentRoot, 'p', 'section-no', '03 · DESTINO'));
    content.append(node(documentRoot, 'h2', '', copy.title || 'Lugares del evento'));
    if (copy.intro) content.append(node(documentRoot, 'p', '', copy.intro));
    const stops = node(documentRoot, 'div', 'location-stops');
    locations.forEach((location) => {
        const item = node(documentRoot, 'p');
        item.append(node(documentRoot, 'strong', '', location.venueName || location.title || 'Ubicación'));
        const details = [location.time, location.address, [location.city, location.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
        if (details) item.append(documentRoot.createElement('br'), documentRoot.createTextNode(details));
        stops.append(item);
    });
    content.append(stops);
    const actions = node(documentRoot, 'div', 'action-row');
    locations.forEach((location) => {
        if (location.mapsUrl) actions.append(action(documentRoot, locations.length > 1 ? `Maps · ${location.venueName || location.title || 'Lugar'}` : 'Cómo llegar', location.mapsUrl, 'maps', 'mapsUrl'));
        if (location.wazeUrl) actions.append(action(documentRoot, 'Waze', location.wazeUrl, 'waze', 'wazeUrl'));
    });
    if (actions.children.length) content.append(actions);
    visual?.removeAttribute('hidden');
}

function renderItinerary(documentRoot, draft) {
    const root = documentRoot.querySelector('[data-prestige-feature~="itinerary"]');
    const items = (draft.itinerary ?? []).filter(entityHasContent);
    if (!root || !items.length) return;
    const copy = draft.content?.itinerary ?? {};
    root.querySelector('.section-heading h2')?.replaceChildren(documentRoot.createTextNode(copy.title || 'Island schedule'));
    root.querySelector('.section-heading .builder-aloha-intro')?.remove();
    if (copy.intro) root.querySelector('.section-heading')?.append(node(documentRoot, 'p', 'builder-aloha-intro', copy.intro));
    const list = root.querySelector('ol');
    if (!list) return;
    list.replaceChildren();
    const locations = new Map((draft.locations ?? []).map((location) => [location.id, location]));
    items.forEach((item) => {
        const row = node(documentRoot, 'li');
        row.append(node(documentRoot, 'time', '', item.time || '—'));
        row.append(node(documentRoot, 'span', '', item.title || 'Actividad'));
        const location = locations.get(item.locationId);
        const detail = [location?.venueName || location?.title, item.description || item.notes].filter(Boolean).join(' · ');
        if (detail) row.append(node(documentRoot, 'small', '', detail));
        list.append(row);
    });
}

function renderDressCode(documentRoot, draft) {
    const root = documentRoot.querySelector('[data-prestige-feature~="dress-code"]');
    if (!root) return;
    const content = draft.content?.dressCode ?? {};
    const copy = root.querySelector('.dress-copy');
    if (!copy) return;
    copy.replaceChildren(
        node(documentRoot, 'p', 'section-no', '05 · DRESS CODE'),
        node(documentRoot, 'h2', '', content.name || content.title || 'Tropical, fresh & bright')
    );
    if (content.description) copy.append(node(documentRoot, 'p', '', content.description));
    if (content.note) copy.append(node(documentRoot, 'p', '', content.note));
    const colors = [...(content.recommendedColors ?? []), ...(content.avoidedColors ?? [])];
    if (colors.length) {
        const swatches = node(documentRoot, 'div', 'swatches');
        colors.slice(0, 8).forEach((color) => {
            const swatch = node(documentRoot, 'i');
            swatch.style.background = color.value;
            swatch.title = color.name || color.value;
            swatches.append(swatch);
        });
        copy.append(swatches);
    }
    root.querySelector('figure')?.setAttribute('hidden', 'true');
}

function renderGifts(documentRoot, draft) {
    const root = documentRoot.querySelector('[data-prestige-feature~="gift-registry"]');
    const gifts = (draft.gifts ?? []).filter(entityHasContent);
    if (!root || !gifts.length) return;
    const content = draft.content?.gifts ?? {};
    const copy = root.querySelector(':scope > div:last-child');
    if (!copy) return;
    copy.replaceChildren(
        node(documentRoot, 'p', 'section-no', '06 · CON CARIÑO'),
        node(documentRoot, 'h2', '', content.title || 'Mesa de regalos')
    );
    if (content.description) copy.append(node(documentRoot, 'p', '', content.description));
    const actions = node(documentRoot, 'div', 'action-row');
    gifts.forEach((gift) => {
        if (gift.url) actions.append(action(documentRoot, gift.name || content.ctaLabel || 'Ver opción', gift.url, 'gifts'));
    });
    if (actions.children.length) copy.append(actions);
}

function renderLinks(documentRoot, draft) {
    const links = (draft.links ?? []).filter(entityHasContent);
    const instagram = links.find((link) => link.type === 'instagram' && link.url);
    const calendar = links.find((link) => link.type === 'calendar');
    const social = documentRoot.querySelector('.social-strip');
    const instagramAnchors = [...documentRoot.querySelectorAll('a[data-demo-action="instagram"]')];
    const calendarAnchors = [...documentRoot.querySelectorAll('a[data-demo-action="calendar"]')];
    // Never leave the demo destinations active. They are only restored below
    // when a validated Builder link (or a real calendar URL) is available.
    [...instagramAnchors, ...calendarAnchors].forEach((anchor) => { anchor.hidden = true; });
    const instagramAnchor = social?.querySelector('a[data-demo-action="instagram"]');
    if (instagramAnchor) {
        if (instagram) {
            const result = safeUrlForField(instagram.url, 'url', 'instagram');
            if (result.ok && result.value) {
                instagramAnchor.href = result.value;
                instagramAnchor.dataset.builderAction = 'instagram';
                instagramAnchor.hidden = false;
            } else instagramAnchor.hidden = true;
        } else instagramAnchor.hidden = true;
    }
    if (!calendar) return;
    const location = getRenderableLocations(draft).find(entityHasContent);
    const url = calendar.url || buildGoogleCalendarUrl(draft, location);
    const result = safeUrlForField(url, 'url', 'calendar');
    if (!result.ok || !result.value || !social) return;
    const actionRow = social.querySelector('.action-row') ?? node(documentRoot, 'div', 'action-row');
    if (!actionRow.parentElement) social.append(actionRow);
    const anchor = node(documentRoot, 'a', 'text-action', calendar.label || 'Guardar fecha');
    anchor.href = result.value;
    anchor.dataset.builderAction = 'calendar';
    actionRow.append(anchor);
}

export function applyAlohaPhase3Bindings(documentRoot, draft = {}) {
    if (!documentRoot || !draft.content) return { applied: false };
    renderLocations(documentRoot, draft);
    renderItinerary(documentRoot, draft);
    renderDressCode(documentRoot, draft);
    renderGifts(documentRoot, draft);
    renderLinks(documentRoot, draft);
    return { applied: true, variant: 'aloha' };
}

export function applyAlohaGalleryBinding(documentRoot, draft = {}) {
    const root = documentRoot?.querySelector('[data-prestige-feature~="gallery"]');
    const assets = (draft.media?.gallery ?? []).filter((asset) => source(asset));
    if (!root || !assets.length) return { applied: false };
    const cards = [...root.querySelectorAll('.postcard-card')];
    assets.forEach((asset, index) => {
        const card = cards[index] ?? node(documentRoot, 'div', 'postcard-card photo-frame');
        if (!card.parentElement) root.append(card);
        card.replaceChildren();
        const image = node(documentRoot, 'img');
        image.src = source(asset); image.alt = asset.alt || ''; image.loading = 'lazy';
        image.style.objectPosition = `${asset.focalPoint?.x ?? 50}% ${asset.focalPoint?.y ?? 50}%`;
        card.append(image, node(documentRoot, 'span', '', String(index + 1).padStart(2, '0')));
        if (asset.caption) card.append(node(documentRoot, 'p', '', asset.caption));
        card.hidden = false;
    });
    cards.slice(assets.length).forEach((card) => { card.hidden = true; });
    return { applied: true, count: assets.length };
}
