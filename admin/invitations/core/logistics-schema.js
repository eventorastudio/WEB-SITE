import { getPackageById } from './section-registry.js?v=phase3-logistics-20260813';

export const LOCATION_TYPES = Object.freeze(['ceremony', 'reception', 'party', 'session', 'accommodation', 'other']);
export const GIFT_TYPES = Object.freeze(['store', 'transfer', 'cash', 'other']);
export const LINK_TYPES = Object.freeze(['whatsapp', 'instagram', 'calendar', 'transport', 'contact', 'custom']);
export const DRESS_COLOR_GROUPS = Object.freeze(['recommendedColors', 'avoidedColors']);

export const ENTITY_COLLECTIONS = Object.freeze({
    locations: Object.freeze({ prefix: 'LOC', sequence: 'location' }),
    itinerary: Object.freeze({ prefix: 'ACT', sequence: 'itinerary' }),
    gifts: Object.freeze({ prefix: 'GFT', sequence: 'gift' }),
    accommodations: Object.freeze({ prefix: 'HOT', sequence: 'accommodation' }),
    links: Object.freeze({ prefix: 'LNK', sequence: 'link' }),
    dressCodeColors: Object.freeze({ prefix: 'CLR', sequence: 'dressColor' })
});

const TEXT_LIMITS = Object.freeze({
    type: 32,
    title: 140,
    venueName: 160,
    address: 300,
    city: 100,
    state: 100,
    time: 5,
    mapsUrl: 2048,
    wazeUrl: 2048,
    description: 800,
    notes: 600,
    name: 160,
    url: 2048,
    reference: 180,
    phone: 32,
    reservationUrl: 2048,
    reservationCode: 120,
    label: 120,
    message: 1000,
    value: 7,
    bank: 120,
    beneficiary: 160,
    account: 120,
    clabe: 40,
    concept: 180,
    instructions: 800
});

function text(value, field = 'description') {
    return String(value ?? '').slice(0, TEXT_LIMITS[field] ?? 800);
}

function oneOf(value, options, fallback) {
    return options.includes(value) ? value : fallback;
}

export function createEntityId(prefix, sequence) {
    return `${prefix}-LOCAL-${String(sequence).padStart(3, '0')}`;
}

export function createLocation(id, seed = {}) {
    return {
        id,
        type: oneOf(seed.type, LOCATION_TYPES, 'other'),
        title: text(seed.title, 'title'),
        venueName: text(seed.venueName ?? seed.name, 'venueName'),
        address: text(seed.address, 'address'),
        city: text(seed.city, 'city'),
        state: text(seed.state, 'state'),
        time: text(seed.time, 'time'),
        mapsUrl: text(seed.mapsUrl, 'mapsUrl'),
        wazeUrl: text(seed.wazeUrl, 'wazeUrl'),
        description: text(seed.description, 'description'),
        notes: text(seed.notes, 'notes')
    };
}

export function createItineraryItem(id, seed = {}) {
    return {
        id,
        time: text(seed.time, 'time'),
        title: text(seed.title, 'title'),
        locationId: text(seed.locationId, 'reference'),
        description: text(seed.description, 'description'),
        notes: text(seed.notes, 'notes')
    };
}

export function createGift(id, seed = {}) {
    const details = seed.details ?? {};
    return {
        id,
        type: oneOf(seed.type, GIFT_TYPES, 'store'),
        name: text(seed.name, 'name'),
        url: text(seed.url, 'url'),
        reference: text(seed.reference, 'reference'),
        description: text(seed.description, 'description'),
        details: {
            bank: text(details.bank, 'bank'),
            beneficiary: text(details.beneficiary, 'beneficiary'),
            account: text(details.account, 'account'),
            clabe: text(details.clabe, 'clabe'),
            concept: text(details.concept, 'concept'),
            instructions: text(details.instructions, 'instructions')
        }
    };
}

export function createAccommodation(id, seed = {}) {
    return {
        id,
        name: text(seed.name, 'name'),
        address: text(seed.address, 'address'),
        description: text(seed.description, 'description'),
        phone: text(seed.phone, 'phone'),
        reservationUrl: text(seed.reservationUrl, 'reservationUrl'),
        mapsUrl: text(seed.mapsUrl, 'mapsUrl'),
        reservationCode: text(seed.reservationCode, 'reservationCode'),
        notes: text(seed.notes, 'notes')
    };
}

export function createLink(id, seed = {}) {
    return {
        id,
        type: oneOf(seed.type, LINK_TYPES, 'custom'),
        label: text(seed.label, 'label'),
        url: text(seed.url, 'url'),
        description: text(seed.description, 'description'),
        phone: text(seed.phone, 'phone'),
        message: text(seed.message, 'message')
    };
}

export function createDressColor(id, seed = {}) {
    const color = /^#[\da-f]{6}$/i.test(seed.value ?? '') ? seed.value.toUpperCase() : '#D6C2A1';
    return { id, name: text(seed.name, 'name'), value: color };
}

export function entityHasContent(entity = {}) {
    return Object.entries(entity).some(([key, value]) => {
        if (key === 'id') return false;
        if (value && typeof value === 'object') return entityHasContent(value);
        return String(value ?? '').trim().length > 0 && !['other', 'store', '#D6C2A1'].includes(value);
    });
}

export function isCollectionTouched(draft, collection) {
    return Array.isArray(draft?.meta?.touchedCollections) && draft.meta.touchedCollections.includes(collection);
}

export function getCollectionMode(draft, collection, items = draft?.[collection] ?? []) {
    const hasContent = Array.isArray(items) && items.some(entityHasContent);
    if (hasContent) return 'configured';
    return isCollectionTouched(draft, collection) ? 'cleared' : 'untouched';
}

export function packageAllowsMultipleLocations(packageId) {
    return Boolean(getPackageById(packageId)?.capabilities.includes('multiple-locations'));
}

export function getRenderableLocations(draft = {}) {
    const locations = Array.isArray(draft.locations) ? draft.locations : [];
    return packageAllowsMultipleLocations(draft.packageId) ? locations : locations.slice(0, 1);
}

export function normalizeEntity(collection, entity) {
    const id = text(entity?.id, 'reference');
    if (!id) throw new TypeError(`builder/${collection}-entity-id-required`);
    if (collection === 'locations') return createLocation(id, entity);
    if (collection === 'itinerary') return createItineraryItem(id, entity);
    if (collection === 'gifts') return createGift(id, entity);
    if (collection === 'accommodations') return createAccommodation(id, entity);
    if (collection === 'links') return createLink(id, entity);
    throw new TypeError(`builder/unknown-entity-collection:${String(collection)}`);
}

export function locationTypeLabel(type) {
    return ({ ceremony: 'Ceremonia', reception: 'Recepción', party: 'Fiesta', session: 'Sesión', accommodation: 'Hospedaje', other: 'Otro' })[type] ?? 'Otro';
}

export function giftTypeLabel(type) {
    return ({ store: 'Tienda', transfer: 'Transferencia', cash: 'Efectivo / información', other: 'Otro' })[type] ?? 'Otro';
}

export function linkTypeLabel(type) {
    return ({ whatsapp: 'WhatsApp', instagram: 'Instagram', calendar: 'Agregar al calendario', transport: 'Transporte', contact: 'Contacto', custom: 'Personalizado' })[type] ?? 'Enlace';
}
