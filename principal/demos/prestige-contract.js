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
  'advanced-personalization'
]);

export const PRESTIGE_SERVICE_BENEFITS = Object.freeze([
  'Atención personalizada',
  'Más cambios incluidos',
  'Atención prioritaria'
]);
