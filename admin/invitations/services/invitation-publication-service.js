import {
    INVITATION_PUBLICATION_DOCUMENT_ID,
    createInvitationPublicationFingerprint,
    createInvitationRevisionFingerprint,
    createInvitationRevisionId,
    deserializeInvitationPublication,
    deserializeInvitationRevision,
    serializeInvitationPublication,
    serializeInvitationRevision
} from '../core/invitation-publication-schema.js?v=phase62-versioned-publication-20260817';

function serviceError(code, cause = null, details = {}) {
    const error = new Error(code);
    error.code = code;
    error.cause = cause ?? undefined;
    Object.assign(error, details);
    return error;
}

async function createFirebaseInvitationPublicationGateway() {
    const [{ auth, db }, firestoreApi] = await Promise.all([
        import('../../firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    const publicationRef = (eventId) => firestoreApi.doc(
        db,
        'eventos',
        eventId,
        'invitacion',
        INVITATION_PUBLICATION_DOCUMENT_ID
    );
    const revisionRef = (eventId, revisionId) => firestoreApi.doc(
        publicationRef(eventId),
        'revisions',
        revisionId
    );
    return {
        getCurrentUid: () => auth.currentUser?.uid ?? '',
        async runPublicationTransaction(eventId, planner) {
            return firestoreApi.runTransaction(db, async (transaction) => {
                const metadataReference = publicationRef(eventId);
                const metadataSnapshot = await transaction.get(metadataReference);
                let currentPublication = null;
                let currentRevision = null;

                if (metadataSnapshot.exists()) {
                    currentPublication = deserializeInvitationPublication(metadataSnapshot.data(), eventId);
                    const currentRevisionReference = revisionRef(eventId, currentPublication.currentRevisionId);
                    const currentRevisionSnapshot = await transaction.get(currentRevisionReference);
                    if (!currentRevisionSnapshot.exists()) {
                        throw serviceError('publication/current-revision-missing');
                    }
                    currentRevision = deserializeInvitationRevision(currentRevisionSnapshot.data(), eventId, {
                        expectedRevisionId: currentPublication.currentRevisionId,
                        expectedRevisionNumber: currentPublication.currentRevisionNumber
                    });
                }

                const plan = planner({
                    currentPublication,
                    currentRevision,
                    serverTimestamp: () => firestoreApi.serverTimestamp()
                });
                if (plan.status === 'unchanged') return plan;

                const targetReference = revisionRef(eventId, plan.revisionId);
                const targetSnapshot = await transaction.get(targetReference);
                if (targetSnapshot.exists()) throw serviceError('publication/revision-id-conflict');
                transaction.set(targetReference, plan.revision);
                transaction.set(metadataReference, plan.publication);
                return plan;
            });
        }
    };
}

export class InvitationPublicationService {
    constructor({ gateway = null, gatewayFactory = createFirebaseInvitationPublicationGateway } = {}) {
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

    async publish({ eventId, draftEventId, draft } = {}) {
        if (eventId !== draftEventId || draft?.eventId !== eventId) {
            throw serviceError('publication/event-ownership-mismatch');
        }
        const gateway = await this.getGateway();
        const publishedBy = String(gateway.getCurrentUid?.() ?? '');
        if (!publishedBy) throw serviceError('publication/unauthenticated');

        let draftFingerprint;
        try {
            draftFingerprint = createInvitationPublicationFingerprint(draft, { eventId });
        } catch (error) {
            throw serviceError(error?.code ?? 'publication/invalid-draft', error, {
                validationErrors: error?.validationErrors
            });
        }

        try {
            return await gateway.runPublicationTransaction(eventId, ({
                currentPublication,
                currentRevision,
                serverTimestamp
            }) => {
                if (currentPublication && currentRevision) {
                    const currentFingerprint = createInvitationRevisionFingerprint(
                        currentRevision,
                        eventId,
                        {
                            expectedRevisionId: currentPublication.currentRevisionId,
                            expectedRevisionNumber: currentPublication.currentRevisionNumber
                        }
                    );
                    if (currentFingerprint === draftFingerprint) {
                        return Object.freeze({
                            status: 'unchanged',
                            eventId,
                            revisionId: currentPublication.currentRevisionId,
                            revisionNumber: currentPublication.currentRevisionNumber,
                            publication: currentPublication,
                            revision: currentRevision
                        });
                    }
                } else if (currentPublication || currentRevision) {
                    throw serviceError('publication/incomplete-current-state');
                }

                const revisionNumber = (currentPublication?.currentRevisionNumber ?? 0) + 1;
                const revisionId = createInvitationRevisionId(revisionNumber);
                const publishedAt = serverTimestamp();
                const revision = serializeInvitationRevision(draft, {
                    eventId,
                    revisionNumber,
                    publishedAt,
                    publishedBy
                });
                const publication = serializeInvitationPublication({
                    eventId,
                    currentRevisionId: revisionId,
                    currentRevisionNumber: revisionNumber,
                    publishedAt,
                    publishedBy
                });
                return Object.freeze({
                    status: 'published',
                    eventId,
                    revisionId,
                    revisionNumber,
                    publication,
                    revision
                });
            });
        } catch (error) {
            if (String(error?.code ?? '').startsWith('publication/')) throw error;
            throw serviceError('publication/transaction-failed', error);
        }
    }

    async publishState(state, eventId) {
        if (!state?.getSnapshot) throw serviceError('publication/invalid-state-adapter');
        const snapshot = state.getSnapshot();
        return this.publish({
            eventId,
            draftEventId: snapshot.draft?.eventId,
            draft: snapshot.draft
        });
    }
}

export const invitationPublicationService = new InvitationPublicationService();
