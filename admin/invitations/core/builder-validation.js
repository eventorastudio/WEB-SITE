import { getDraftValue } from './content-schema.js?v=phase21-normalization-20260813';

function isExactDate(value) {
    const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const parsed = match ? new Date(`${value}T12:00:00`) : null;
    return Boolean(parsed && !Number.isNaN(parsed.getTime())
        && parsed.getFullYear() === Number(match[1])
        && parsed.getMonth() + 1 === Number(match[2])
        && parsed.getDate() === Number(match[3]));
}

export function validateInvitationDraft(draft = {}) {
    const errors = {};
    const primaryName = String(getDraftValue(draft, 'content.identity.primaryName') ?? '').trim();
    const date = String(getDraftValue(draft, 'content.schedule.date') ?? '').trim();
    const time = String(getDraftValue(draft, 'content.schedule.time') ?? '').trim();

    if (!primaryName) errors['content.identity.primaryName'] = 'Escribe el nombre principal de la invitación.';
    else if (primaryName.length > 120) errors['content.identity.primaryName'] = 'Usa un nombre de máximo 120 caracteres.';

    if (!date) errors['content.schedule.date'] = 'Selecciona una fecha.';
    else if (!isExactDate(date)) errors['content.schedule.date'] = 'La fecha no es válida.';

    if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        errors['content.schedule.time'] = 'La hora no es válida.';
    }

    const rsvpDeadline = String(getDraftValue(draft, 'content.rsvp.deadline') ?? '').trim();
    if (rsvpDeadline && !isExactDate(rsvpDeadline)) {
        errors['content.rsvp.deadline'] = 'La fecha límite no es válida.';
    }

    return Object.freeze(errors);
}

export function validateBasicContent(content = {}) {
    const nested = Boolean(content.identity || content.schedule);
    const draft = nested
        ? { content }
        : {
            content: {
                identity: { primaryName: content.title ?? '' },
                schedule: { date: content.date ?? '', time: content.time ?? '' },
                rsvp: { deadline: '' }
            }
        };
    const errors = validateInvitationDraft(draft);
    if (nested) return errors;
    return Object.freeze({
        ...(errors['content.identity.primaryName'] ? { title: errors['content.identity.primaryName'] } : {}),
        ...(errors['content.schedule.date'] ? { date: errors['content.schedule.date'] } : {}),
        ...(errors['content.schedule.time'] ? { time: errors['content.schedule.time'] } : {})
    });
}

export function isBasicContentValid(content) {
    return Object.keys(validateBasicContent(content)).length === 0;
}
