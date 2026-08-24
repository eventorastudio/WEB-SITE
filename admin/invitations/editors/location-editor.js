import { LOCATION_TYPES, locationTypeLabel, packageAllowsMultipleLocations } from '../core/logistics-schema.js?v=phase93-package-sections-format-20260821';
import { initEntityListEditor, iconPickerField, selectField, textField, textareaField } from './entity-editor-utils.js?v=phase113-aloha-location-cards-20260823';

const TYPE_OPTIONS = LOCATION_TYPES.map((value) => ({ value, label: locationTypeLabel(value) }));

export function initLocationEditor({ container, state }) {
    return initEntityListEditor({
        container, state, collection: 'locations',
        title: 'Ubicaciones',
        description: 'Configura sedes y asigna una foto desde las imágenes cargadas en Multimedia → Galería.',
        addLabel: '+ Agregar ubicación',
        addMethod: 'addLocation', updateMethod: 'updateLocation', removeMethod: 'removeLocation', moveMethod: 'moveLocation',
        canAdd: (snapshot) => !snapshot.draft.locations.length || packageAllowsMultipleLocations(snapshot.draft.packageId),
        addUnavailableMessage: 'El paquete actual permite una ubicación principal. Las ubicaciones adicionales se conservan al hacer downgrade.',
        refreshOnCollections: ['media'],
        summary: (item, index, snapshot) => ({
            title: item.title || locationTypeLabel(item.type) || `Ubicación ${index + 1}`,
            subtitle: item.venueName || item.address || item.id,
            status: index > 0 && !packageAllowsMultipleLocations(snapshot.draft.packageId) ? 'Conservada' : locationTypeLabel(item.type)
        }),
        fields: (item, snapshot) => [
            selectField('type', 'Tipo', TYPE_OPTIONS),
            iconPickerField('categoryIcon', 'Icono de categoría'),
            iconPickerField('venueIcon', 'Icono del lugar'),
            textField('title', 'Título visible', { placeholder: 'Ceremonia religiosa', maxLength: 140 }),
            textField('venueName', 'Nombre del lugar', { placeholder: 'Catedral de Santiago', maxLength: 160 }),
            selectField('imageId', 'Foto del lugar', [
                { value: '', label: 'Sin foto — usar fallback Aloha' },
                ...(snapshot.draft.media?.gallery ?? []).map((asset) => ({
                    value: asset.id,
                    label: asset.originalName || `Imagen ${asset.id}`
                }))
            ], { wide: true }),
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
