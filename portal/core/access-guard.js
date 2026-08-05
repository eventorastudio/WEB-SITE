import { PORTAL_CONFIG, getRequestedEventId } from '../config.js';
import { assertPortalFeature, EntitlementError, PORTAL_FEATURES } from './entitlement-guard.js';
import { portalState } from './portal-state.js';
import { portalAuthService } from '../services/portal-auth-service.js';
import { portalEventService } from '../services/portal-event-service.js';

export class PortalAccessError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export async function resolvePortalContext({ feature = PORTAL_FEATURES.PORTAL } = {}) {
    const user = await portalAuthService.waitForSession();
    if (!user) throw new PortalAccessError('portal/auth-required');

    let profile;
    try {
        profile = await portalEventService.getProfile(user.uid);
    } catch (error) {
        throw new PortalAccessError(error.message);
    }

    const requestedEventId = getRequestedEventId() || profile.eventosPermitidos[0];
    if (!requestedEventId) throw new PortalAccessError('portal/event-not-assigned');

    let event;
    try {
        event = await portalEventService.getAuthorizedEvent(requestedEventId, profile);
        assertPortalFeature(event, PORTAL_FEATURES.PORTAL);
        assertPortalFeature(event, feature);
    } catch (error) {
        if (error instanceof EntitlementError) throw new PortalAccessError(error.code);
        throw new PortalAccessError(error.message);
    }

    portalState.set('auth', { user, profile, authenticated: true });
    portalState.set('event', { id: event.id, data: event });
    portalState.set('permissions', { portal: true, ...event.funcionalidades });
    return { user, profile, event, entitlements: event.funcionalidades };
}

export function redirectToLogin() {
    const page = window.location.pathname.split('/').pop() || PORTAL_CONFIG.defaultPage;
    const next = `${page}${window.location.search}`;
    window.location.assign(`${PORTAL_CONFIG.loginPath}?next=${encodeURIComponent(next)}`);
}
