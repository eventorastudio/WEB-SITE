import { initEntityListEditor, selectField, textField, textareaField } from './entity-editor-utils.js?v=phase3-logistics-20260813';

export function initItineraryEditor({ container, state }) {
    return initEntityListEditor({
        container, state, collection: 'itinerary',
        title: 'Itinerario',
        description: 'Ordena las actividades y vincúlalas con una ubicación sin duplicar direcciones.',
        addLabel: '+ Agregar actividad',
        addMethod: 'addItineraryItem', updateMethod: 'updateItineraryItem', removeMethod: 'removeItineraryItem', moveMethod: 'moveItineraryItem',
        refreshOnCollections: ['locations'],
        summary: (item, index) => ({ title: item.title || `Actividad ${index + 1}`, subtitle: [item.time, item.id].filter(Boolean).join(' · '), status: item.time || 'Sin hora' }),
        fields: (item, snapshot) => [
            textField('time', 'Hora', { type: 'time' }),
            textField('title', 'Título', { placeholder: 'Llegada de invitados', maxLength: 140 }),
            selectField('locationId', 'Ubicación asociada', [
                { value: '', label: 'Sin ubicación asociada' },
                ...snapshot.draft.locations.map((location) => ({ value: location.id, label: location.venueName || location.title || location.id }))
            ]),
            textareaField('description', 'Descripción', { rows: 2, maxLength: 800 }),
            textareaField('notes', 'Notas opcionales', { rows: 2, maxLength: 600 })
        ]
    });
}
