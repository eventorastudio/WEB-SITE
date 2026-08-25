import { LINK_TYPES, linkTypeLabel } from '../core/logistics-schema.js?v=phase142-aloha-prestige-actions-icon-picker-20260825';
import { initEntityListEditor, linkIconPickerField, selectField, textField, textareaField } from './entity-editor-utils.js?v=phase142-aloha-prestige-actions-icon-picker-20260825';

const TYPE_OPTIONS = LINK_TYPES.map((value) => ({ value, label: linkTypeLabel(value) }));

export function initLinksEditor({ container, state }) {
    return initEntityListEditor({
        container, state, collection: 'links',
        title: 'Enlaces y acciones',
        description: 'Calendar usa los datos centrales del evento; WhatsApp prepara únicamente un enlace futuro.',
        addLabel: '+ Agregar enlace',
        addMethod: 'addLink', updateMethod: 'updateLink', removeMethod: 'removeLink', moveMethod: 'moveLink',
        rerenderFields: ['type'],
        summary: (item, index) => ({ title: item.label || linkTypeLabel(item.type) || `Enlace ${index + 1}`, subtitle: item.description || item.id, status: linkTypeLabel(item.type) }),
        fields: (item) => [
            selectField('type', 'Tipo', TYPE_OPTIONS),
            textField('label', 'Label', { placeholder: linkTypeLabel(item.type), maxLength: 120 }),
            linkIconPickerField('iconKey', 'Icono / logo'),
            textField('url', 'URL', { wide: true, placeholder: 'https://…', maxLength: 2048, when: (link) => !['whatsapp', 'calendar'].includes(link.type) }),
            textField('phone', 'Teléfono internacional', { placeholder: '528441234567', maxLength: 32, when: (link) => link.type === 'whatsapp' }),
            textareaField('message', 'Mensaje base', { rows: 3, maxLength: 1000, when: (link) => link.type === 'whatsapp' }),
            textareaField('description', 'Descripción', { rows: 2, maxLength: 800 })
        ]
    });
}
