import {
    assertRsvpAccessEventId,
    assertRsvpAccessToken,
    isRsvpAccessExpired,
    parseRsvpRoute,
    toPublicRsvpAccess
} from '../../shared/rsvp-access-contract.js';

function publicError() {
    const error = new Error('rsvp-access/unavailable');
    error.code = 'rsvp-access/unavailable';
    return error;
}

async function createFirebasePublicAccessGateway() {
    const [{ db }, firestoreApi] = await Promise.all([
        import('../../admin/firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    return {
        async readPublicAccess(eventId, token) {
            const reference = firestoreApi.doc(db, 'eventos', eventId, 'rsvpAccess', token);
            const snapshot = await firestoreApi.getDoc(reference);
            return snapshot.exists() ? snapshot.data() : null;
        }
    };
}

export class PublicRsvpAccessLoader {
    constructor({ gateway = null, gatewayFactory = createFirebasePublicAccessGateway, now = () => new Date() } = {}) {
        this.gateway = gateway;
        this.gatewayFactory = gatewayFactory;
        this.gatewayPromise = null;
        this.now = now;
    }

    async getGateway() {
        if (this.gateway) return this.gateway;
        if (!this.gatewayPromise) this.gatewayPromise = this.gatewayFactory();
        this.gateway = await this.gatewayPromise;
        return this.gateway;
    }

    async load(eventId, token) {
        let safeEventId;
        let safeToken;
        try {
            safeEventId = assertRsvpAccessEventId(eventId);
            safeToken = assertRsvpAccessToken(token);
        } catch {
            throw publicError();
        }

        let document;
        try {
            document = await (await this.getGateway()).readPublicAccess(safeEventId, safeToken);
        } catch {
            throw publicError();
        }
        if (!document) throw publicError();

        try {
            const access = toPublicRsvpAccess(document, { expectedEventId: safeEventId });
            if (!access.active || isRsvpAccessExpired(access.expiresAt, this.now())) throw publicError();
            return access;
        } catch {
            throw publicError();
        }
    }

    async loadRoute(input) {
        const route = parseRsvpRoute(input);
        if (!route.valid) return unavailableResult();
        try {
            const access = await this.load(route.eventId, route.token);
            return Object.freeze({ status: 'ready', access });
        } catch {
            return unavailableResult();
        }
    }
}

function unavailableResult() {
    return Object.freeze({
        status: 'unavailable',
        access: null,
        code: 'rsvp-access/unavailable'
    });
}

export const publicRsvpAccessLoader = new PublicRsvpAccessLoader();
