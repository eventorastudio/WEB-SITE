import { entityHasContent, getRenderableLocations } from './logistics-schema.js?v=phase3-logistics-20260813';
import { buildGoogleCalendarUrl, buildWhatsAppUrl, safeUrlForField } from './safe-url.js?v=phase3-logistics-20260813';
import { createLocationIcon, defaultLocationIconKeys, normalizeLocationIconKey } from './location-icon-registry.js?v=phase113-aloha-location-cards-20260823';

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

function renderAlohaLocationCards(documentRoot, content, locations, accommodations, links, draft, visual, copy) {
    const typeLabels = {
        ceremony: 'Ceremonia',
        reception: 'Recepci\u00f3n',
        party: 'Fiesta',
        session: 'After party',
        accommodation: 'Hospedaje',
        other: 'Otro'
    };
    const placeMedia = new Map((draft.media?.place ?? []).map((asset) => [asset.id, asset]));
    content.replaceChildren();
    content.append(node(documentRoot, 'p', 'section-no', '03 \u00b7 DESTINO'));
    content.append(node(documentRoot, 'h2', '', copy.title || 'Sitios'));
    if (copy.intro) content.append(node(documentRoot, 'p', '', copy.intro));

    if (locations.length) {
        const stops = node(documentRoot, 'div', 'location-stops aloha-location-grid');
        locations.forEach((location) => {
            const card = node(documentRoot, 'article', 'aloha-location-card');
            card.dataset.locationType = location.type || 'other';
            const defaults = defaultLocationIconKeys(location.type);
            const categoryIconKey = Object.hasOwn(location, 'categoryIcon') ? normalizeLocationIconKey(location.categoryIcon) : defaults.categoryIcon;
            const venueIconKey = Object.hasOwn(location, 'venueIcon') ? normalizeLocationIconKey(location.venueIcon) : defaults.venueIcon;
            const category = node(documentRoot, 'p', 'aloha-location-type', typeLabels[location.type] || 'Otro');
            const categoryIcon = createLocationIcon(documentRoot, categoryIconKey, { className: 'aloha-location-icon' });
            if (categoryIcon) category.prepend(categoryIcon);
            card.append(category);
            card.append(node(documentRoot, 'h3', '', location.title || 'Ubicaci\u00f3n'));
            const visual = node(documentRoot, 'div', 'aloha-location-image');
            const imageSource = source(placeMedia.get(location.imageMediaId ?? location.imageId));
            if (imageSource) {
                const image = documentRoot.createElement('img');
                image.src = imageSource;
                image.alt = clean(location.venueName || location.title || 'Foto del lugar');
                image.loading = 'lazy';
                const asset = placeMedia.get(location.imageMediaId ?? location.imageId);
                image.style.objectPosition = `${asset?.focalPoint?.x ?? 50}% ${asset?.focalPoint?.y ?? 50}%`;
                visual.append(image);
                visual.dataset.imageState = 'configured';
            } else {
                visual.append(node(documentRoot, 'span', 'aloha-location-image-fallback', 'ALOHA DESTINATION'));
                visual.dataset.imageState = 'fallback';
            }
            card.append(visual);
            if (location.venueName) {
                const venue = node(documentRoot, 'p', 'aloha-location-venue', location.venueName);
                const venueIcon = createLocationIcon(documentRoot, venueIconKey, { className: 'aloha-location-icon' });
                if (venueIcon) venue.prepend(venueIcon);
                card.append(venue);
            }
            const details = node(documentRoot, 'div', 'aloha-location-details');
            if (location.time) {
                const time = node(documentRoot, 'span', 'aloha-location-meta', location.time);
                const icon = createLocationIcon(documentRoot, 'clock', { className: 'aloha-location-icon' });
                if (icon) time.prepend(icon);
                details.append(time);
            }
            const address = [location.address, [location.city, location.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
            if (address) {
                const addressNode = node(documentRoot, 'span', 'aloha-location-meta', address);
                const icon = createLocationIcon(documentRoot, 'location', { className: 'aloha-location-icon' });
                if (icon) addressNode.prepend(icon);
                details.append(addressNode);
            }
            if (details.children.length) card.append(details);
            const actions = node(documentRoot, 'div', 'aloha-location-actions');
            if (location.mapsUrl) {
                const maps = action(documentRoot, 'Abrir en Maps', location.mapsUrl, 'maps', 'mapsUrl');
                const icon = createLocationIcon(documentRoot, 'location', { className: 'aloha-location-icon' });
                if (icon) maps.prepend(icon);
                actions.append(maps);
            }
            if (location.wazeUrl) actions.append(action(documentRoot, 'Abrir en Waze', location.wazeUrl, 'waze', 'wazeUrl'));
            if (actions.children.length) card.append(actions);
            stops.append(card);
        });
        content.append(stops);
    }

    if (accommodations.length) {
        const feature = node(documentRoot, 'div', 'aloha-accommodation-feature');
        feature.append(node(documentRoot, 'p', 'aloha-accommodation-eyebrow', 'STAY / ALOHA'));
        feature.append(node(documentRoot, 'h3', 'aloha-location-subtitle', 'Hospedaje sugerido'));
        feature.append(node(documentRoot, 'p', 'aloha-accommodation-intro', 'Una recomendación especial para disfrutar la celebración con mayor comodidad.'));
        const stays = node(documentRoot, 'div', `location-stops aloha-location-grid aloha-accommodations${accommodations.length === 1 ? ' aloha-accommodations-single' : ''}`);
        accommodations.forEach((hotel) => {
            const card = node(documentRoot, 'article', 'aloha-location-card aloha-place-card aloha-place-card--hotel');
            const badge = node(documentRoot, 'p', 'aloha-location-type', 'Hospedaje');
            const hotelBadgeIcon = createLocationIcon(documentRoot, 'hotel', { className: 'aloha-location-icon' });
            if (hotelBadgeIcon) badge.prepend(hotelBadgeIcon);
            card.append(badge);
            card.append(node(documentRoot, 'h3', '', hotel.name || 'Hospedaje'));
            const hotelAsset = placeMedia.get(hotel.imageMediaId);
            const media = node(documentRoot, 'div', 'aloha-location-image');
            if (source(hotelAsset)) {
                const image = documentRoot.createElement('img');
                image.src = source(hotelAsset); image.alt = clean(hotel.name || 'Foto del hospedaje'); image.loading = 'lazy';
                image.style.objectPosition = `${hotelAsset.focalPoint?.x ?? 50}% ${hotelAsset.focalPoint?.y ?? 50}%`;
                media.append(image); media.dataset.imageState = 'configured';
            } else { media.append(node(documentRoot, 'span', 'aloha-location-image-fallback', 'ALOHA STAY')); media.dataset.imageState = 'fallback'; }
            card.append(media);
            const venue = node(documentRoot, 'p', 'aloha-location-venue', hotel.name || 'Hospedaje');
            const venueIcon = createLocationIcon(documentRoot, 'hotel', { className: 'aloha-location-icon' });
            if (venueIcon) venue.prepend(venueIcon);
            card.append(venue);
            const details = node(documentRoot, 'div', 'aloha-location-details aloha-stay-details');
            if (hotel.phone) { const phone = node(documentRoot, 'p', 'aloha-location-meta aloha-stay-phone', hotel.phone); const icon = createLocationIcon(documentRoot, 'phone', { className: 'aloha-location-icon' }); if (icon) phone.prepend(icon); details.append(phone); }
            if (hotel.address) { const address = node(documentRoot, 'p', 'aloha-location-meta aloha-stay-address', hotel.address); const icon = createLocationIcon(documentRoot, 'location', { className: 'aloha-location-icon' }); if (icon) address.prepend(icon); details.append(address); }
            if (hotel.description) details.append(node(documentRoot, 'p', 'aloha-stay-description', hotel.description));
            if (hotel.notes) details.append(node(documentRoot, 'p', 'aloha-stay-notes', hotel.notes));
            if (hotel.reservationCode) details.append(node(documentRoot, 'p', 'aloha-stay-code', `C\u00f3digo: ${hotel.reservationCode}`));
            if (details.children.length) card.append(details);
            const actions = node(documentRoot, 'div', 'aloha-location-actions');
            if (hotel.reservationUrl) actions.append(action(documentRoot, 'Reservar', hotel.reservationUrl, 'hotel', 'reservationUrl'));
            if (hotel.mapsUrl) actions.append(action(documentRoot, 'Abrir en Maps', hotel.mapsUrl, 'maps', 'mapsUrl'));
            if (actions.children.length) card.append(actions);
            stays.append(card);
        });
        feature.append(stays);
        content.append(feature);
    }

    const linkActions = node(documentRoot, 'div', 'action-row aloha-logistics-links');
    links.filter((link) => link.type !== 'instagram').forEach((link) => {
        const location = locations[0];
        const url = link.type === 'calendar'
            ? (link.url || buildGoogleCalendarUrl(draft, location))
            : link.type === 'whatsapp' ? buildWhatsAppUrl(link) : link.url;
        const result = safeUrlForField(url, 'url', link.type);
        if (!result.ok || !result.value) return;
        linkActions.append(action(documentRoot, link.label || ({ calendar: 'Guardar fecha', whatsapp: 'WhatsApp' })[link.type] || 'Abrir enlace', result.value, link.type));
    });
    if (linkActions.children.length) content.append(linkActions);
    visual?.removeAttribute('hidden');
}

function renderLocations(documentRoot, draft) {
    const root = documentRoot.querySelector('[data-prestige-feature~="multiple-locations"]');
    if (!root) return;
    const locations = getRenderableLocations(draft).filter(entityHasContent);
    const accommodations = (draft.accommodations ?? []).filter(entityHasContent);
    const links = (draft.links ?? []).filter(entityHasContent);
    if (!locations.length && !accommodations.length && !links.length) return;
    const copy = draft.content?.location ?? {};
    const content = root.querySelector('.location-copy');
    if (!content) return;
    const visual = root.querySelector('.location-visual');
    renderAlohaLocationCards(documentRoot, content, locations, accommodations, links, draft, visual, copy);
    return;
    /* Legacy markup retained below only as a compatibility reference.
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
    if (!locations.length) content.querySelector(':scope > .location-stops')?.remove();
    if (accommodations.length) {
        content.append(node(documentRoot, 'h3', '', 'Hospedaje sugerido'));
        const stays = node(documentRoot, 'div', 'location-stops aloha-accommodations');
        accommodations.forEach((hotel) => {
            const item = node(documentRoot, 'p');
            item.append(node(documentRoot, 'strong', '', hotel.name || 'Hospedaje'));
            const details = [hotel.address, hotel.phone, hotel.reservationCode && `Código: ${hotel.reservationCode}`, hotel.description, hotel.notes].filter(Boolean).join(' · ');
            if (details) item.append(documentRoot.createElement('br'), documentRoot.createTextNode(details));
            const hotelActions = node(documentRoot, 'span', 'action-row');
            if (hotel.reservationUrl) hotelActions.append(action(documentRoot, 'Reservar', hotel.reservationUrl, 'hotel', 'reservationUrl'));
            if (hotel.mapsUrl) hotelActions.append(action(documentRoot, 'Maps', hotel.mapsUrl, 'maps', 'mapsUrl'));
            if (hotelActions.children.length) item.append(documentRoot.createElement('br'), hotelActions);
            stays.append(item);
        });
        content.append(stays);
    }
    const linkActions = node(documentRoot, 'div', 'action-row aloha-logistics-links');
    links.filter((link) => link.type !== 'instagram').forEach((link) => {
        const location = locations[0];
        const url = link.type === 'calendar'
            ? (link.url || buildGoogleCalendarUrl(draft, location))
            : link.type === 'whatsapp' ? buildWhatsAppUrl(link) : link.url;
        const result = safeUrlForField(url, 'url', link.type);
        if (!result.ok || !result.value) return;
        linkActions.append(action(documentRoot, link.label || ({ calendar: 'Guardar fecha', whatsapp: 'WhatsApp' })[link.type] || 'Abrir enlace', result.value, link.type));
    });
    if (linkActions.children.length) content.append(linkActions);
    visual?.removeAttribute('hidden'); */
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
    items.forEach((item, index) => {
        const row = node(documentRoot, 'li');
        row.dataset.itineraryIndex = String(index + 1);
        row.append(node(documentRoot, 'time', '', item.time || '—'));
        row.append(node(documentRoot, 'span', '', item.title || 'Actividad'));
        const location = locations.get(item.locationId);
        const detail = [location?.venueName || location?.title, item.description || item.notes].filter(Boolean).join(' · ');
        if (detail) row.append(node(documentRoot, 'small', '', detail));
        list.append(row);
    });
    bindItineraryCardInteraction(root);
}

function bindItineraryCardInteraction(root) {
    if (!root || root.dataset.alohaItineraryInteraction === 'bound') return;
    const list = root.querySelector('ol');
    if (!list) return;
    root.dataset.alohaItineraryInteraction = 'bound';
    list.addEventListener('click', (event) => {
        const card = event.target.closest?.('li[data-itinerary-index]');
        if (!card || !list.contains(card)) return;
        card.classList.remove('aloha-itinerary-card-tap');
        void card.offsetWidth;
        card.classList.add('aloha-itinerary-card-tap');
        window.setTimeout(() => card.classList.remove('aloha-itinerary-card-tap'), 520);
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
    const appendPalette = (label, colors, variant) => {
        const items = (Array.isArray(colors) ? colors : []).slice(0, 8);
        if (!items.length) return;
        const group = node(documentRoot, 'div', `dress-palette-group dress-palette-${variant}`);
        group.append(node(documentRoot, 'p', 'dress-palette-label', label));
        const swatches = node(documentRoot, 'div', 'swatches');
        items.forEach((color) => {
            const swatch = node(documentRoot, 'i');
            swatch.style.background = color.value;
            swatch.title = color.name || color.value;
            swatch.setAttribute('aria-label', color.name || color.value);
            swatches.append(swatch);
        });
        group.append(swatches);
        copy.append(group);
    };
    appendPalette('Colores recomendados', content.recommendedColors, 'recommended');
    appendPalette('Colores a evitar', content.avoidedColors, 'avoided');

    const figure = root.querySelector('figure');
    const image = figure?.querySelector('img');
    const dressCodeAsset = draft.media?.dressCode;
    const imageSource = source(dressCodeAsset);
    root.dataset.dressCodeImage = imageSource ? 'configured' : 'empty';
    if (figure && image) {
        if (imageSource) {
            image.src = imageSource;
            image.alt = clean(dressCodeAsset.alt || 'Inspiración de vestimenta');
            image.style.objectPosition = `${dressCodeAsset.focalPoint?.x ?? 50}% ${dressCodeAsset.focalPoint?.y ?? 50}%`;
            figure.hidden = false;
        } else {
            figure.hidden = true;
            image.removeAttribute('src');
        }
    }
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
    const grid = documentRoot.createElement('div');
    grid.className = 'builder-phase4-gallery builder-phase4-gallery-aloha';
    grid.dataset.builderPhase4 = 'gallery';
    [...assets].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).forEach((asset, index) => {
        const figure = documentRoot.createElement('figure');
        figure.className = 'builder-phase4-gallery-item';
        figure.dataset.mediaId = asset.id;
        const frame = documentRoot.createElement('div');
        frame.className = 'builder-phase4-gallery-image-frame';
        const width = Number(asset.width) || 0;
        const height = Number(asset.height) || 0;
        frame.dataset.galleryOrientation = width && height
            ? (width / height > 1.15 ? 'landscape' : height / width > 1.15 ? 'portrait' : 'square')
            : 'square';
        const image = documentRoot.createElement('img');
        image.src = source(asset);
        image.alt = asset.alt || '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.style.objectPosition = `${asset.focalPoint?.x ?? 50}% ${asset.focalPoint?.y ?? 50}%`;
        frame.append(image);
        figure.append(frame);
        if (asset.caption) figure.append(node(documentRoot, 'figcaption', '', asset.caption));
        grid.append(figure);
    });
    root.replaceChildren(grid);
    return { applied: true, count: assets.length };
}
