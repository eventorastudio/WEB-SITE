import { getDraftValue } from './content-schema.js?v=phase54a-rsvp-time-20260817';
import { DRESS_COLOR_GROUPS } from './logistics-schema.js?v=phase3-logistics-20260813';
import { normalizeWhatsAppPhone, safeUrlError } from './safe-url.js?v=phase51-rsvp-20260816';
import { getAllMediaAssets, validateMediaAsset } from './media-schema.js?v=phase89-dress-code-media-20260820';
import {
    RSVP_GUEST_POLICIES,
    RSVP_METHODS,
    isRsvpEnabled
} from './rsvp-schema.js?v=phase54a-rsvp-time-20260817';
import {
    deriveRsvpResponseClosesAt,
    isValidRsvpDeadlineDate
} from './rsvp-time.js?v=phase54a-rsvp-time-20260817';

export function isExactDate(value) {
    return isValidRsvpDeadlineDate(value);
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

    Object.assign(errors, validateRsvpConfig(draft.content?.rsvp));

    validateEntityIds(draft, errors);
    const locationIds = new Set((draft.locations ?? []).map(({ id }) => id));
    (draft.locations ?? []).forEach((location) => {
        validateTime(location.time, `locations.${location.id}.time`, errors);
        validateUrl(location.mapsUrl, `locations.${location.id}.mapsUrl`, 'mapsUrl', 'custom', errors);
        validateUrl(location.wazeUrl, `locations.${location.id}.wazeUrl`, 'wazeUrl', 'custom', errors);
    });
    (draft.itinerary ?? []).forEach((item) => {
        validateTime(item.time, `itinerary.${item.id}.time`, errors);
        if (item.locationId && !locationIds.has(item.locationId)) {
            errors[`itinerary.${item.id}.locationId`] = 'La ubicación asociada ya no existe.';
        }
    });
    (draft.gifts ?? []).forEach((gift) => {
        validateUrl(gift.url, `gifts.${gift.id}.url`, 'url', 'custom', errors);
    });
    (draft.accommodations ?? []).forEach((hotel) => {
        validateUrl(hotel.reservationUrl, `accommodations.${hotel.id}.reservationUrl`, 'reservationUrl', 'custom', errors);
        validateUrl(hotel.mapsUrl, `accommodations.${hotel.id}.mapsUrl`, 'mapsUrl', 'custom', errors);
    });
    (draft.links ?? []).forEach((link) => {
        if (link.type === 'whatsapp') {
            if (link.phone && !normalizeWhatsAppPhone(link.phone)) {
                errors[`links.${link.id}.phone`] = 'Usa un número internacional de 7 a 15 dígitos.';
            }
        } else if (link.type !== 'calendar') {
            validateUrl(link.url, `links.${link.id}.url`, 'url', link.type, errors);
        }
    });
    DRESS_COLOR_GROUPS.forEach((group) => {
        (draft.content?.dressCode?.[group] ?? []).forEach((color) => {
            if (!/^#[\da-f]{6}$/i.test(color.value ?? '')) {
                errors[`content.dressCode.${group}.${color.id}.value`] = 'Selecciona un color válido.';
            }
        });
    });
    validateMedia(draft, errors);

    return Object.freeze(errors);
}

