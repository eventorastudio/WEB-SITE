function field(path, label, options = {}) {
    return Object.freeze({ path, label, kind: 'text', ...options });
}

function editor(definition) {
    return Object.freeze({
        ...definition,
        fields: Object.freeze(definition.fields ?? []),
        advancedEditors: Object.freeze(definition.advancedEditors ?? [])
    });
}

export const GENERAL_INFORMATION_FIELDS = Object.freeze([
    field('content.identity.primaryName', 'Nombre principal / título', { placeholder: 'María & Fernando', required: true }),
    field('content.identity.secondaryName', 'Nombre secundario', { placeholder: 'Opcional para parejas, familias o subtítulos' }),
    field('content.identity.eventType', 'Tipo de evento', { placeholder: 'Boda, XV años, cumpleaños…' }),
    field('content.schedule.date', 'Fecha', { kind: 'date', required: true }),
    field('content.schedule.time', 'Hora', { kind: 'time' }),
    field('content.place.city', 'Ciudad', { placeholder: 'Saltillo' }),
    field('content.place.state', 'Estado', { placeholder: 'Coahuila' }),
    field('content.identity.phrase', 'Frase principal', { kind: 'textarea', rows: 2, placeholder: 'Nos encantará compartir este día contigo.' })
]);

export const SECTION_EDITOR_REGISTRY = Object.freeze({
    'welcome-story': editor({
        title: 'Bienvenida e historia',
        fields: [
            field('content.welcome.eyebrow', 'Eyebrow', { placeholder: 'Nuestra historia' }),
            field('content.welcome.title', 'Título', { placeholder: 'Por la vida que elegimos' }),
            field('content.welcome.message', 'Mensaje de bienvenida', { kind: 'textarea', rows: 3 }),
            field('content.welcome.story', 'Historia', { kind: 'textarea', rows: 6 })
        ]
    }),
    countdown: editor({
        title: 'Cuenta regresiva',
        description: 'Consume la fecha y hora de Información general.',
        fields: [
            field('content.countdown.title', 'Título', { placeholder: 'Faltan…' }),
            field('content.countdown.preMessage', 'Mensaje previo', { kind: 'textarea', rows: 2 }),
            field('content.countdown.arrivedMessage', 'Mensaje al llegar la fecha', { kind: 'textarea', rows: 2, placeholder: 'El gran día ha llegado.' })
        ]
    }),
    location: editor({
        title: 'Ubicación y mapa',
        notice: 'Lugares, Maps, Waze, hospedaje y enlaces se configuran en Ubicaciones y detalles.',
        advancedEditors: ['locations', 'accommodations', 'links'],
        fields: [
            field('content.location.title', 'Título de sección'),
            field('content.location.intro', 'Texto introductorio', { kind: 'textarea', rows: 2 })
        ]
    }),
    'dress-code': editor({
        title: 'Dress Code',
        notice: 'Las paletas recomendadas y a evitar se configuran en Ubicaciones y detalles.',
        advancedEditors: ['dress-code'],
        fields: [
            field('content.dressCode.title', 'Título de sección'),
            field('content.dressCode.name', 'Nombre del dress code', { placeholder: 'Formal, Black Tie, Garden Formal…' }),
            field('content.dressCode.description', 'Descripción', { kind: 'textarea', rows: 3 }),
            field('content.dressCode.note', 'Nota adicional', { kind: 'textarea', rows: 2 })
        ]
    }),
    rsvp: editor({
        title: 'Confirmación RSVP',
        notice: 'Fase 5.1 configura el contrato y la preview. El formulario público, invitados y pases reales permanecen fuera de alcance.',
        fields: [
            field('content.rsvp.enabled', 'RSVP activo', {
                kind: 'toggle',
                wide: true,
                help: 'Desactivarlo oculta la confirmación sin borrar su configuración.'
            }),
            field('content.rsvp.deadline', 'Fecha límite', {
                kind: 'date',
                visibleWhen: [{ path: 'content.rsvp.enabled', equals: true }]
            }),
            field('content.rsvp.title', 'Título', {
                visibleWhen: [{ path: 'content.rsvp.enabled', equals: true }]
            }),
            field('content.rsvp.message', 'Mensaje', {
                kind: 'textarea', rows: 3,
                visibleWhen: [{ path: 'content.rsvp.enabled', equals: true }]
            }),
            field('content.rsvp.buttonLabel', 'Texto del botón', {
                visibleWhen: [{ path: 'content.rsvp.enabled', equals: true }]
            }),
            field('content.rsvp.method', 'Método de confirmación', {
                kind: 'select',
                options: [
                    { value: 'internal', label: 'Confirmación interna' },
                    { value: 'whatsapp', label: 'WhatsApp' }
                ],
                visibleWhen: [{ path: 'content.rsvp.enabled', equals: true }]
            }),
            field('content.rsvp.whatsapp.phone', 'Teléfono de WhatsApp', {
                placeholder: '528441234567',
                visibleWhen: [
                    { path: 'content.rsvp.enabled', equals: true },
                    { path: 'content.rsvp.method', equals: 'whatsapp' }
                ]
            }),
            field('content.rsvp.whatsapp.message', 'Mensaje de WhatsApp', {
                kind: 'textarea', rows: 3,
                visibleWhen: [
                    { path: 'content.rsvp.enabled', equals: true },
                    { path: 'content.rsvp.method', equals: 'whatsapp' }
                ]
            }),
            field('content.rsvp.guestPolicy', 'Política de pases', {
                kind: 'select',
                wide: true,
                help: 'Nunca permite acompañantes fuera del límite asignado al invitado.',
                options: [
                    { value: 'assigned-only', label: 'Usar únicamente los pases asignados' },
                    { value: 'select-up-to-assigned', label: 'Permitir seleccionar hasta el límite', requiredSection: 'pass-selection' }
                ],
                visibleWhen: [{ path: 'content.rsvp.enabled', equals: true }]
            }),
            field('content.rsvp.responses.acceptedLabel', 'Texto de respuesta positiva', {
                placeholder: 'Sí, asistiré',
                visibleWhen: [{ path: 'content.rsvp.enabled', equals: true }]
            }),
            field('content.rsvp.responses.declinedLabel', 'Texto para declinar', {
                placeholder: 'No podré asistir',
                visibleWhen: [{ path: 'content.rsvp.enabled', equals: true }]
            }),
            field('content.rsvp.responses.confirmationMessage', 'Mensaje posterior a la confirmación', {
                kind: 'textarea', rows: 3,
                visibleWhen: [{ path: 'content.rsvp.enabled', equals: true }]
            })
        ]
    }),
    music: editor({
        title: 'Música personalizada',
        notice: 'El archivo de audio se configurará en Multimedia.',
        fields: [
            field('content.music.title', 'Título / label'),
            field('content.music.text', 'Texto asociado', { kind: 'textarea', rows: 2 })
        ]
    }),
    'welcome-video': editor({
        title: 'Video de bienvenida',
        notice: 'El archivo de video se configurará en Multimedia.',
        fields: [
            field('content.video.title', 'Título'),
            field('content.video.subtitle', 'Subtítulo / caption'),
            field('content.video.intro', 'Texto introductorio', { kind: 'textarea', rows: 3 })
        ]
    }),
    gallery: editor({
        title: 'Galería de fotografías',
        notice: 'Las fotografías se configurarán en Multimedia. La preview conserva los assets demo de la colección.',
        fields: [
            field('content.gallery.title', 'Título'),
            field('content.gallery.subtitle', 'Subtítulo'),
            field('content.gallery.description', 'Descripción breve', { kind: 'textarea', rows: 3 })
        ]
    }),
    'gift-registry': editor({
        title: 'Mesa de regalos',
        notice: 'Las opciones de tienda, transferencia o información se configuran en Ubicaciones y detalles.',
        advancedEditors: ['gifts'],
        fields: [
            field('content.gifts.title', 'Título'),
            field('content.gifts.description', 'Descripción', { kind: 'textarea', rows: 3 }),
            field('content.gifts.ctaLabel', 'Texto CTA')
        ]
    }),
    'pass-selection': editor({
        title: 'Selección de pases',
        notice: 'La lógica real de pases e invitados pertenece a una fase posterior.',
        fields: [
            field('content.passes.title', 'Título'),
            field('content.passes.instructions', 'Instrucciones', { kind: 'textarea', rows: 3 })
        ]
    }),
    itinerary: editor({
        title: 'Itinerario del evento',
        notice: 'Las actividades dinámicas se configuran en Ubicaciones y detalles.',
        advancedEditors: ['itinerary'],
        fields: [
            field('content.itinerary.title', 'Título'),
            field('content.itinerary.intro', 'Introducción', { kind: 'textarea', rows: 3 })
        ]
    }),
    'access-preview': editor({
        title: 'Pase personalizado',
        notice: 'QR, invitados, pases reales y check-in no forman parte de esta fase.',
        fields: [
            field('content.access.title', 'Título'),
            field('content.access.description', 'Descripción', { kind: 'textarea', rows: 3 }),
            field('content.access.label', 'Label general')
        ]
    }),
    'advanced-personalization': editor({
        title: 'Sección especial',
        notice: 'La personalización visual avanzada se implementará en Apariencia.',
        fields: []
    })
});

export function getSectionEditor(sectionId) {
    return SECTION_EDITOR_REGISTRY[sectionId] ?? null;
}
