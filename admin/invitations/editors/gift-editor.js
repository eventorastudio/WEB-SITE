import { GIFT_TYPES, giftTypeLabel } from '../core/logistics-schema.js?v=phase141-aloha-gift-letter-picker-20260825';
import { giftLetterPickerField, initEntityListEditor, selectField, textField, textareaField } from './entity-editor-utils.js?v=phase141-aloha-gift-letter-picker-20260825';

const TYPE_OPTIONS = GIFT_TYPES.map((value) => ({ value, label: giftTypeLabel(value) }));

export function initGiftEditor({ container, state }) {
    return initEntityListEditor({
        container, state, collection: 'gifts',
        title: 'Mesa de regalos',
        description: 'Agrega tiendas, transferencias o indicaciones. Esta fase conserva los datos solo en memoria local.',
        addLabel: '+ Agregar opción',
        addMethod: 'addGift', updateMethod: 'updateGift', removeMethod: 'removeGift', moveMethod: 'moveGift',
        rerenderFields: ['type'],
        summary: (item, index) => ({ title: item.name || `Opción ${index + 1}`, subtitle: item.description || item.id, status: giftTypeLabel(item.type) }),
        fields: (item) => [
            selectField('type', 'Tipo', TYPE_OPTIONS),
            textField('name', 'Nombre', { placeholder: 'Mesa de regalos ejemplo', maxLength: 160 }),
            giftLetterPickerField('letterKey', 'Letra decorativa'),
            textField('url', 'Link HTTPS', { wide: true, placeholder: 'https://…', maxLength: 2048, when: (gift) => gift.type === 'store' || gift.type === 'other' }),
            textField('reference', 'Número / referencia opcional', { wide: true, maxLength: 180 }),
            textareaField('description', 'Descripción', { rows: 2, maxLength: 800 }),
            textField('bank', 'Banco', { nested: 'details', maxLength: 120, when: (gift) => gift.type === 'transfer' }),
            textField('beneficiary', 'Beneficiario', { nested: 'details', maxLength: 160, when: (gift) => gift.type === 'transfer' }),
            textField('account', 'Cuenta', { nested: 'details', maxLength: 120, when: (gift) => gift.type === 'transfer' }),
            textField('clabe', 'CLABE', { nested: 'details', maxLength: 40, when: (gift) => gift.type === 'transfer' }),
            textField('concept', 'Concepto', { nested: 'details', maxLength: 180, when: (gift) => gift.type === 'transfer' }),
            textareaField('instructions', 'Instrucciones', { nested: 'details', rows: 2, maxLength: 800, when: (gift) => gift.type !== 'store' })
        ]
    });
}