export function validateRsvpConfig(rsvp = {}) {
    const errors = {};
    if (!isRsvpEnabled(rsvp)) return Object.freeze(errors);

    const deadline = String(rsvp?.deadline ?? '').trim();
    const deadlineTime = String(rsvp?.deadlineTime ?? '').trim();
    const deadlineTimeZone = String(rsvp?.deadlineTimeZone ?? '').trim();
    const method = String(rsvp?.method ?? '').trim();
    const guestPolicy = String(rsvp?.guestPolicy ?? '').trim();
    const phone = String(rsvp?.whatsapp?.phone ?? '').trim();

    try {
        deriveRsvpResponseClosesAt({ deadline, deadlineTime, deadlineTimeZone });
    } catch (error) {
        const code = error?.code ?? '';
        if (code === 'rsvp-time/deadline-required' || code === 'rsvp-time/invalid-deadline') {
            errors['content.rsvp.deadline'] = code.endsWith('required')
                ? 'Selecciona una fecha límite para la hora o zona configurada.'
                : 'La fecha límite no es válida.';
        } else if (code === 'rsvp-time/deadline-time-zone-required' || code === 'rsvp-time/invalid-time-zone') {
            errors['content.rsvp.deadlineTimeZone'] = code.endsWith('required')
                ? 'Selecciona y confirma una zona horaria IANA.'
                : 'La zona horaria IANA no es válida.';
        } else {
            errors['content.rsvp.deadlineTime'] = ({
                'rsvp-time/deadline-time-required': 'Selecciona una hora límite.',
                'rsvp-time/invalid-deadline-time': 'La hora límite debe usar el formato HH:mm.',
                'rsvp-time/nonexistent-local-time': 'Esta hora local no existe por un cambio de horario. Elige otra.',
                'rsvp-time/ambiguous-local-time': 'Esta hora local es ambigua por un cambio de horario. Elige otra.'
            })[code] ?? 'La hora límite no es válida.';
        }
    }

    if (!RSVP_METHODS.includes(method)) {
        errors['content.rsvp.method'] = 'Selecciona un método RSVP válido.';
    } else if (method === 'whatsapp') {
        if (!phone) errors['content.rsvp.whatsapp.phone'] = 'Escribe el teléfono de WhatsApp.';
        else if (!normalizeWhatsAppPhone(phone)) {
            errors['content.rsvp.whatsapp.phone'] = 'Usa un número internacional de 7 a 15 dígitos.';
        }
    }
    if (!RSVP_GUEST_POLICIES.includes(guestPolicy)) {
        errors['content.rsvp.guestPolicy'] = 'Selecciona una política de pases válida.';
    }
    return Object.freeze(errors);
}

function validateTime(value, path, errors) {
    if (value && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value))) {
        errors[path] = 'La hora no es válida.';
    }
}

function validateUrl(value, path, field, linkType, errors) {
    const message = safeUrlError(value, field, linkType);
    if (message) errors[path] = message;
}

function validateEntityIds(draft, errors) {
    const seen = new Set();
    ['locations', 'itinerary', 'gifts', 'accommodations', 'links'].forEach((collection) => {
        (draft[collection] ?? []).forEach((entity, index) => {
            const path = `${collection}.${entity?.id || index}.id`;
            if (!entity?.id || !/^[A-Z]{3}-LOCAL-\d{3,}$/.test(entity.id)) errors[path] = 'La entidad no tiene un ID local válido.';
            else if (seen.has(entity.id)) errors[path] = 'El ID local está duplicado.';
            else seen.add(entity.id);
        });
    });
    DRESS_COLOR_GROUPS.forEach((group) => {
        (draft.content?.dressCode?.[group] ?? []).forEach((entity, index) => {
            const path = `content.dressCode.${group}.${entity?.id || index}.id`;
            if (!entity?.id || !/^CLR-LOCAL-\d{3,}$/.test(entity.id)) errors[path] = 'El color no tiene un ID local válido.';
            else if (seen.has(entity.id)) errors[path] = 'El ID local está duplicado.';
            else seen.add(entity.id);
        });
    });
}

function validateMedia(draft, errors) {
    const media = draft.media ?? {};
    validateMediaAsset(media.cover, 'cover', errors, 'media.cover');
    (media.gallery ?? []).forEach((asset, index) => validateMediaAsset(asset, 'gallery', errors, `media.gallery.${asset?.id || index}`));
    validateMediaAsset(media.dressCode, 'dressCode', errors, 'media.dressCode');
    validateMediaAsset(media.video, 'video', errors, 'media.video');
    validateMediaAsset(media.videoPoster, 'videoPoster', errors, 'media.videoPoster');
    validateMediaAsset(media.music, 'music', errors, 'media.music');

    const seen = new Set();
    getAllMediaAssets(media).forEach((asset) => {
        if (seen.has(asset.id)) errors[`media.${asset.role}.${asset.id}.id`] = 'El ID del recurso está duplicado.';
        seen.add(asset.id);
        if (asset.previewUrl && !String(asset.previewUrl).startsWith('blob:')) {
            errors[`media.${asset.role}.${asset.id}.previewUrl`] = 'La URL temporal local no es válida.';
        }
    });
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
