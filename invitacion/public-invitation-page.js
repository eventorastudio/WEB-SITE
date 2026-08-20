import { getPersistedGeneralContentPaths } from '../admin/invitations/core/draft-persistence-schema.js?v=phase86-appearance-20260820';
import { SECTION_REGISTRY, isSectionAllowed } from '../admin/invitations/core/section-registry.js?v=phase3-logistics-20260813';
import { createTemplateSectionContract } from '../admin/invitations/core/template-binding-registry.js?v=phase86-aloha-a2-20260820';
import { getThemeById } from '../admin/invitations/core/theme-registry.js?v=phase3-logistics-20260813';
import { publicInvitationLoader } from './public-invitation-loader.js?v=phase63-public-invitation-20260817';
import { publicInvitationPersonalizationLoader } from './public-invitation-personalization.js?v=phase64-personalized-invitation-20260817';
import {
    buildInvitationRsvpUrl,
    readPublicInvitationRoute
} from './public-invitation-route.js?v=phase64-personalized-invitation-20260817';

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
        enabledSections: projection.sections.filter((sectionId) => isSectionAllowed(sectionId, packageId)),
        sections: sectionContract.sections,
        sectionGroups: sectionContract.groups,
        renderMode: 'public',
        publication: {
            eventId: projection.eventId,
            revisionId: projection.revisionId,
            revisionNumber: projection.revisionNumber
        }
    };
    if (personalization) {
        payload.personalization = Object.freeze({
            displayName: personalization.displayName,
            passLimit: personalization.passLimit
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
        onUnavailable = () => {}
    } = {}) {
        this.loader = loader;
        this.personalizationLoader = personalizationLoader;
        this.renderer = renderer;
        this.onUnavailable = onUnavailable;
    }

    async load(locationLike = globalThis.location) {
        const { eventId, publicKey, rsvpToken } = readPublicInvitationRoute(locationLike);
        try {
            const projection = await this.loader.load(eventId, publicKey);
            const personalization = rsvpToken
                ? await this.loadPersonalization(eventId, rsvpToken)
                : null;
            const rsvpUrl = personalization
                ? buildInvitationRsvpUrl(eventId, rsvpToken, {
                    origin: locationOrigin(locationLike)
                })
                : '';
            const payload = createPublicInvitationRenderPayload(projection, { personalization, rsvpUrl });
            if (typeof this.renderer !== 'function') throw new TypeError('public-invitation/renderer-required');
            await this.renderer(payload);
            return Object.freeze({ status: 'rendered', eventId, publicKey, projection, payload });
        } catch (error) {
            this.onUnavailable(error);
            return Object.freeze({ status: 'unavailable', eventId, publicKey, error });
        }
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
