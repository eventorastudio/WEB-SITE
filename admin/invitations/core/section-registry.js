import {
    PACKAGE_MATRIX,
    PRESTIGE_COMMERCIAL_DEMO_MAP
} from '../../../principal/demos/prestige-contract.js';

export const PACKAGE_ORDER = Object.freeze(['esencial', 'premium', 'prestige']);

const PACKAGE_NAMES = Object.freeze({
    esencial: 'Esencial',
    premium: 'Premium',
    prestige: 'Prestige'
});

function cumulativeCommercialFeatures(packageId) {
    const packageIndex = PACKAGE_ORDER.indexOf(packageId);
    if (packageIndex < 0) return [];

    return PACKAGE_ORDER
        .slice(0, packageIndex + 1)
        .flatMap((id) => PACKAGE_MATRIX[id])
        .filter((feature) => !/^Todo lo incluido en /i.test(feature));
}

export const PACKAGE_REGISTRY = Object.freeze(PACKAGE_ORDER.map((id) => Object.freeze({
    id,
    name: PACKAGE_NAMES[id],
    commercialFeatures: Object.freeze(cumulativeCommercialFeatures(id)),
    capabilities: Object.freeze(cumulativeCommercialFeatures(id)
        .map((feature) => PRESTIGE_COMMERCIAL_DEMO_MAP[feature])
        .filter(Boolean))
})));

function section(definition) {
    return Object.freeze({
        ...definition,
        previewSelectors: Object.freeze(definition.previewSelectors ?? [])
    });
}

// Secciones y capacidades derivadas del contrato Prestige y de /paquetes/.
// Beneficios de servicio (atención/cambios) se excluyen deliberadamente.
export const SECTION_REGISTRY = Object.freeze([
    section({ id: 'welcome-story', name: 'Bienvenida e historia', description: 'Narrativa introductoria propia de cada colección.', requiredCapability: 'personalized-design' }),
    section({ id: 'countdown', name: 'Cuenta regresiva', description: 'Tiempo restante hasta el evento.', requiredCapability: 'countdown', previewSelectors: ['[data-prestige-feature~="countdown"]'] }),
    section({ id: 'location', name: 'Ubicación y mapa', description: 'Lugar principal y acceso a Google Maps.', requiredCapability: 'maps', previewSelectors: ['[data-prestige-feature~="multiple-locations"]'] }),
    section({ id: 'dress-code', name: 'Dress Code', description: 'Código de vestimenta y guía visual.', requiredCapability: 'dress-code', previewSelectors: ['[data-prestige-feature~="dress-code"]'] }),
    section({ id: 'rsvp', name: 'Confirmación RSVP', description: 'Confirmación de asistencia del invitado.', requiredCapability: 'rsvp', previewSelectors: ['[data-prestige-feature~="rsvp"]'] }),
    section({ id: 'music', name: 'Música personalizada', description: 'Audio de ambientación tras una interacción.', requiredCapability: 'music' }),
    section({ id: 'welcome-video', name: 'Video de bienvenida', description: 'Bloque audiovisual de apertura.', requiredCapability: 'welcome-video', previewSelectors: ['[data-prestige-feature~="welcome-video"]'] }),
    section({ id: 'gallery', name: 'Galería de fotografías', description: 'Composición visual de recuerdos.', requiredCapability: 'gallery', previewSelectors: ['[data-prestige-feature~="gallery"]'] }),
    section({ id: 'gift-registry', name: 'Mesa de regalos', description: 'Accesos a tiendas o transferencia.', requiredCapability: 'gift-registry', previewSelectors: ['[data-prestige-feature~="gift-registry"]'] }),
    section({ id: 'pass-selection', name: 'Selección de pases', description: 'Cantidad de pases que utilizará el invitado.', requiredCapability: 'pass-selection', previewSelectors: ['[data-prestige-feature~="pass-selection"]'] }),
    section({ id: 'itinerary', name: 'Itinerario del evento', description: 'Secuencia completa de momentos del día.', requiredCapability: 'itinerary', previewSelectors: ['[data-prestige-feature~="itinerary"]'] }),
    section({ id: 'access-preview', name: 'Pase personalizado', description: 'Vista digital e impresa del acceso.', requiredCapability: 'personalized-passes', previewSelectors: ['[data-prestige-feature~="access-preview"]'] }),
    section({ id: 'advanced-personalization', name: 'Sección especial', description: 'Bloque avanzado propio de cada colección.', requiredCapability: 'advanced-personalization' })
]);

export function getPackageById(packageId) {
    return PACKAGE_REGISTRY.find((item) => item.id === packageId) ?? null;
}

export function getSectionById(sectionId) {
    return SECTION_REGISTRY.find((item) => item.id === sectionId) ?? null;
}

export function isSectionAllowed(sectionId, packageId) {
    const selectedSection = getSectionById(sectionId);
    const selectedPackage = getPackageById(packageId);
    return Boolean(selectedSection && selectedPackage?.capabilities.includes(selectedSection.requiredCapability));
}

export function getSectionsForPackage(packageId) {
    return SECTION_REGISTRY.map((item) => Object.freeze({
        ...item,
        allowed: isSectionAllowed(item.id, packageId)
    }));
}
