import {
    INVITATION_PUBLICATION_DOCUMENT_ID,
    createInvitationPublicationFingerprint,
    createInvitationPublicKey,
    createInvitationRevisionFingerprint,
    createInvitationRevisionId,
    deserializeInvitationPublication,
    deserializeInvitationRevision,
    serializeInvitationPublication,
    serializeInvitationRevision
} from '../core/invitation-publication-schema.js?v=phase63-public-invitation-20260817';
import {
    INVITATION_PUBLIC_COLLECTION_ID,
    createPublicInvitationProjectionFingerprint,
    serializePublicInvitationProjection
} from '../core/invitation-public-projection.js?v=phase89-dress-code-media-20260820';

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
    const publicProjectionRef = (eventId, publicKey) => firestoreApi.doc(
        db,
        'eventos',
        eventId,
        INVITATION_PUBLIC_COLLECTION_ID,
        publicKey
    );
    return {
        getCurrentUid: () => auth.currentUser?.uid ?? '',
        async runPublicationTransaction(eventId, { createPublicKey: generatePublicKey, planner }) {
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

                const publicKey = currentPublication?.publicKey ?? generatePublicKey();
                const projectionReference = publicProjectionRef(eventId, publicKey);
                const projectionSnapshot = await transaction.get(projectionReference);
                const currentPublicProjection = projectionSnapshot.exists() ? projectionSnapshot.data() : null;
                const plan = planner({
                    currentPublication,
                    currentRevision,
                    currentPublicProjection,
                    publicKey,
                    serverTimestamp: () => firestoreApi.serverTimestamp()
                });
                if (plan.status === 'unchanged') return plan;

                if (plan.revision) {
                    const targetReference = revisionRef(eventId, plan.revisionId);
                    const targetSnapshot = await transaction.get(targetReference);
                    if (targetSnapshot.exists()) throw serviceError('publication/revision-id-conflict');
                    transaction.set(targetReference, plan.revision);
                }
                if (plan.publication) transaction.set(metadataReference, plan.publication);
                transaction.set(projectionReference, plan.publicProjection);
                return plan;
            });
        }
    };
}

export class InvitationPublicationService {
    constructor({
        gateway = null,
        gatewayFactory = createFirebaseInvitationPublicationGateway,
        publicKeyFactory = createInvitationPublicKey
    } = {}) {
        this.gateway = gateway;
        this.gatewayFactory = gatewayFactory;
        this.publicKeyFactory = publicKeyFactory;
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
            let generatedPublicKey = null;
            return await gateway.runPublicationTransaction(eventId, {
                createPublicKey: () => {
                    if (!generatedPublicKey) generatedPublicKey = this.publicKeyFactory();
                    return generatedPublicKey;
                },
                planner: ({
                    currentPublication,
                    currentRevision,
                    currentPublicProjection,
                    publicKey,
                    serverTimestamp
                }) => {
                    if (!currentPublication && currentPublicProjection) {
                        throw serviceError('publication/public-key-conflict');
                    }
                    const touchedMediaRoles = draft.meta?.touchedMediaRoles ?? [];
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
                            const publicProjection = serializePublicInvitationProjection(currentRevision, {
                                eventId,
                                publicKey,
                                revisionId: currentPublication.currentRevisionId,
                                media: draft.media,
                                touchedMediaRoles
                            });
                            const projectionMatches = currentPublicProjection
                                && samePublicProjection(currentPublicProjection, publicProjection, eventId, publicKey);
                            const requiresMetadataMigration = currentPublication.schemaVersion !== 2
                                || currentPublication.publicKey !== publicKey;
                            if (projectionMatches && !requiresMetadataMigration) {
                                return Object.freeze({
                                    status: 'unchanged',
                                    eventId,
                                    publicKey,
                                    revisionId: currentPublication.currentRevisionId,
                                    revisionNumber: currentPublication.currentRevisionNumber,
                                    publication: currentPublication,
                                    revision: currentRevision,
                                    publicProjection
                                });
                            }
                            const publication = requiresMetadataMigration
                                ? serializeInvitationPublication({
                                    eventId,
                                    publicKey,
                                    currentRevisionId: currentPublication.currentRevisionId,
                                    currentRevisionNumber: currentPublication.currentRevisionNumber,
                                    publishedAt: currentPublication.publishedAt,
                                    publishedBy: currentPublication.publishedBy
                                })
                                : null;
                            return Object.freeze({
                                status: 'published',
                                reason: projectionMatches ? 'metadata-migrated' : 'projection-updated',
                                eventId,
                                publicKey,
                                revisionId: currentPublication.currentRevisionId,
                                revisionNumber: currentPublication.currentRevisionNumber,
                                publication,
                                revision: null,
                                publicProjection
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
                        publicKey,
                        currentRevisionId: revisionId,
                        currentRevisionNumber: revisionNumber,
                        publishedAt,
                        publishedBy
                    });
                    const publicProjection = serializePublicInvitationProjection(revision, {
                        eventId,
                        publicKey,
                        revisionId,
                        media: draft.media,
                        touchedMediaRoles
                    });
                    return Object.freeze({
                        status: 'published',
                        eventId,
                        publicKey,
                        revisionId,
                        revisionNumber,
                        publication,
                        revision,
                        publicProjection
                    });
                }
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

function samePublicProjection(current, expected, eventId, publicKey) {
    try {
        return createPublicInvitationProjectionFingerprint(current, {
            expectedEventId: eventId,
            expectedPublicKey: publicKey
        }) === createPublicInvitationProjectionFingerprint(expected, {
            expectedEventId: eventId,
            expectedPublicKey: publicKey
        });
    } catch {
        return false;
    }
}

export const invitationPublicationService = new InvitationPublicationService();
