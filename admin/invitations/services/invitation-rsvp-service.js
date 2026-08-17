import {
    RSVP_DOCUMENT_ID,
    assertSafeRsvpEventId,
    createRsvpPersistenceFingerprint,
    deserializeRsvpConfig,
    normalizeRsvpTouchedPaths,
    serializeRsvpConfig
} from '../core/rsvp-persistence-schema.js?v=phase52-rsvp-persistence-20260816';
import { normalizeRsvpConfig } from '../core/rsvp-schema.js?v=phase52-rsvp-persistence-20260816';

function serviceError(code, cause = null, details = {}) {
    const error = new Error(code);
    error.code = code;
    error.cause = cause ?? undefined;
    Object.assign(error, details);
    return error;
}

async function createFirebaseRsvpGateway() {
    const [{ auth, db }, firestoreApi] = await Promise.all([
        import('../../firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    const rsvpRef = (eventId) => firestoreApi.doc(db, 'eventos', eventId, 'invitacion', RSVP_DOCUMENT_ID);
    return {
        getCurrentUid: () => auth.currentUser?.uid ?? '',
        serverTimestamp: () => firestoreApi.serverTimestamp(),
        async readRsvp(eventId) {
            const snapshot = await firestoreApi.getDoc(rsvpRef(eventId));
            return snapshot.exists() ? snapshot.data() : null;
        },
        writeRsvp: (eventId, document) => firestoreApi.setDoc(rsvpRef(eventId), document)
    };
}

export class InvitationRsvpService {
    constructor({ gateway = null, gatewayFactory = createFirebaseRsvpGateway } = {}) {
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

    assertOwnership(eventId, draftEventId) {
        const safeEventId = assertSafeRsvpEventId(eventId);
        if (safeEventId !== assertSafeRsvpEventId(draftEventId)) {
            throw serviceError('rsvp/event-ownership-mismatch');
        }
        return safeEventId;
    }

    async load(eventId) {
        const safeEventId = assertSafeRsvpEventId(eventId);
        const document = await (await this.getGateway()).readRsvp(safeEventId);
        if (!document) {
            return Object.freeze({
                exists: false,
                eventId: safeEventId,
                rsvp: normalizeRsvpConfig(),
                touchedPaths: [],
                schemaVersion: null,
                contentSchemaVersion: null,
                updatedAt: null,
                updatedBy: ''
            });
        }
        return Object.freeze({ exists: true, ...deserializeRsvpConfig(document, safeEventId) });
    }

    async hydrateState(state, eventId) {
        if (!state?.getSnapshot || !state?.hydrateRsvp) throw serviceError('rsvp/invalid-state-adapter');
        const snapshot = state.getSnapshot();
        const safeEventId = this.assertOwnership(eventId, snapshot.draft?.eventId);
        const persisted = await this.load(safeEventId);
        if (persisted.exists) {
            state.hydrateRsvp(persisted.rsvp, { touchedPaths: persisted.touchedPaths });
        }
        return persisted;
    }

    async save({ eventId, draftEventId, rsvp, touchedPaths = [] }) {
        const safeEventId = this.assertOwnership(eventId, draftEventId);
        const gateway = await this.getGateway();
        const updatedBy = String(gateway.getCurrentUid?.() ?? '');
        if (!updatedBy) throw serviceError('rsvp/unauthenticated');
        const document = serializeRsvpConfig(rsvp, {
            eventId: safeEventId,
            touchedPaths,
            updatedAt: gateway.serverTimestamp(),
            updatedBy
        });
        await gateway.writeRsvp(safeEventId, document);
        return Object.freeze({
            eventId: safeEventId,
            rsvp: normalizeRsvpConfig(rsvp),
            touchedPaths: normalizeRsvpTouchedPaths(touchedPaths),
            fingerprint: createRsvpPersistenceFingerprint(rsvp, { eventId: safeEventId, touchedPaths }),
            document
        });
    }

    async saveState(state, eventId) {
        if (!state?.getSnapshot || !state?.markRsvpPersisted) throw serviceError('rsvp/invalid-state-adapter');
        const before = state.getSnapshot();
        const result = await this.save({
            eventId,
            draftEventId: before.draft?.eventId,
            rsvp: before.draft?.content?.rsvp,
            touchedPaths: before.draft?.meta?.touchedPaths
        });
        const after = state.getSnapshot();
        const currentFingerprint = createRsvpPersistenceFingerprint(after.draft?.content?.rsvp, {
            eventId: after.draft?.eventId,
            touchedPaths: after.draft?.meta?.touchedPaths
        });
        const clean = currentFingerprint === result.fingerprint;
        if (clean) state.markRsvpPersisted();
        return Object.freeze({ ...result, clean });
    }
}

export const invitationRsvpService = new InvitationRsvpService();
