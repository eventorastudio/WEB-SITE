import {
    deserializeInvitationPublication,
    isInvitationPublicKey
} from '../invitations/core/invitation-publication-schema.js?v=phase64-personalized-invitation-20260817';
import {
    assertRsvpAccessEventId,
    assertRsvpAccessGuestId,
    assertRsvpAccessToken,
    deserializeRsvpAccessDocument,
    isRsvpAccessExpired
} from '../../shared/rsvp-access-contract.js?v=phase64-personalized-invitation-20260817';
import { buildPersonalizedInvitationUrl } from '../../invitacion/public-invitation-route.js?v=phase64-personalized-invitation-20260817';

function serviceError(code, cause = null) {
    const error = new Error(code);
    error.code = code;
    error.cause = cause ?? undefined;
    return error;
}

async function createFirebasePersonalizedInvitationGateway() {
    const [{ db }, firestoreApi] = await Promise.all([
        import('../firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    return {
        async readPublication(eventId) {
            const snapshot = await firestoreApi.getDoc(firestoreApi.doc(
                db,
                'eventos',
                eventId,
                'invitacion',
                'publication'
            ));
            return snapshot.exists() ? snapshot.data() : null;
        },
        async findAccessByGuest(eventId, guestId) {
            const snapshot = await firestoreApi.getDocs(firestoreApi.query(
                firestoreApi.collection(db, 'eventos', eventId, 'rsvpAccess'),
                firestoreApi.where('guestId', '==', guestId)
            ));
            return snapshot.docs.map((item) => ({ token: item.id, document: item.data() }));
        }
    };
}

export class PersonalizedInvitationService {
    constructor({
        gateway = null,
        gatewayFactory = createFirebasePersonalizedInvitationGateway,
        now = () => new Date(),
        publicBaseUrl
    } = {}) {
        this.gateway = gateway;
        this.gatewayFactory = gatewayFactory;
        this.gatewayPromise = null;
        this.now = now;
        this.publicBaseUrl = publicBaseUrl;
    }

    async getGateway() {
        if (this.gateway) return this.gateway;
        if (!this.gatewayPromise) this.gatewayPromise = this.gatewayFactory();
        this.gateway = await this.gatewayPromise;
        return this.gateway;
    }

    async createGuestInvitationUrl({ eventId, guestId } = {}) {
        const safeEventId = assertRsvpAccessEventId(eventId);
        const safeGuestId = assertRsvpAccessGuestId(guestId);
        const gateway = await this.getGateway();
        let publicationDocument;
        let accessRecords;
        try {
            [publicationDocument, accessRecords] = await Promise.all([
                gateway.readPublication(safeEventId),
                gateway.findAccessByGuest(safeEventId, safeGuestId)
            ]);
        } catch (error) {
            throw serviceError('personalized-invitation/read-failed', error);
        }
        if (!publicationDocument) throw serviceError('personalized-invitation/not-published');

        let publication;
        let candidates;
        try {
            publication = deserializeInvitationPublication(publicationDocument, safeEventId);
            candidates = (accessRecords ?? []).map(({ token, document }) => ({
                token: assertRsvpAccessToken(token),
                access: deserializeRsvpAccessDocument(document, {
                    expectedEventId: safeEventId,
                    expectedGuestId: safeGuestId
                })
            })).filter(({ access }) => access.active && !isRsvpAccessExpired(access.expiresAt, this.now()));
        } catch (error) {
            throw serviceError('personalized-invitation/invalid-source', error);
        }
        if (!isInvitationPublicKey(publication.publicKey)) {
            throw serviceError('personalized-invitation/not-published');
        }
        if (candidates.length === 0) throw serviceError('personalized-invitation/access-unavailable');
        if (candidates.length > 1) throw serviceError('personalized-invitation/ambiguous-access');

        const selected = candidates[0];
        const options = {
            eventId: safeEventId,
            publicKey: publication.publicKey,
            rsvpToken: selected.token
        };
        if (this.publicBaseUrl) options.baseUrl = this.publicBaseUrl;
        return Object.freeze({
            eventId: safeEventId,
            guestId: safeGuestId,
            publicKey: publication.publicKey,
            token: selected.token,
            url: buildPersonalizedInvitationUrl(options),
            personalization: Object.freeze({
                displayName: selected.access.displayName,
                passLimit: selected.access.passLimit
            })
        });
    }
}

export const personalizedInvitationService = new PersonalizedInvitationService({
    publicBaseUrl: globalThis.location?.origin
        ? new URL('/invitacion/', globalThis.location.origin).toString()
        : undefined
});
