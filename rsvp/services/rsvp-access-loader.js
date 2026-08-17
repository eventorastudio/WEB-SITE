import {
    assertRsvpAccessEventId,
    assertRsvpAccessToken,
    isRsvpAccessExpired,
    parseRsvpRoute,
    toPublicRsvpAccess
} from '../../shared/rsvp-access-contract.js?v=phase54-public-rsvp-20260817';

function publicError(code = 'rsvp-access/unavailable') {
    const error = new Error(code);
    error.code = code;
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
        } catch (error) {
            if (isRetryableFirebaseError(error)) throw publicError('rsvp-access/error');
            throw publicError();
        }
        if (!document) throw publicError();

        try {
            const access = toPublicRsvpAccess(document, { expectedEventId: safeEventId });
            if (!access.active) throw publicError('rsvp-access/revoked');
            if (isRsvpAccessExpired(access.expiresAt, this.now())) throw publicError('rsvp-access/expired');
            return access;
        } catch (error) {
            if (['rsvp-access/revoked', 'rsvp-access/expired'].includes(error?.code)) throw error;
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

function isRetryableFirebaseError(error) {
    return ['unavailable', 'deadline-exceeded', 'resource-exhausted', 'firestore/unavailable']
        .includes(String(error?.code ?? ''));
}

function unavailableResult() {
    return Object.freeze({
        status: 'unavailable',
        access: null,
        code: 'rsvp-access/unavailable'
    });
}

export const publicRsvpAccessLoader = new PublicRsvpAccessLoader();
