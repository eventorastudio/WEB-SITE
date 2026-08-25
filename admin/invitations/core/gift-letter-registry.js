const LETTERS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'Ñ', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']);

export const GIFT_LETTER_OPTIONS = Object.freeze(LETTERS.map((value) => Object.freeze({ value, label: value })));
export const GIFT_LETTER_KEYS = LETTERS;

export function normalizeGiftLetterKey(value) {
    const letter = String(value ?? '').trim().toUpperCase();
    return LETTERS.includes(letter) ? letter : '';
}

export function inferGiftLetterKey({ name = '', letterKey } = {}) {
    const explicit = normalizeGiftLetterKey(letterKey);
    if (explicit) return explicit;
    const first = String(name ?? '').trim().toUpperCase().charAt(0);
    return normalizeGiftLetterKey(first) || 'G';
}
