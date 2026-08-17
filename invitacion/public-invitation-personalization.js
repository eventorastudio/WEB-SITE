import { PublicRsvpAccessLoader } from '../rsvp/services/rsvp-access-loader.js?v=phase64-personalized-invitation-20260817';

export class PublicInvitationPersonalizationLoader {
    constructor({ accessLoader = new PublicRsvpAccessLoader() } = {}) {
        this.accessLoader = accessLoader;
    }

    async load(eventId, rsvpToken) {
        const access = await this.accessLoader.load(eventId, rsvpToken);
        return Object.freeze({
            displayName: cleanDisplayName(access.displayName),
            passLimit: assertPassLimit(access.passLimit)
        });
    }
}

export function applyPublicInvitationPersonalization(documentRoot, personalization, rsvpUrl) {
    if (!personalization) return Object.freeze({ applied: false, ctaCount: 0 });
    const displayName = cleanDisplayName(personalization.displayName);
    const passLimit = assertPassLimit(personalization.passLimit);
    const safeRsvpUrl = assertSameOriginRsvpUrl(documentRoot, rsvpUrl);

    documentRoot.querySelector('[data-public-invitation-personalization]')?.remove();
    const banner = documentRoot.createElement('aside');
    banner.className = 'public-invitation-personalization';
    banner.dataset.publicInvitationPersonalization = 'true';
    banner.setAttribute('aria-label', 'Invitación personalizada');

    const copy = documentRoot.createElement('div');
    const eyebrow = documentRoot.createElement('span');
    const name = documentRoot.createElement('strong');
    const passes = documentRoot.createElement('small');
    eyebrow.textContent = 'INVITACIÓN PARA';
    name.textContent = displayName;
    passes.textContent = `${passLimit} pase${passLimit === 1 ? '' : 's'} asignado${passLimit === 1 ? '' : 's'}`;
    copy.append(eyebrow, name, passes);

    const cta = documentRoot.createElement('a');
    cta.className = 'public-invitation-personalization__cta';
    cta.dataset.publicInvitationRsvp = 'true';
    cta.href = safeRsvpUrl;
    cta.textContent = 'Confirmar asistencia';
    banner.append(copy, cta);
    documentRoot.body.prepend(banner);

    const themeActions = [...documentRoot.querySelectorAll(
        '[data-demo-action="rsvp"], [data-builder-action="rsvp"], [data-rsvp-method]'
    )].filter((action) => action !== cta);
    themeActions.forEach((action) => {
        action.setAttribute('href', safeRsvpUrl);
        action.dataset.publicInvitationRsvp = 'true';
    });
    return Object.freeze({ applied: true, ctaCount: themeActions.length + 1 });
}

function cleanDisplayName(value) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.length > 160) throw new TypeError('public-invitation/invalid-display-name');
    return normalized;
}

function assertPassLimit(value) {
    if (!Number.isInteger(value) || value < 1 || value > 999) {
        throw new TypeError('public-invitation/invalid-pass-limit');
    }
    return value;
}

function assertSameOriginRsvpUrl(documentRoot, value) {
    const origin = documentRoot.defaultView?.location?.origin;
    const url = new URL(value, origin);
    if (!origin || url.origin !== origin || url.pathname !== '/rsvp/') {
        throw new TypeError('public-invitation/invalid-rsvp-url');
    }
    return url.toString();
}

export const publicInvitationPersonalizationLoader = new PublicInvitationPersonalizationLoader();
