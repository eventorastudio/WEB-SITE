import { initEntityListEditor, textField, textareaField } from './entity-editor-utils.js?v=phase3-logistics-20260813';

export function initAccommodationEditor({ container, state }) {
    return initEntityListEditor({
        container, state, collection: 'accommodations',
        title: 'Hospedaje sugerido',
        description: 'El contrato actual no define múltiples hoteles; esta fase permite conservar una opción.',
        addLabel: '+ Agregar hotel',
        addMethod: 'addAccommodation', updateMethod: 'updateAccommodation', removeMethod: 'removeAccommodation', moveMethod: null,
        canAdd: (snapshot) => snapshot.draft.accommodations.length === 0,
        addUnavailableMessage: 'Ya existe el hospedaje permitido por el contrato actual.',
        summary: (item) => ({ title: item.name || 'Hospedaje', subtitle: item.address || item.id, status: 'Hotel' }),
        fields: () => [
            textField('name', 'Nombre', { placeholder: 'Hotel Eventora', maxLength: 160 }),
            textField('phone', 'Teléfono', { maxLength: 32 }),
            textareaField('address', 'Dirección', { rows: 2, maxLength: 300 }),
            textareaField('description', 'Descripción', { rows: 2, maxLength: 800 }),
            textField('reservationUrl', 'URL de reservación', { wide: true, placeholder: 'https://…', maxLength: 2048 }),
            textField('mapsUrl', 'Google Maps URL', { wide: true, placeholder: 'https://…', maxLength: 2048 }),
            textField('reservationCode', 'Código de reservación', { maxLength: 120 }),
            textareaField('notes', 'Notas', { rows: 2, maxLength: 600 })
        ]
    });
}
