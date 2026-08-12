/**
 * Contrato comercial de las demostraciones Prestige.
 *
 * Fuente de verdad: paquetes/index.html (secciones #esencial, #premium y
 * #prestige). Prestige es acumulativo: incluye Premium y Premium incluye
 * Esencial. Los beneficios de servicio se conservan en PACKAGE_MATRIX, pero
 * solo las capacidades observables se exigen dentro de una invitación demo.
 */
export const PACKAGE_MATRIX = Object.freeze({
  esencial: Object.freeze([
    'Diseño 100% personalizado',
    'Música personalizada',
    'Confirmación RSVP',
    'Cuenta regresiva',
    'Google Maps',
    'Dress Code',
    'Compatible con cualquier dispositivo',
    'Atención personalizada'
  ]),
  premium: Object.freeze([
    'Todo lo incluido en Esencial',
    'Video de bienvenida',
    'Galería de fotografías',
    'Mesa de regalos',
    'Selección inteligente de pases',
    'Más cambios incluidos',
    'Animaciones premium'
  ]),
  prestige: Object.freeze([
    'Todo lo incluido en Premium',
    'Múltiples ubicaciones',
    'Itinerario del evento',
    'Pases personalizados',
    'Control avanzado de invitados',
    'Personalización avanzada',
    'Atención prioritaria'
  ])
});

export const PRESTIGE_DEMO_FEATURES = Object.freeze([
  'opening',
  'hero',
  'internal-navigation',
  'personalized-design',
  'guest-personalization',
  'music',
  'rsvp',
  'countdown',
  'maps',
  'dress-code',
  'responsive',
  'welcome-video',
  'gallery',
  'gift-registry',
  'pass-selection',
  'premium-animations',
  'multiple-locations',
  'itinerary',
  'personalized-passes',
  'guest-control',
  'access-preview',
  'advanced-personalization',
  'demo-notice',
  'footer-disclosure'
]);

export const PRESTIGE_DEMO_ARCHITECTURE = Object.freeze({
  sourceRoute: '/paquetes/demos/prestige/',
  sourceFiles: Object.freeze(['index.html', 'demo.css', 'demo.js']),
  requiredSections: Object.freeze([
    'opening',
    'hero',
    'welcome-story',
    'welcome-video',
    'countdown',
    'gallery',
    'dress-code',
    'itinerary-and-locations',
    'gift-registry',
    'rsvp-and-access',
    'advanced-personalization',
    'footer-disclosure'
  ]),
  requiredInteractions: Object.freeze([
    'open-after-user-action',
    'music-after-user-action',
    'countdown-live-region',
    'video-preview-control',
    'pass-selection',
    'digital-or-printed-access-preview',
    'demo-mode-external-action-interception',
    'accessible-demo-dialog',
    'internal-navigation',
    'reduced-motion'
  ]),
  requiredConfig: Object.freeze([
    'demoMode',
    'guest.defaultName',
    'guest.defaultPasses',
    'event.title',
    'event.date',
    'event.time',
    'locations',
    'links'
  ])
});

export const PRESTIGE_SERVICE_BENEFITS = Object.freeze([
  'Atención personalizada',
  'Más cambios incluidos',
  'Atención prioritaria'
]);

export const PRESTIGE_COMMERCIAL_DEMO_MAP = Object.freeze({
  'Diseño 100% personalizado': 'personalized-design',
  'Música personalizada': 'music',
  'Confirmación RSVP': 'rsvp',
  'Cuenta regresiva': 'countdown',
  'Google Maps': 'maps',
  'Dress Code': 'dress-code',
  'Compatible con cualquier dispositivo': 'responsive',
  'Video de bienvenida': 'welcome-video',
  'Galería de fotografías': 'gallery',
  'Mesa de regalos': 'gift-registry',
  'Selección inteligente de pases': 'pass-selection',
  'Animaciones premium': 'premium-animations',
  'Múltiples ubicaciones': 'multiple-locations',
  'Itinerario del evento': 'itinerary',
  'Pases personalizados': 'personalized-passes',
  'Control avanzado de invitados': 'guest-control',
  'Personalización avanzada': 'advanced-personalization'
});
