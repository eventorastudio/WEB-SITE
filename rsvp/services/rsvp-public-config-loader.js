import {
    assertRsvpAccessEventId,
    assertRsvpConfigKey
} from '../../shared/rsvp-access-contract.js?v=phase54-public-rsvp-20260817';
import { deserializePublicRsvpConfig } from '../core/rsvp-public-config-contract.js?v=phase54-public-rsvp-20260817';

function publicError(code = 'rsvp-public/unavailable') {
    const error = new Error(code);
    error.code = code;
    return error;
}

async function createFirebasePublicConfigGateway() {
    const [{ db }, firestoreApi] = await Promise.all([
        import('../../admin/firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    return {
        async readPublicConfig(eventId, configKey) {
            const reference = firestoreApi.doc(db, 'eventos', eventId, 'rsvpPublic', configKey);
            const snapshot = await firestoreApi.getDoc(reference);
            return snapshot.exists() ? snapshot.data() : null;
        }
    };
}

export class PublicRsvpConfigLoader {
    constructor({ gateway = null, gatewayFactory = createFirebasePublicConfigGateway } = {}) {
        this.gateway = gateway;
        this.gatewayFactory = gatewayFactory;
        this.gatewayPromise = null;
    }

    async getGateway() {
        if (this.gateway) return this.gateway;
        if (!this.gatewayPromise) this.gatewayPromise = this.gatewayFactory();
        this.gateway = await this.gatewayPromise;
        return this.gateway;
    }

    async load(eventId, configKey) {
        let safeEventId;
        let safeConfigKey;
        try {
            safeEventId = assertRsvpAccessEventId(eventId);
            safeConfigKey = assertRsvpConfigKey(configKey);
        } catch {
            throw publicError();
        }
        let document;
        try {
            document = await (await this.getGateway()).readPublicConfig(safeEventId, safeConfigKey);
        } catch (error) {
            if (isRetryableFirebaseError(error)) throw publicError('rsvp-public/error');
            throw publicError();
        }
        if (!document) throw publicError();
        try {
            const config = deserializePublicRsvpConfig(document, { expectedEventId: safeEventId });
            if (!config.enabled) throw publicError('rsvp-public/disabled');
            return config;
        } catch (error) {
            if (error?.code === 'rsvp-public/disabled') throw error;
            throw publicError();
        }
    }
}

function isRetryableFirebaseError(error) {
    return ['unavailable', 'deadline-exceeded', 'resource-exhausted', 'firestore/unavailable']
        .includes(String(error?.code ?? ''));
}

export const publicRsvpConfigLoader = new PublicRsvpConfigLoader();
