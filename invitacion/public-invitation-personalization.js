import { PublicRsvpAccessLoader } from '../rsvp/services/rsvp-access-loader.js?v=phase64-personalized-invitation-20260817';
import { publicGuestQrTokenLoader } from './public-guest-qr-token.js?v=phase88-qr2-20260820';

export class PublicInvitationPersonalizationLoader {
    constructor({ accessLoader = new PublicRsvpAccessLoader(), qrLoader = publicGuestQrTokenLoader } = {}) {
        this.accessLoader = accessLoader;
        this.qrLoader = qrLoader;
    }
    async load(eventId, rsvpToken) {
        const access = await this.accessLoader.load(eventId, rsvpToken);
        const personalization = Object.freeze({ displayName: cleanDisplayName(access.displayName), passLimit: assertPassLimit(access.passLimit) });
        try {
            return Object.freeze({ ...personalization, qrToken: await this.qrLoader.load(eventId, rsvpToken) });
        } catch {
            return personalization;
        }
    }
}

// Compatibility adapter: personalized data is rendered inside the access section, never in a global bar.
export function applyPublicInvitationPersonalization(documentRoot, personalization, rsvpUrl) {
    if (!personalization) return Object.freeze({ applied: false, ctaCount: 0 });
    const safeRsvpUrl = assertSameOriginRsvpUrl(documentRoot, rsvpUrl);
    const actions = [...documentRoot.querySelectorAll('[data-demo-action="rsvp"], [data-builder-action="rsvp"], [data-rsvp-method]')];
    actions.forEach((action) => {
        action.setAttribute('href', safeRsvpUrl);
        action.dataset.publicInvitationRsvp = 'true';
    });
    documentRoot.querySelector('[data-public-invitation-personalization]')?.remove();
    return Object.freeze({ applied: true, ctaCount: actions.length });
}

function cleanDisplayName(value) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.length > 160) throw new TypeError('public-invitation/invalid-display-name');
    return normalized;
}
function assertPassLimit(value) {
    if (!Number.isInteger(value) || value < 1 || value > 999) throw new TypeError('public-invitation/invalid-pass-limit');
    return value;
}
function assertSameOriginRsvpUrl(documentRoot, value) {
    const origin = documentRoot.defaultView?.location?.origin;
    const url = new URL(value, origin);
    if (!origin || url.origin !== origin || url.pathname !== '/rsvp/') throw new TypeError('public-invitation/invalid-rsvp-url');
    return url.toString();
}
export const publicInvitationPersonalizationLoader = new PublicInvitationPersonalizationLoader();
