import { LOCATION_TYPES, locationTypeLabel, packageAllowsMultipleLocations } from '../core/logistics-schema.js?v=phase93-package-sections-format-20260821';
import { initEntityListEditor, selectField, textField, textareaField } from './entity-editor-utils.js?v=phase3-logistics-20260813';

const TYPE_OPTIONS = LOCATION_TYPES.map((value) => ({ value, label: locationTypeLabel(value) }));

export function initLocationEditor({ container, state }) {
    return initEntityListEditor({
        container, state, collection: 'locations',
        title: 'Ubicaciones',
        description: 'Configura el lugar principal y, con Premium o Prestige, sedes adicionales.',
        addLabel: '+ Agregar ubicación',
        addMethod: 'addLocation', updateMethod: 'updateLocation', removeMethod: 'removeLocation', moveMethod: 'moveLocation',
        canAdd: (snapshot) => !snapshot.draft.locations.length || packageAllowsMultipleLocations(snapshot.draft.packageId),
        addUnavailableMessage: 'El paquete actual permite una ubicación principal. Las ubicaciones adicionales se conservan al hacer downgrade.',
        summary: (item, index, snapshot) => ({
            title: item.title || locationTypeLabel(item.type) || `Ubicación ${index + 1}`,
            subtitle: item.venueName || item.address || item.id,
            status: index > 0 && !packageAllowsMultipleLocations(snapshot.draft.packageId) ? 'Conservada' : locationTypeLabel(item.type)
        }),
        fields: () => [
            selectField('type', 'Tipo', TYPE_OPTIONS),
            textField('title', 'Título visible', { placeholder: 'Ceremonia religiosa', maxLength: 140 }),
            textField('venueName', 'Nombre del lugar', { placeholder: 'Catedral de Santiago', maxLength: 160 }),
            textField('time', 'Hora', { type: 'time', errorPath: (item) => `locations.${item.id}.time` }),
            textareaField('address', 'Dirección', { rows: 2, placeholder: 'Calle, número y colonia', maxLength: 300 }),
            textField('city', 'Ciudad', { maxLength: 100 }),
            textField('state', 'Estado', { maxLength: 100 }),
            textField('mapsUrl', 'Google Maps URL', { wide: true, placeholder: 'https://…', maxLength: 2048 }),
            textField('wazeUrl', 'Waze URL', { wide: true, placeholder: 'https://…', maxLength: 2048 }),
            textareaField('description', 'Descripción', { rows: 3, maxLength: 800 }),
            textareaField('notes', 'Notas', { rows: 2, maxLength: 600 })
        ]
    });
}
