import {
    assertInvitationPublicKey
} from '../admin/invitations/core/invitation-publication-schema.js?v=phase171-demo-mode-20260826';
import {
    assertRsvpAccessEventId,
    assertRsvpAccessToken,
    buildRsvpUrl,
    isValidRsvpAccessToken
} from '../shared/rsvp-access-contract.js?v=phase64-personalized-invitation-20260817';

export const PUBLIC_INVITATION_DEFAULT_URL = 'https://eventorastudio.com/invitacion/';

export function readPublicInvitationRoute(input = globalThis.location) {
    let params;
    try {
        params = routeParams(input);
    } catch {
        return emptyRoute();
    }
    const eventValues = params.getAll('event');
    const keyValues = params.getAll('key');
    const tokenValues = params.getAll('token');
    return {
        eventId: eventValues.length === 1 ? String(eventValues[0]) : '',
        publicKey: keyValues.length === 1 ? String(keyValues[0]) : '',
        rsvpToken: tokenValues.length === 1 && isValidRsvpAccessToken(tokenValues[0])
            ? tokenValues[0]
            : null
    };
}

export function buildPersonalizedInvitationUrl({
    eventId,
    publicKey,
    rsvpToken,
    baseUrl = PUBLIC_INVITATION_DEFAULT_URL
} = {}) {
    return buildPublicInvitationUrl({
        eventId,
        publicKey,
        rsvpToken: assertRsvpAccessToken(rsvpToken),
        baseUrl
    });
}

export function buildPublicInvitationUrl({
    eventId,
    publicKey,
    rsvpToken = '',
    baseUrl = PUBLIC_INVITATION_DEFAULT_URL
} = {}) {
    const url = safeHttpUrl(baseUrl);
    url.pathname = '/invitacion/';
    url.hash = '';
    url.search = '';
    url.searchParams.set('event', assertRsvpAccessEventId(eventId));
    url.searchParams.set('key', assertInvitationPublicKey(publicKey));
    const token = String(rsvpToken ?? '').trim();
    if (token) url.searchParams.set('token', assertRsvpAccessToken(token));
    return url.toString();
}

export function buildInvitationRsvpUrl(eventId, rsvpToken, {
    origin = globalThis.location?.origin ?? 'https://eventorastudio.com'
} = {}) {
    return buildRsvpUrl(eventId, rsvpToken, {
        baseUrl: new URL('/rsvp/', origin).toString()
    });
}

function routeParams(input) {
    if (input instanceof URL) return input.searchParams;
    if (input?.href) return new URL(input.href).searchParams;
    const value = String(input ?? '');
    if (/^https?:\/\//i.test(value)) return new URL(value).searchParams;
    return new URLSearchParams(value.startsWith('?') ? value.slice(1) : value);
}

function safeHttpUrl(value) {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) throw new TypeError('public-invitation/invalid-base-url');
    return url;
}

function emptyRoute() {
    return { eventId: '', publicKey: '', rsvpToken: null };
}
