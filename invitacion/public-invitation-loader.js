import {
    INVITATION_PUBLIC_COLLECTION_ID,
    deserializePublicInvitationProjection
} from '../admin/invitations/core/invitation-public-projection.js?v=phase171-demo-mode-20260826';
import { isInvitationPublicKey } from '../admin/invitations/core/invitation-publication-schema.js?v=phase171-demo-mode-20260826';

const SAFE_EVENT_ID = /^[A-Za-z0-9_-]{1,150}$/;

function unavailable(cause = null) {
    const error = new Error('public-invitation/unavailable');
    error.code = 'public-invitation/unavailable';
    error.cause = cause ?? undefined;
    return error;
}

async function createFirebasePublicInvitationGateway() {
    const [{ db }, firestoreApi] = await Promise.all([
        import('../admin/firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    return {
        async readProjection(eventId, publicKey) {
            const reference = firestoreApi.doc(
                db,
                'eventos',
                eventId,
                INVITATION_PUBLIC_COLLECTION_ID,
                publicKey
            );
            const snapshot = await firestoreApi.getDoc(reference);
            return snapshot.exists() ? snapshot.data() : null;
        }
    };
}

export class PublicInvitationLoader {
    constructor({ gateway = null, gatewayFactory = createFirebasePublicInvitationGateway } = {}) {
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

    async load(eventId, publicKey) {
        const safeEventId = String(eventId ?? '');
        const safePublicKey = String(publicKey ?? '');
        if (!SAFE_EVENT_ID.test(safeEventId) || !isInvitationPublicKey(safePublicKey)) {
            throw unavailable();
        }
        try {
            const document = await (await this.getGateway()).readProjection(safeEventId, safePublicKey);
            if (!document) throw unavailable();
            return deserializePublicInvitationProjection(document, {
                expectedEventId: safeEventId,
                expectedPublicKey: safePublicKey
            });
        } catch (error) {
            if (error?.code === 'public-invitation/unavailable') throw error;
            throw unavailable(error);
        }
    }
}

export const publicInvitationLoader = new PublicInvitationLoader();
