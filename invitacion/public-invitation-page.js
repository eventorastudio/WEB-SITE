import { getPersistedGeneralContentPaths } from '../admin/invitations/core/draft-persistence-schema.js?v=phase63-public-invitation-20260817';
import { SECTION_REGISTRY, isSectionAllowed } from '../admin/invitations/core/section-registry.js?v=phase3-logistics-20260813';
import { createTemplateSectionContract } from '../admin/invitations/core/template-binding-registry.js?v=phase54a-rsvp-time-20260817';
import { getThemeById } from '../admin/invitations/core/theme-registry.js?v=phase3-logistics-20260813';
import { publicInvitationLoader } from './public-invitation-loader.js?v=phase63-public-invitation-20260817';

const AUTHORITATIVE_COLLECTIONS = Object.freeze([
    'locations',
    'itinerary',
    'gifts',
    'accommodations',
    'links',
    'dressCodeColors'
]);

export function readPublicInvitationRoute(locationLike = globalThis.location) {
    try {
        const params = new URL(locationLike.href).searchParams;
        return {
            eventId: String(params.get('event') ?? ''),
            publicKey: String(params.get('key') ?? '')
        };
    } catch {
        return { eventId: '', publicKey: '' };
    }
}

export function createPublicInvitationRenderPayload(projection) {
    const theme = getThemeById(projection?.theme);
    if (!theme) throw new TypeError('public-invitation/unknown-theme');
    const packageId = projection.settings?.packageId ?? null;
    const sectionContract = createTemplateSectionContract(theme.id, SECTION_REGISTRY);
    const { touchedRoles = [], ...media } = projection.media ?? {};
    return {
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
}

export class PublicInvitationPage {
    constructor({
        loader = publicInvitationLoader,
        renderer,
        onUnavailable = () => {}
    } = {}) {
        this.loader = loader;
        this.renderer = renderer;
        this.onUnavailable = onUnavailable;
    }

    async load(locationLike = globalThis.location) {
        const { eventId, publicKey } = readPublicInvitationRoute(locationLike);
        try {
            const projection = await this.loader.load(eventId, publicKey);
            const payload = createPublicInvitationRenderPayload(projection);
            if (typeof this.renderer !== 'function') throw new TypeError('public-invitation/renderer-required');
            await this.renderer(payload);
            return Object.freeze({ status: 'rendered', eventId, publicKey, projection, payload });
        } catch (error) {
            this.onUnavailable(error);
            return Object.freeze({ status: 'unavailable', eventId, publicKey, error });
        }
    }
}
