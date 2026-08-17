import {
    assertRsvpAccessEventId,
    assertRsvpAccessToken,
    deserializeRsvpAccessDocument,
    isRsvpAccessExpired
} from '../../shared/rsvp-access-contract.js?v=phase54-public-rsvp-20260817';
import {
    areRsvpResponsesEquivalent,
    assertRsvpResponseSelection,
    buildRsvpResponseDocument,
    deserializeRsvpResponseDocument
} from '../../shared/rsvp-response-contract.js?v=phase54-public-rsvp-20260817';
import {
    deserializePublicRsvpConfig,
    isPublicRsvpClosed
} from '../core/rsvp-public-config-contract.js?v=phase54-public-rsvp-20260817';

function publicError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

async function createFirebaseRsvpResponseGateway() {
    const [{ db }, firestoreApi] = await Promise.all([
        import('../../admin/firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    const responseRef = (eventId, token) => firestoreApi.doc(db, 'eventos', eventId, 'rsvpResponses', token);
    return {
        serverTimestamp: () => firestoreApi.serverTimestamp(),
        async readResponse(eventId, token) {
            const snapshot = await firestoreApi.getDoc(responseRef(eventId, token));
            return snapshot.exists() ? snapshot.data() : null;
        },
        writeResponse: (eventId, token, document) => firestoreApi.setDoc(responseRef(eventId, token), document)
    };
}

export class RsvpResponseService {
    constructor({ gateway = null, gatewayFactory = createFirebaseRsvpResponseGateway, now = () => new Date() } = {}) {
        this.gateway = gateway;
        this.gatewayFactory = gatewayFactory;
        this.gatewayPromise = null;
        this.now = now;
        this.cachedResponses = new Map();
        this.inFlight = new Map();
    }

    async getGateway() {
        if (this.gateway) return this.gateway;
        if (!this.gatewayPromise) this.gatewayPromise = this.gatewayFactory();
        this.gateway = await this.gatewayPromise;
        return this.gateway;
    }

    async load({ eventId, token, access, config } = {}) {
        const context = assertContext({ eventId, token, access, config }, this.now());
        let document;
        try {
            document = await (await this.getGateway()).readResponse(context.eventId, context.token);
        } catch {
            throw publicError('rsvp-response/unavailable');
        }
        if (!document) {
            this.cachedResponses.set(context.cacheKey, null);
            return null;
        }
        try {
            const response = deserializeRsvpResponseDocument(document, {
                expectedEventId: context.eventId,
                expectedGuestId: context.access.guestId,
                guestPolicy: context.config.guestPolicy,
                passLimit: context.access.passLimit
            });
            this.cachedResponses.set(context.cacheKey, response);
            return response;
        } catch {
            throw publicError('rsvp-response/unavailable');
        }
    }

    save({ eventId, token, access, config, status, passesConfirmed, currentResponse } = {}) {
        const context = assertContext({ eventId, token, access, config }, this.now());
        if (context.config.method !== 'internal') throw publicError('rsvp-response/method-not-internal');
        if (isPublicRsvpClosed(context.config, this.now())) throw publicError('rsvp-response/closed');
        const selection = assertRsvpResponseSelection({ status, passesConfirmed }, {
            guestPolicy: context.config.guestPolicy,
            passLimit: context.access.passLimit
        });
        const persisted = this.cachedResponses.has(context.cacheKey)
            ? this.cachedResponses.get(context.cacheKey)
            : (currentResponse ?? null);
        if (areRsvpResponsesEquivalent(persisted, selection)) {
            return Promise.resolve(Object.freeze({ status: 'unchanged', response: persisted }));
        }
        if (this.inFlight.has(context.cacheKey)) return this.inFlight.get(context.cacheKey);
        const operation = this.performSave(context, selection)
            .finally(() => this.inFlight.delete(context.cacheKey));
        this.inFlight.set(context.cacheKey, operation);
        return operation;
    }

    async performSave(context, selection) {
        const gateway = await this.getGateway();
        const writeDocument = buildRsvpResponseDocument({
            eventId: context.eventId,
            guestId: context.access.guestId,
            status: selection.status,
            passesConfirmed: selection.passesConfirmed,
            respondedAt: gateway.serverTimestamp(),
            guestPolicy: context.config.guestPolicy,
            passLimit: context.access.passLimit
        });
        try {
            await gateway.writeResponse(context.eventId, context.token, writeDocument);
        } catch {
            throw publicError('rsvp-response/save-failed');
        }
        let persistedDocument;
        try {
            persistedDocument = await gateway.readResponse(context.eventId, context.token);
        } catch {
            throw publicError('rsvp-response/verification-failed');
        }
        if (!persistedDocument) throw publicError('rsvp-response/verification-failed');
        let response;
        try {
            response = deserializeRsvpResponseDocument(persistedDocument, {
                expectedEventId: context.eventId,
                expectedGuestId: context.access.guestId,
                guestPolicy: context.config.guestPolicy,
                passLimit: context.access.passLimit
            });
        } catch {
            throw publicError('rsvp-response/verification-failed');
        }
        if (!areRsvpResponsesEquivalent(response, selection)) {
            throw publicError('rsvp-response/verification-failed');
        }
        this.cachedResponses.set(context.cacheKey, response);
        return Object.freeze({ status: 'saved', response });
    }
}

function assertContext({ eventId, token, access, config }, now) {
    const safeEventId = assertRsvpAccessEventId(eventId);
    const safeToken = assertRsvpAccessToken(token);
    const safeAccess = deserializeRsvpAccessDocument(access, { expectedEventId: safeEventId });
    const safeConfig = deserializePublicRsvpConfig(config, { expectedEventId: safeEventId });
    if (!safeAccess.active) throw publicError('rsvp-response/unavailable');
    if (isRsvpAccessExpired(safeAccess.expiresAt, now)) throw publicError('rsvp-response/unavailable');
    if (!safeConfig.enabled) throw publicError('rsvp-response/unavailable');
    return Object.freeze({
        eventId: safeEventId,
        token: safeToken,
        access: safeAccess,
        config: safeConfig,
        cacheKey: `${safeEventId}/${safeToken}`
    });
}

export const rsvpResponseService = new RsvpResponseService();
