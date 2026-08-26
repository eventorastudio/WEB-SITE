import { getPersistedGeneralContentPaths } from '../admin/invitations/core/draft-persistence-schema.js?v=phase168-device-availability-20260825';
import { SECTION_REGISTRY, isSectionAllowed } from '../admin/invitations/core/section-registry.js?v=phase3-logistics-20260813';
import { createTemplateSectionContract } from '../admin/invitations/core/template-binding-registry.js?v=phase86-aloha-a2-20260820';
import { getThemeById } from '../admin/invitations/core/theme-registry.js?v=phase3-logistics-20260813';
import { publicInvitationLoader } from './public-invitation-loader.js?v=phase168-device-availability-20260825';
import { publicInvitationPersonalizationLoader } from './public-invitation-personalization.js?v=phase64-personalized-invitation-20260817';
import {
    buildInvitationRsvpUrl,
    readPublicInvitationRoute
} from './public-invitation-route.js?v=phase168-device-availability-20260825';
import {
    formatAllowedDevices,
    getDeviceCategory,
    isDeviceAllowed,
    normalizeDeviceAvailability
} from '../admin/invitations/core/device-availability.js?v=phase168-device-availability-20260825';

const AUTHORITATIVE_COLLECTIONS = Object.freeze([
    'locations',
    'itinerary',
    'gifts',
    'accommodations',
    'links',
    'dressCodeColors'
]);

export function createPublicInvitationRenderPayload(projection, {
    personalization = null,
    rsvpUrl = ''
} = {}) {
    const theme = getThemeById(projection?.theme);
    if (!theme) throw new TypeError('public-invitation/unknown-theme');
    const packageId = projection.settings?.packageId ?? null;
    const sectionContract = createTemplateSectionContract(theme.id, SECTION_REGISTRY);
    const { touchedRoles = [], ...media } = projection.media ?? {};
    const payload = {
        theme: {
            id: theme.id,
            name: theme.name,
            templatePath: theme.templatePath,
            palette: theme.palette
        },
        draft: {
            schemaVersion: projection.contentSchemaVersion,
            contentSchemaVersion: projection.contentSchemaVersion,
            packageId,
            settings: projection.settings,
            content: projection.content,
            media,
            locations: projection.locations,
            itinerary: projection.itinerary,
            gifts: projection.gifts,
            accommodations: projection.accommodations,
            links: projection.links,
            appearance: projection.appearance,
            meta: {
                touchedPaths: getPersistedGeneralContentPaths(),
                touchedCollections: [...AUTHORITATIVE_COLLECTIONS],
                touchedMediaRoles: [...touchedRoles]
            }
        },
        enabledSections: projection.sections.filter((sectionId) => (
            isSectionAllowed(sectionId, packageId)
            && (sectionId !== 'access-preview' || Boolean(personalization))
        )),
        sections: sectionContract.sections,
        sectionGroups: sectionContract.groups,
        renderMode: 'public',
        publication: {
            eventId: projection.eventId,
            publicKey: projection.publicKey,
            revisionId: projection.revisionId,
            revisionNumber: projection.revisionNumber
        }
    };
    if (personalization) {
        payload.personalization = Object.freeze({
            displayName: personalization.displayName,
            passLimit: personalization.passLimit,
            ...(personalization.qrToken ? { qrToken: personalization.qrToken } : {})
        });
        payload.rsvpUrl = rsvpUrl;
    }
    return payload;
}

export class PublicInvitationPage {
    constructor({
        loader = publicInvitationLoader,
        personalizationLoader = publicInvitationPersonalizationLoader,
        renderer,
        onUnavailable = () => {},
        onDeviceBlocked = () => {}
    } = {}) {
        this.loader = loader;
        this.personalizationLoader = personalizationLoader;
        this.renderer = renderer;
        this.onUnavailable = onUnavailable;
        this.onDeviceBlocked = onDeviceBlocked;
        this.projection = null;
        this.payload = null;
        this.deviceState = null;
        this.deviceCheckFrame = 0;
        this.deviceCheckRunning = false;
        this.deviceCheckPending = false;
        this.resizeListenerRegistered = false;
        this.resizeListener = () => {
            if (this.deviceCheckRunning) {
                this.deviceCheckPending = true;
                return;
            }
            if (this.deviceCheckFrame) return;
            this.deviceCheckFrame = globalThis.requestAnimationFrame?.(() => {
                this.deviceCheckFrame = 0;
                void this.evaluateDeviceAvailability();
            }) ?? globalThis.setTimeout(() => { this.deviceCheckFrame = 0; void this.evaluateDeviceAvailability(); }, 80);
        };
    }

    async load(locationLike = globalThis.location) {
        const { eventId, publicKey, rsvpToken } = readPublicInvitationRoute(locationLike);
        try {
            const projection = await this.loader.load(eventId, publicKey);
            this.projection = projection;
            this.route = { eventId, publicKey, rsvpToken, locationLike };
            if (!this.resizeListenerRegistered) {
                globalThis.addEventListener?.('resize', this.resizeListener, { passive: true });
                this.resizeListenerRegistered = true;
            }
            const status = await this.evaluateDeviceAvailability();
            return Object.freeze({ status, eventId, publicKey, projection, payload: this.payload });
        } catch (error) {
            this.onUnavailable(error);
            return Object.freeze({ status: 'unavailable', eventId, publicKey, error });
        }
    }

    async evaluateDeviceAvailability() {
        if (!this.projection) return this.deviceState ?? 'blocked';
        if (this.deviceCheckRunning) {
            this.deviceCheckPending = true;
            return this.deviceState ?? 'blocked';
        }
        this.deviceCheckRunning = true;
        let result = this.deviceState ?? 'blocked';
        try {
            do {
                this.deviceCheckPending = false;
                result = await this.evaluateDeviceAvailabilityOnce();
            } while (this.deviceCheckPending);
            return result;
        } finally {
            this.deviceCheckRunning = false;
        }
    }

    async evaluateDeviceAvailabilityOnce() {
        const availability = normalizeDeviceAvailability(this.projection.settings?.deviceAvailability);
        const category = getDeviceCategory(globalThis.innerWidth);
        const allowed = isDeviceAllowed(availability, category);
        const nextState = allowed ? 'allowed' : 'blocked';
        if (this.deviceState === nextState && (nextState === 'blocked' || this.payload)) return nextState;
        this.deviceState = nextState;
        if (!allowed) {
            this.onDeviceBlocked({ category, allowedDevices: formatAllowedDevices(availability) });
            return 'blocked';
        }
        const { eventId, publicKey, rsvpToken, locationLike } = this.route;
        const personalization = rsvpToken
            ? await this.loadPersonalization(eventId, rsvpToken)
            : null;
        const rsvpUrl = personalization
            ? buildInvitationRsvpUrl(eventId, rsvpToken, { origin: locationOrigin(locationLike) })
            : '';
        const payload = createPublicInvitationRenderPayload(this.projection, { personalization, rsvpUrl });
        if (typeof this.renderer !== 'function') throw new TypeError('public-invitation/renderer-required');
        this.payload = payload;
        await this.renderer(payload);
        return 'rendered';
    }

    async loadPersonalization(eventId, rsvpToken) {
        try {
            return await this.personalizationLoader.load(eventId, rsvpToken);
        } catch {
            return null;
        }
    }
}

function locationOrigin(locationLike) {
    try {
        return new URL(locationLike.href).origin;
    } catch {
        return globalThis.location?.origin ?? 'https://eventorastudio.com';
    }
}

export { readPublicInvitationRoute };
