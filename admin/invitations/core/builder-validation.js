export function validateBasicContent(content = {}) {
    const errors = {};
    const title = String(content.title ?? '').trim();
    const date = String(content.date ?? '').trim();

    if (!title) errors.title = 'Escribe el nombre principal de la invitación.';
    if (title.length > 120) errors.title = 'Usa un nombre de máximo 120 caracteres.';

    if (!date) {
        errors.date = 'Selecciona una fecha.';
    } else {
        const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const parsed = match ? new Date(`${date}T12:00:00`) : null;
        const isExactDate = Boolean(parsed && !Number.isNaN(parsed.getTime())
            && parsed.getFullYear() === Number(match[1])
            && parsed.getMonth() + 1 === Number(match[2])
            && parsed.getDate() === Number(match[3]));
        if (!isExactDate) errors.date = 'La fecha no es válida.';
    }

    return Object.freeze(errors);
}

export function isBasicContentValid(content) {
    return Object.keys(validateBasicContent(content)).length === 0;
}
