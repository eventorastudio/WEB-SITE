import {
    assertRsvpAccessEventId,
    assertRsvpAccessGuestId,
    assertRsvpAccessToken,
    buildRsvpAccessDocument,
    buildRsvpUrl,
    deserializeRsvpAccessDocument,
    generateRsvpAccessToken
} from '../../../shared/rsvp-access-contract.js';

const TOKEN_GENERATION_ATTEMPTS = 5;

function serviceError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

async function createFirebaseRsvpAccessGateway() {
    const [{ auth, db }, firestoreApi] = await Promise.all([
        import('../../firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    const guestRef = (eventId, guestId) => firestoreApi.doc(db, 'eventos', eventId, 'invitados', guestId);
    const accessRef = (eventId, token) => firestoreApi.doc(db, 'eventos', eventId, 'rsvpAccess', token);
    const readData = async (reference) => {
        const snapshot = await firestoreApi.getDoc(reference);
        return snapshot.exists() ? snapshot.data() : null;
    };
    return {
        getCurrentUid: () => auth.currentUser?.uid ?? '',
        readGuest: (eventId, guestId) => readData(guestRef(eventId, guestId)),
        readAccess: (eventId, token) => readData(accessRef(eventId, token)),
        async createAccess(eventId, token, document) {
            await firestoreApi.runTransaction(db, async (transaction) => {
                const reference = accessRef(eventId, token);
                const snapshot = await transaction.get(reference);
                if (snapshot.exists()) throw serviceError('rsvp-access/token-conflict');
                transaction.set(reference, document);
            });
        },
        updateAccess: (eventId, token, patch) => firestoreApi.updateDoc(accessRef(eventId, token), patch),
        async findAccessByGuest(eventId, guestId) {
            const accessQuery = firestoreApi.query(
                firestoreApi.collection(db, 'eventos', eventId, 'rsvpAccess'),
                firestoreApi.where('guestId', '==', guestId)
            );
            const snapshot = await firestoreApi.getDocs(accessQuery);
            return snapshot.docs.map((item) => ({ token: item.id, document: item.data() }));
        }
    };
}

export class RsvpAccessService {
    constructor({
        gateway = null,
        gatewayFactory = createFirebaseRsvpAccessGateway,
        tokenFactory = generateRsvpAccessToken,
        publicBaseUrl
    } = {}) {
        this.gateway = gateway;
        this.gatewayFactory = gatewayFactory;
        this.gatewayPromise = null;
        this.tokenFactory = tokenFactory;
        this.publicBaseUrl = publicBaseUrl;
    }

    async getGateway() {
        if (this.gateway) return this.gateway;
        if (!this.gatewayPromise) this.gatewayPromise = this.gatewayFactory();
        this.gateway = await this.gatewayPromise;
        return this.gateway;
    }

    generateToken() {
        return assertRsvpAccessToken(this.tokenFactory());
    }

    validateToken(token) {
        return assertRsvpAccessToken(token);
    }

    buildUrl(eventId, token) {
        const options = this.publicBaseUrl ? { baseUrl: this.publicBaseUrl } : undefined;
        return buildRsvpUrl(eventId, token, options);
    }

    buildDocument(input) {
        return buildRsvpAccessDocument(input);
    }

    async create({ eventId, guestId, expiresAt = null } = {}) {
        const safeEventId = assertRsvpAccessEventId(eventId);
        const safeGuestId = assertRsvpAccessGuestId(guestId);
        const gateway = await this.getGateway();
        requireUid(gateway);
        const guest = await readGuestOrThrow(gateway, safeEventId, safeGuestId);

        for (let attempt = 0; attempt < TOKEN_GENERATION_ATTEMPTS; attempt += 1) {
            const token = this.generateToken();
            const document = this.buildDocument({
                eventId: safeEventId,
                guestId: safeGuestId,
                guest,
                active: true,
                expiresAt
            });
            try {
                await gateway.createAccess(safeEventId, token, document);
            } catch (error) {
                if (isTokenConflict(error)) continue;
                throw serviceError('rsvp-access/create-failed');
            }
            const access = await this.verify(safeEventId, token, { expectedGuestId: safeGuestId });
            return Object.freeze({
                eventId: safeEventId,
                guestId: safeGuestId,
                token,
                url: this.buildUrl(safeEventId, token),
                access
            });
        }
        throw serviceError('rsvp-access/unique-token-unavailable');
    }

    async rotate({ eventId, guestId, currentToken, expiresAt } = {}) {
        const safeEventId = assertRsvpAccessEventId(eventId);
        const safeGuestId = assertRsvpAccessGuestId(guestId);
        const safeCurrentToken = assertRsvpAccessToken(currentToken);
        const current = await this.readInternal(safeEventId, safeCurrentToken, { expectedGuestId: safeGuestId });
        if (!current.active) throw serviceError('rsvp-access/inactive');

        const replacement = await this.create({
            eventId: safeEventId,
            guestId: safeGuestId,
            expiresAt: expiresAt === undefined ? current.expiresAt : expiresAt
        });
        try {
            await this.revoke({
                eventId: safeEventId,
                token: safeCurrentToken,
                expectedGuestId: safeGuestId
            });
        } catch {
            throw serviceError('rsvp-access/rotation-revoke-failed');
        }
        return Object.freeze({ ...replacement, previousRevoked: true });
    }

    async revoke({ eventId, token, expectedGuestId = null } = {}) {
        const safeEventId = assertRsvpAccessEventId(eventId);
        const safeToken = assertRsvpAccessToken(token);
        const current = await this.readInternal(safeEventId, safeToken, { expectedGuestId });
        if (!current.active) return Object.freeze({ access: current, changed: false });
        const gateway = await this.getGateway();
        requireUid(gateway);
        try {
            await gateway.updateAccess(safeEventId, safeToken, {
                active: false
            });
        } catch {
            throw serviceError('rsvp-access/revoke-failed');
        }
        const access = await this.verify(safeEventId, safeToken, { expectedGuestId: current.guestId });
        if (access.active) throw serviceError('rsvp-access/revoke-verification-failed');
        return Object.freeze({ access, changed: true });
    }

    async sync({ eventId, token } = {}) {
        const safeEventId = assertRsvpAccessEventId(eventId);
        const safeToken = assertRsvpAccessToken(token);
        const current = await this.readInternal(safeEventId, safeToken);
        const gateway = await this.getGateway();
        requireUid(gateway);
        const guest = await readGuestOrThrow(gateway, safeEventId, current.guestId);
        const projected = this.buildDocument({
            eventId: safeEventId,
            guestId: current.guestId,
            guest,
            active: current.active,
            expiresAt: current.expiresAt
        });
        try {
            await gateway.updateAccess(safeEventId, safeToken, {
                displayName: projected.displayName,
                passLimit: projected.passLimit
            });
        } catch {
            throw serviceError('rsvp-access/sync-failed');
        }
        return this.verify(safeEventId, safeToken, { expectedGuestId: current.guestId });
    }

    async syncGuest({ eventId, guestId } = {}) {
        const safeEventId = assertRsvpAccessEventId(eventId);
        const safeGuestId = assertRsvpAccessGuestId(guestId);
        const records = await this.findByGuest({ eventId: safeEventId, guestId: safeGuestId });
        const synced = [];
        for (const record of records) {
            synced.push(await this.sync({ eventId: safeEventId, token: record.token }));
        }
        return Object.freeze(synced);
    }

    async findByGuest({ eventId, guestId } = {}) {
        const safeEventId = assertRsvpAccessEventId(eventId);
        const safeGuestId = assertRsvpAccessGuestId(guestId);
        const gateway = await this.getGateway();
        let records;
        try {
            records = await gateway.findAccessByGuest(safeEventId, safeGuestId);
        } catch {
            throw serviceError('rsvp-access/find-failed');
        }
        return Object.freeze((records ?? []).map(({ token, document }) => Object.freeze({
            token: assertRsvpAccessToken(token),
            access: deserializeRsvpAccessDocument(document, {
                expectedEventId: safeEventId,
                expectedGuestId: safeGuestId
            })
        })));
    }

    async readInternal(eventId, token, { expectedGuestId = null } = {}) {
        const safeEventId = assertRsvpAccessEventId(eventId);
        const safeToken = assertRsvpAccessToken(token);
        const gateway = await this.getGateway();
        let document;
        try {
            document = await gateway.readAccess(safeEventId, safeToken);
        } catch {
            throw serviceError('rsvp-access/read-failed');
        }
        if (!document) throw serviceError('rsvp-access/not-found');
        return deserializeRsvpAccessDocument(document, {
            expectedEventId: safeEventId,
            expectedGuestId
        });
    }

    async verify(eventId, token, { expectedGuestId = null } = {}) {
        try {
            return await this.readInternal(eventId, token, { expectedGuestId });
        } catch {
            throw serviceError('rsvp-access/verification-failed');
        }
    }
}

function requireUid(gateway) {
    const uid = String(gateway.getCurrentUid?.() ?? '');
    if (!uid) throw serviceError('rsvp-access/unauthenticated');
    return uid;
}

async function readGuestOrThrow(gateway, eventId, guestId) {
    let guest;
    try {
        guest = await gateway.readGuest(eventId, guestId);
    } catch {
        throw serviceError('rsvp-access/guest-read-failed');
    }
    if (!guest) throw serviceError('rsvp-access/guest-not-found');
    return guest;
}

function isTokenConflict(error) {
    return error?.code === 'rsvp-access/token-conflict'
        || error?.message === 'rsvp-access/token-conflict';
}

export const rsvpAccessService = new RsvpAccessService();
