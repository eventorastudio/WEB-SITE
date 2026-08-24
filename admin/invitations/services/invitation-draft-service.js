import {
    INVITATION_DRAFT_DOCUMENT_ID,
    createInvitationDraftFingerprint,
    deserializeInvitationDraft,
    serializeInvitationDraft
} from '../core/draft-persistence-schema.js?v=phase123-draft-migration-architecture-20260824';

function serviceError(code, cause = null, details = {}) {
    const error = new Error(code);
    error.code = code;
    error.cause = cause ?? undefined;
    Object.assign(error, details);
    return error;
}

async function createFirebaseInvitationDraftGateway() {
    const [{ auth, db }, firestoreApi] = await Promise.all([
        import('../../firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    const draftRef = (eventId) => firestoreApi.doc(
        db,
        'eventos',
        eventId,
        'invitacion',
        INVITATION_DRAFT_DOCUMENT_ID
    );
    return {
        getCurrentUid: () => auth.currentUser?.uid ?? '',
        serverTimestamp: () => firestoreApi.serverTimestamp(),
        async readDraft(eventId) {
            const snapshot = await firestoreApi.getDoc(draftRef(eventId));
            return snapshot.exists() ? snapshot.data() : null;
        },
        async writeDraft(eventId, document) {
            await firestoreApi.setDoc(draftRef(eventId), document);
        }
    };
}

export class InvitationDraftService {
    constructor({ gateway = null, gatewayFactory = createFirebaseInvitationDraftGateway } = {}) {
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

    async load(eventId) {
        const gateway = await this.getGateway();
        let document;
        try {
            document = await gateway.readDraft(eventId);
        } catch (error) {
            throw serviceError('draft/read-failed', error);
        }
        if (!document) return Object.freeze({ exists: false, eventId, draft: null });
        try {
            return Object.freeze({ exists: true, ...deserializeInvitationDraft(document, eventId) });
        } catch (error) {
            throw serviceError(error?.code ?? 'draft/invalid-persisted-document', error);
        }
    }

    async hydrateState(state, eventId) {
        if (!state?.hydrateDraft) throw serviceError('draft/invalid-state-adapter');
        const loaded = await this.load(eventId);
        if (loaded.exists) state.hydrateDraft(loaded);
        return loaded;
    }

    async save({ eventId, draftEventId, draft } = {}) {
        if (eventId !== draftEventId || draft?.eventId !== eventId) {
            throw serviceError('draft/event-ownership-mismatch');
        }
        const gateway = await this.getGateway();
        const updatedBy = String(gateway.getCurrentUid?.() ?? '');
        if (!updatedBy) throw serviceError('draft/unauthenticated');
        let document;
        try {
            document = serializeInvitationDraft(draft, {
                eventId,
                updatedAt: gateway.serverTimestamp(),
                updatedBy
            });
        } catch (error) {
            throw serviceError(error?.code ?? 'draft/serialization-failed', error, {
                validationErrors: error?.validationErrors
            });
        }
        try {
            await gateway.writeDraft(eventId, document);
        } catch (error) {
            throw serviceError('draft/write-failed', error);
        }
        return Object.freeze({
            eventId,
            document,
            fingerprint: createInvitationDraftFingerprint(draft, { eventId })
        });
    }

    async saveState(state, eventId) {
        if (!state?.getSnapshot || !state?.markDraftPersisted) {
            throw serviceError('draft/invalid-state-adapter');
        }
        const before = state.getSnapshot();
        const result = await this.save({
            eventId,
            draftEventId: before.draft?.eventId,
            draft: before.draft
        });
        const after = state.getSnapshot();
        let currentFingerprint = null;
        try {
            currentFingerprint = createInvitationDraftFingerprint(after.draft, {
                eventId: after.draft?.eventId
            });
        } catch {
            // El write anterior sí terminó; un cambio local nuevo e inválido sólo debe conservar el dirty.
        }
        const clean = currentFingerprint !== null && currentFingerprint === result.fingerprint;
        if (clean) state.markDraftPersisted();
        return Object.freeze({ ...result, clean });
    }
}

export const invitationDraftService = new InvitationDraftService();
