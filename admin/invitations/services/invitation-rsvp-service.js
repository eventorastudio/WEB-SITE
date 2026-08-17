import {
    RSVP_DOCUMENT_ID,
    assertSafeRsvpEventId,
    createRsvpPersistenceFingerprint,
    deserializeRsvpConfig,
    normalizeRsvpTouchedPaths,
    serializeRsvpConfig
} from '../core/rsvp-persistence-schema.js?v=phase54a-rsvp-time-20260817';
import {
    createPublicRsvpProjection,
    deserializeRsvpPublicationMetadata,
    serializeRsvpPublicationMetadata
} from '../core/rsvp-publication-schema.js?v=phase54-public-rsvp-20260817';
import { normalizeRsvpConfig } from '../core/rsvp-schema.js?v=phase54a-rsvp-time-20260817';
import { deriveRsvpResponseClosesAt } from '../core/rsvp-time.js?v=phase54a-rsvp-time-20260817';
import { generateRsvpConfigKey } from '../../../shared/rsvp-access-contract.js?v=phase54-public-rsvp-20260817';

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
    const publicationRef = (eventId) => firestoreApi.doc(db, 'eventos', eventId, 'invitacion', 'rsvpPublication');
    const publicConfigRef = (eventId, configKey) => firestoreApi.doc(db, 'eventos', eventId, 'rsvpPublic', configKey);
    return {
        getCurrentUid: () => auth.currentUser?.uid ?? '',
        serverTimestamp: () => firestoreApi.serverTimestamp(),
        timestampFromDate: (value) => firestoreApi.Timestamp.fromDate(value),
        async readRsvp(eventId) {
            const snapshot = await firestoreApi.getDoc(rsvpRef(eventId));
            return snapshot.exists() ? snapshot.data() : null;
        },
        async publishRsvp(eventId, { privateDocument, updatedBy, configKeyFactory }) {
            return firestoreApi.runTransaction(db, async (transaction) => {
                const metadataReference = publicationRef(eventId);
                const metadataSnapshot = await transaction.get(metadataReference);
                let metadata;
                let configKey;
                let created;

                if (metadataSnapshot.exists()) {
                    const current = deserializeRsvpPublicationMetadata(metadataSnapshot.data(), {
                        expectedEventId: eventId
                    });
                    configKey = current.configKey;
                    metadata = serializeRsvpPublicationMetadata({
                        ...current,
                        updatedAt: firestoreApi.serverTimestamp(),
                        updatedBy
                    });
                    created = false;
                } else {
                    configKey = configKeyFactory();
                    const publicReference = publicConfigRef(eventId, configKey);
                    const publicSnapshot = await transaction.get(publicReference);
                    if (publicSnapshot.exists()) throw serviceError('rsvp-publication/config-key-conflict');
                    const timestamp = firestoreApi.serverTimestamp();
                    metadata = serializeRsvpPublicationMetadata({
                        eventId,
                        configKey,
                        createdAt: timestamp,
                        createdBy: updatedBy,
                        updatedAt: timestamp,
                        updatedBy
                    });
                    created = true;
                }

                const publicProjection = createPublicRsvpProjection(privateDocument, {
                    expectedEventId: eventId
                });
                transaction.set(rsvpRef(eventId), privateDocument);
                transaction.set(metadataReference, metadata);
                transaction.set(publicConfigRef(eventId, configKey), publicProjection);
                return { configKey, metadata, publicProjection, created };
            });
        }
    };
}

export class InvitationRsvpService {
    constructor({
        gateway = null,
        gatewayFactory = createFirebaseRsvpGateway,
        configKeyFactory = generateRsvpConfigKey
    } = {}) {
        this.gateway = gateway;
        this.gatewayFactory = gatewayFactory;
        this.gatewayPromise = null;
        this.configKeyFactory = configKeyFactory;
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
                responseClosesAt: null,
                updatedAt: null,
                updatedBy: '',
                migrated: false
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
        let responseClosesAt;
        try {
            const instant = deriveRsvpResponseClosesAt(rsvp);
            responseClosesAt = instant ? gateway.timestampFromDate(instant) : null;
        } catch (error) {
            throw serviceError(error?.code ?? 'rsvp/response-closes-at-derivation-failed', error);
        }
        const document = serializeRsvpConfig(rsvp, {
            eventId: safeEventId,
            touchedPaths,
            responseClosesAt,
            updatedAt: gateway.serverTimestamp(),
            updatedBy
        });
        const publication = await gateway.publishRsvp(safeEventId, {
            privateDocument: document,
            updatedBy,
            configKeyFactory: this.configKeyFactory
        });
        return Object.freeze({
            eventId: safeEventId,
            rsvp: normalizeRsvpConfig(rsvp),
            touchedPaths: normalizeRsvpTouchedPaths(touchedPaths),
            responseClosesAt,
            fingerprint: createRsvpPersistenceFingerprint(rsvp, { eventId: safeEventId, touchedPaths }),
            document,
            configKey: publication.configKey,
            publicProjection: publication.publicProjection,
            publicationMetadata: publication.metadata,
            publicationCreated: publication.created
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
