import {
    deserializeInvitationPublication,
    isInvitationPublicKey
} from '../invitations/core/invitation-publication-schema.js?v=phase168-device-availability-20260825';
import {
    assertRsvpAccessEventId,
    assertRsvpAccessGuestId,
    assertRsvpAccessToken,
    deserializeRsvpAccessDocument,
    isRsvpAccessExpired
} from '../../shared/rsvp-access-contract.js?v=phase64-personalized-invitation-20260817';
import { rsvpAccessService } from '../invitations/services/rsvp-access-service.js?v=phase71-invitation-sharing-20260817';
import { buildPersonalizedInvitationUrl } from '../../invitacion/public-invitation-route.js?v=phase90-canonical-invitation-urls-20260821';

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
        accessService = rsvpAccessService,
        now = () => new Date(),
        publicBaseUrl
    } = {}) {
        this.gateway = gateway;
        this.gatewayFactory = gatewayFactory;
        this.gatewayPromise = null;
        this.accessService = accessService;
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
            candidates = findReusableAccessCandidates(accessRecords, {
                eventId: safeEventId,
                guestId: safeGuestId,
                now: this.now()
            });
        } catch (error) {
            throw serviceError('personalized-invitation/invalid-source', error);
        }
        if (!isInvitationPublicKey(publication.publicKey)) {
            throw serviceError('personalized-invitation/not-published');
        }
        if (candidates.length > 1) throw serviceError('personalized-invitation/ambiguous-access');

        let selected;

        if (candidates[0]) {
            const sync = this.accessService?.sync;

            if (typeof sync !== 'function') {
                throw serviceError('personalized-invitation/access-sync-unavailable');
            }

            try {
                const syncedAccess = await sync.call(this.accessService, {
                    eventId: safeEventId,
                    token: candidates[0].token
                });

                selected = {
                    token: candidates[0].token,
                    access: syncedAccess
                };
            } catch (error) {
                throw serviceError('personalized-invitation/access-sync-failed', error);
            }
        } else {
            selected = await this.createActiveAccess(safeEventId, safeGuestId);
        }
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

    async refreshGuestInvitationUrls({ eventId, guestIds = [] } = {}) {
        const safeEventId = assertRsvpAccessEventId(eventId);
        const ids = [...new Set((guestIds ?? []).map((guestId) => String(guestId ?? '').trim()).filter(Boolean))];
        const gateway = await this.getGateway();
        let publicationDocument;
        try {
            publicationDocument = await gateway.readPublication(safeEventId);
        } catch (error) {
            throw serviceError('personalized-invitation/read-failed', error);
        }
        if (!publicationDocument) throw serviceError('personalized-invitation/not-published');
        let publication;
        try {
            publication = deserializeInvitationPublication(publicationDocument, safeEventId);
        } catch (error) {
            throw serviceError('personalized-invitation/invalid-source', error);
        }
        if (!isInvitationPublicKey(publication.publicKey)) throw serviceError('personalized-invitation/not-published');

        const results = await Promise.all(ids.map(async (guestId) => {
            const safeGuestId = assertRsvpAccessGuestId(guestId);
            const records = await gateway.findAccessByGuest(safeEventId, safeGuestId);
            const candidates = findReusableAccessCandidates(records, {
                eventId: safeEventId,
                guestId: safeGuestId,
                now: this.now()
            });
            const selected = candidates[0];
            if (!selected) return { guestId: safeGuestId, updated: false, reason: 'no-active-access' };
            const access = await this.accessService.sync({ eventId: safeEventId, token: selected.token });
            return {
                guestId: safeGuestId,
                updated: true,
                token: selected.token,
                url: buildPersonalizedInvitationUrl({
                    eventId: safeEventId,
                    publicKey: publication.publicKey,
                    rsvpToken: selected.token,
                    ...(this.publicBaseUrl ? { baseUrl: this.publicBaseUrl } : {})
                }),
                access
            };
        }));
        return Object.freeze({ eventId: safeEventId, publicKey: publication.publicKey, results });
    }

    async createActiveAccess(eventId, guestId) {
        const create = this.accessService?.create;
        if (typeof create !== 'function') {
            throw serviceError('personalized-invitation/access-create-unavailable');
        }
        try {
            const result = await create.call(this.accessService, { eventId, guestId });
            const token = assertRsvpAccessToken(result?.token);
            const access = deserializeRsvpAccessDocument(result?.access, {
                expectedEventId: eventId,
                expectedGuestId: guestId
            });
            if (!access.active || isRsvpAccessExpired(access.expiresAt, this.now())) {
                throw serviceError('personalized-invitation/access-create-verification-failed');
            }
            return { token, access };
        } catch (error) {
            if (error?.code === 'personalized-invitation/access-create-unavailable') throw error;
            throw serviceError('personalized-invitation/access-create-failed', error);
        }
    }
}

function findReusableAccessCandidates(records, { eventId, guestId, now } = {}) {
    const candidates = [];
    for (const record of records ?? []) {
        try {
            const token = assertRsvpAccessToken(record?.token);
            const access = deserializeRsvpAccessDocument(record?.document, {
                expectedEventId: eventId,
                expectedGuestId: guestId
            });
            if (access.active && !isRsvpAccessExpired(access.expiresAt, now)) {
                candidates.push(Object.freeze({ token, access }));
            }
        } catch {
            // Invalid Access records are never reused for shareable invitation links.
        }
    }
    return Object.freeze(candidates);
}

export const personalizedInvitationService = new PersonalizedInvitationService({
    publicBaseUrl: globalThis.location?.origin
        ? new URL('/invitacion/', globalThis.location.origin).toString()
        : undefined
});
