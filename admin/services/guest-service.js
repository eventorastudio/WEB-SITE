// Persistencia de invitados. Toda creación/importación cruza el contrato puro
// compartido antes de llegar a Firestore.

import { db } from '../firebase.js';
import { authService } from './auth-service.js';
import { USER_ROLES } from '../core/roles.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    where,
    limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
    GUEST_ACCESS_TYPES,
    GUEST_STATUSES,
    GuestContractError,
    generateGuestQrToken,
    generateGuestVisibleCode,
    normalizeGuestData,
    normalizeGuestForCreate,
    normalizeGuestForUpdate,
    normalizeStoredGuestData,
    resolveGuestPassState,
    supportsQrAccess
} from '../../shared/guest-contract.js';
import {
    findNextAvailableGuestSequence
} from '../../shared/guest-numbering.js';
import { createEventStatsMutation } from '../../shared/event-stats.js';
import { eventStatsService } from './event-stats-service.js';

export {
    GUEST_ACCESS_TYPES,
    GUEST_STATUSES,
    normalizeGuestData,
    normalizeGuestForCreate,
    normalizeGuestForUpdate,
    normalizeStoredGuestData,
    resolveGuestPassState,
    supportsQrAccess
} from '../../shared/guest-contract.js';

const IMPORT_BATCH_SIZE = 400;
const UNIQUE_GENERATION_ATTEMPTS = 8;

async function getGuestNumberingState(eventId) {
    const snapshot = await getDoc(doc(db, 'eventos', eventId));
    if (!snapshot.exists()) throw new Error('guest/event-not-found');
    const data = snapshot.data();
    if (data.guestRenumberingInProgress === true || data.checkinRenumberingInProgress === true) {
        throw new Error('guest/renumbering-in-progress');
    }
    return {
        finalized: data.guestListFinalized === true,
        sequence: Number.isSafeInteger(data.guestSequence) && data.guestSequence >= 0 ? data.guestSequence : 0
    };
}

function assertTemporaryNumberingAllowed(eventSnapshot) {
    if (!eventSnapshot.exists()) throw new Error('guest/event-not-found');
    const event = eventSnapshot.data();
    if (event.guestRenumberingInProgress === true || event.checkinRenumberingInProgress === true) {
        throw new Error('guest/renumbering-in-progress');
    }
    if (event.guestListFinalized === true) throw new Error('guest/list-finalized-retry');
}

function assertNoRenumbering(eventSnapshot) {
    if (!eventSnapshot.exists()) throw new Error('guest/event-not-found');
    if (eventSnapshot.data().guestRenumberingInProgress === true
        || eventSnapshot.data().checkinRenumberingInProgress === true) {
        throw new Error('guest/renumbering-in-progress');
    }
}

function sanitizeGuestDoc(docSnap, { includeQrToken = false } = {}) {
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    const guest = {
        ...normalizeStoredGuestData(data, { documentId: docSnap.id }),
        id: docSnap.id,
        fechaCreacion: toIsoString(data.fechaCreacion),
        fechaActualizacion: toIsoString(data.fechaActualizacion),
        horaLlegada: toIsoString(data.horaLlegada)
    };
    if (!includeQrToken) delete guest.qrToken;
    return guest;
}

function toIsoString(value) {
    return value?.toDate ? value.toDate().toISOString() : value ?? null;
}

function cleanGuestInput(guest) {
    const payload = {};
    Object.entries(guest || {}).forEach(([key, value]) => {
        if (['id', 'fechaCreacion', 'fechaActualizacion', 'checkinSecuencia'].includes(key) || value === undefined) return;
        if (key === 'codigoInvitado' && value === '') return;
        payload[key] = value;
    });
    return payload;
}

function toFirestoreGuest(guest) {
    return {
        codigoInvitado: guest.codigoInvitado,
        nombre: guest.nombre,
        correo: guest.correo,
        telefono: guest.telefono,
        pases: guest.pases,
        pasesUtilizados: guest.pasesUtilizados,
        pasesDisponibles: guest.pasesDisponibles,
        checkinSecuencia: guest.checkinSecuencia,
        mesa: guest.mesa,
        estado: guest.estado,
        confirmado: guest.confirmado,
        llegadaRegistrada: guest.llegadaRegistrada,
        horaLlegada: guest.llegadaRegistrada ? (guest.horaLlegada || serverTimestamp()) : null,
        tipoAcceso: guest.tipoAcceso,
        qrToken: guest.qrToken,
        qrActivo: guest.qrActivo,
        notas: guest.notas
    };
}

async function fieldValueExists(eventId, fieldName, value, excludedDocumentId = '') {
    if (!value) return false;
    const snapshot = await getDocs(query(
        collection(db, 'eventos', eventId, 'invitados'),
        where(fieldName, '==', value),
        limit(2)
    ));
    return snapshot.docs.some((item) => item.id !== excludedDocumentId);
}

async function prepareGuestForCreate(eventId, documentRef, input) {
    const ownInput = cleanGuestInput(input);
    const suppliedCode = String(ownInput.codigoInvitado || '').trim();
    const code = suppliedCode || generateGuestVisibleCode(documentRef.id);
    if (await fieldValueExists(eventId, 'codigoInvitado', code)) {
        throw new GuestContractError('guest/duplicate-code');
    }

    let token = ownInput.qrToken;
    for (let attempt = 0; attempt < UNIQUE_GENERATION_ATTEMPTS; attempt += 1) {
        const guest = normalizeGuestForCreate({
            ...ownInput,
            codigoInvitado: code,
            ...(token ? { qrToken: token } : {})
        }, { documentId: documentRef.id });
        if (!guest.qrToken || !(await fieldValueExists(eventId, 'qrToken', guest.qrToken))) return guest;
        if (token) throw new GuestContractError('guest/duplicate-qr-token');
        token = generateGuestQrToken();
    }
    throw new GuestContractError('guest/unique-token-unavailable');
}

async function prepareUniqueQrToken(eventId, input) {
    const ownInput = cleanGuestInput(input);
    const suppliedToken = typeof ownInput.qrToken === 'string' && ownInput.qrToken.trim()
        ? ownInput.qrToken.trim()
        : null;
    let token = suppliedToken;
    for (let attempt = 0; attempt < UNIQUE_GENERATION_ATTEMPTS; attempt += 1) {
        const preview = normalizeGuestForCreate({
            ...ownInput,
            codigoInvitado: 'INV-PENDING',
            ...(token ? { qrToken: token } : {})
        }, { documentId: 'INV-PENDING' });
        if (!preview.qrToken || !(await fieldValueExists(eventId, 'qrToken', preview.qrToken))) {
            return preview.qrToken;
        }
        if (suppliedToken) throw new GuestContractError('guest/duplicate-qr-token');
        token = generateGuestQrToken();
    }
    throw new GuestContractError('guest/unique-token-unavailable');
}

async function createFinalizedGuest(eventId, input) {
    const ownInput = cleanGuestInput(input);
    const token = await prepareUniqueQrToken(eventId, ownInput);
    const eventRef = doc(db, 'eventos', eventId);
    return runTransaction(db, async (transaction) => {
        const eventSnapshot = await transaction.get(eventRef);
        if (!eventSnapshot.exists()) throw new Error('guest/event-not-found');
        const event = eventSnapshot.data();
        if (event.guestRenumberingInProgress === true || event.checkinRenumberingInProgress === true) {
            throw new Error('guest/renumbering-in-progress');
        }
        if (event.guestListFinalized !== true) throw new Error('guest/list-not-finalized');

        const currentSequence = Number.isSafeInteger(event.guestSequence) && event.guestSequence >= 0
            ? event.guestSequence
            : 0;
        const allocation = await findNextAvailableGuestSequence(currentSequence, async (candidateId) => {
            const candidateRef = doc(db, 'eventos', eventId, 'invitados', candidateId);
            const candidateSnapshot = await transaction.get(candidateRef);
            return candidateSnapshot.exists();
        });
        const guestRef = doc(db, 'eventos', eventId, 'invitados', allocation.id);
        const guest = normalizeGuestForCreate({
            ...ownInput,
            codigoInvitado: allocation.id,
            ...(token ? { qrToken: token } : {})
        }, { documentId: allocation.id });

        const timestamp = serverTimestamp();
        transaction.set(guestRef, {
            ...toFirestoreGuest(guest),
            fechaCreacion: timestamp,
            fechaActualizacion: timestamp
        });
        transaction.update(eventRef, {
            guestSequence: allocation.sequence,
            fechaActualizacion: timestamp,
            ...createEventStatsMutation(event, [{ after: guest }], timestamp)
        });
        return { id: allocation.id, guest };
    });
}

async function reconcileEventStats(eventId) {
    try {
        return await eventStatsService.syncEventStats(eventId);
    } catch (error) {
        // La mutación atómica ya actualizó un resumen canónico existente. Esta
        // reconciliación protege datos legacy y detecta escrituras externas.
        console.error('[GuestService] No fue posible reconciliar estadísticas:', error);
        return null;
    }
}

function buildExistingIdentityIndex(snapshot) {
    const codes = new Set();
    const tokens = new Set();
    snapshot.docs.forEach((item) => {
        const data = item.data();
        if (typeof data.codigoInvitado === 'string' && data.codigoInvitado.trim()) codes.add(data.codigoInvitado.trim());
        if (typeof data.qrToken === 'string' && data.qrToken.trim()) tokens.add(data.qrToken.trim());
    });
    return { codes, tokens };
}

function prepareGuestBatchItem(documentRef, input, identities) {
    const ownInput = cleanGuestInput(input);
    const code = String(ownInput.codigoInvitado || '').trim() || generateGuestVisibleCode(documentRef.id);
    if (identities.codes.has(code)) throw new GuestContractError('guest/duplicate-code');

    let token = ownInput.qrToken;
    for (let attempt = 0; attempt < UNIQUE_GENERATION_ATTEMPTS; attempt += 1) {
        const guest = normalizeGuestForCreate({
            ...ownInput,
            codigoInvitado: code,
            ...(token ? { qrToken: token } : {})
        }, { documentId: documentRef.id });
        if (!guest.qrToken || !identities.tokens.has(guest.qrToken)) {
            identities.codes.add(guest.codigoInvitado);
            if (guest.qrToken) identities.tokens.add(guest.qrToken);
            return guest;
        }
        if (token) throw new GuestContractError('guest/duplicate-qr-token');
        token = generateGuestQrToken();
    }
    throw new GuestContractError('guest/unique-token-unavailable');
}

function sortGuestsByName(guests) {
    return [...guests].sort((left, right) => String(left.nombre || '').localeCompare(
        String(right.nombre || ''),
        'es',
        { sensitivity: 'base', numeric: true }
    ));
}

function createImportError(error, summary) {
    const importError = new Error(`guest/batch-import-failed: ${error.message}`);
    importError.completedBatches = summary.completedBatches;
    importError.totalBatches = summary.totalBatches;
    importError.importedCount = summary.guests.length;
    importError.guests = summary.guests;
    return importError;
}

function notifyProgress(callback, payload) {
    if (typeof callback !== 'function') return;
    try {
        callback(payload);
    } catch (error) {
        console.warn('[GuestService] El callback de progreso falló:', error);
    }
}

function wrapGuestServiceError(operation, error) {
    if (error instanceof GuestContractError || String(error?.code || error?.message || '').startsWith('guest/')) {
        throw error;
    }
    const wrapped = new Error(error?.message || `guest/${operation}-failed`);
    wrapped.code = error?.code || `guest/${operation}-failed`;
    wrapped.cause = error;
    throw wrapped;
}

export const guestService = {
    normalizeGuestData,
    normalizeGuestForCreate,
    normalizeGuestForUpdate,

    async getGuestsByEventId(eventId) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        try {
            const snapshot = await getDocs(collection(db, 'eventos', eventId, 'invitados'));
            return sortGuestsByName(snapshot.docs.map(sanitizeGuestDoc).filter(Boolean));
        } catch (error) {
            wrapGuestServiceError('fetch-all', error);
        }
    },

    async getQrGuests(eventId) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        const roleContext = await authService.getRoleContext({ forceRefresh: false });
        if (roleContext.role !== USER_ROLES.CEO || roleContext.source !== 'custom-claim') {
            throw new Error('qr/permission-denied');
        }
        try {
            const snapshot = await getDocs(collection(db, 'eventos', eventId, 'invitados'));
            return sortGuestsByName(snapshot.docs
                .map((item) => sanitizeGuestDoc(item, { includeQrToken: true }))
                .filter(Boolean));
        } catch (error) {
            wrapGuestServiceError('fetch-qr', error);
        }
    },

    async getGuestById(eventId, guestId) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            return sanitizeGuestDoc(await getDoc(doc(db, 'eventos', eventId, 'invitados', guestId)));
        } catch (error) {
            wrapGuestServiceError('fetch-one', error);
        }
    },

    async createGuest(eventId, guestData) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        try {
            const numbering = await getGuestNumberingState(eventId);
            if (numbering.finalized) {
                const created = await createFinalizedGuest(eventId, guestData);
                await reconcileEventStats(eventId);
                return created.id;
            }
            const docRef = doc(collection(db, 'eventos', eventId, 'invitados'));
            const guest = await prepareGuestForCreate(eventId, docRef, guestData);
            const eventRef = doc(db, 'eventos', eventId);
            await runTransaction(db, async (transaction) => {
                const eventSnapshot = await transaction.get(eventRef);
                assertTemporaryNumberingAllowed(eventSnapshot);
                const timestamp = serverTimestamp();
                transaction.set(docRef, {
                    ...toFirestoreGuest(guest),
                    fechaCreacion: timestamp,
                    fechaActualizacion: timestamp
                });
                transaction.update(eventRef, {
                    ...createEventStatsMutation(eventSnapshot.data(), [{ after: guest }], timestamp),
                    fechaActualizacion: timestamp
                });
            });
            await reconcileEventStats(eventId);
            return docRef.id;
        } catch (error) {
            wrapGuestServiceError('create', error);
        }
    },

    async updateGuest(eventId, guestId, guestData) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            const docRef = doc(db, 'eventos', eventId, 'invitados', guestId);
            const current = await getDoc(docRef);
            if (!current.exists()) throw new Error('guest/not-found');

            const guest = normalizeGuestForUpdate(cleanGuestInput(guestData), current.data(), { documentId: guestId });
            if (guest.codigoInvitado !== current.data().codigoInvitado
                && await fieldValueExists(eventId, 'codigoInvitado', guest.codigoInvitado, guestId)) {
                throw new GuestContractError('guest/duplicate-code');
            }
            if (guest.qrToken && guest.qrToken !== current.data().qrToken
                && await fieldValueExists(eventId, 'qrToken', guest.qrToken, guestId)) {
                throw new GuestContractError('guest/duplicate-qr-token');
            }
            const eventRef = doc(db, 'eventos', eventId);
            await runTransaction(db, async (transaction) => {
                const [eventSnapshot, latest] = await Promise.all([
                    transaction.get(eventRef),
                    transaction.get(docRef)
                ]);
                assertNoRenumbering(eventSnapshot);
                if (!latest.exists()) throw new Error('guest/not-found');
                const latestGuest = normalizeGuestForUpdate(
                    cleanGuestInput(guestData),
                    latest.data(),
                    { documentId: guestId }
                );
                const timestamp = serverTimestamp();
                transaction.update(docRef, {
                    ...toFirestoreGuest(latestGuest),
                    fechaActualizacion: timestamp
                });
                transaction.update(eventRef, {
                    ...createEventStatsMutation(
                        eventSnapshot.data(),
                        [{ before: latest.data(), after: latestGuest }],
                        timestamp
                    ),
                    fechaActualizacion: timestamp
                });
            });
            await reconcileEventStats(eventId);
        } catch (error) {
            wrapGuestServiceError('update', error);
        }
    },

    async deleteGuest(eventId, guestId) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            const eventRef = doc(db, 'eventos', eventId);
            const guestRef = doc(db, 'eventos', eventId, 'invitados', guestId);
            await runTransaction(db, async (transaction) => {
                const [eventSnapshot, guestSnapshot] = await Promise.all([
                    transaction.get(eventRef),
                    transaction.get(guestRef)
                ]);
                assertNoRenumbering(eventSnapshot);
                if (!guestSnapshot.exists()) throw new Error('guest/not-found');
                const timestamp = serverTimestamp();
                transaction.delete(guestRef);
                transaction.update(eventRef, {
                    ...createEventStatsMutation(
                        eventSnapshot.data(),
                        [{ before: guestSnapshot.data() }],
                        timestamp
                    ),
                    fechaActualizacion: timestamp
                });
            });
            await reconcileEventStats(eventId);
        } catch (error) {
            wrapGuestServiceError('delete', error);
        }
    },

    async importGuestsBatch(eventId, guestsArray, { onProgress } = {}) {
        if (!eventId || !Array.isArray(guestsArray)) throw new Error('guest/invalid-batch-params');
        const numbering = await getGuestNumberingState(eventId);
        if (numbering.finalized) {
            const inputs = guestsArray.filter((guest) => guest && typeof guest === 'object');
            const summary = { guests: [], completedBatches: 0, totalBatches: inputs.length };
            try {
                for (const input of inputs) {
                    const created = await createFinalizedGuest(eventId, input);
                    summary.completedBatches += 1;
                    summary.guests.push({
                        ...created.guest,
                        id: created.id,
                        fechaCreacion: null,
                        fechaActualizacion: null,
                        horaLlegada: created.guest.horaLlegada ?? null
                    });
                    notifyProgress(onProgress, {
                        completedBatches: summary.completedBatches,
                        totalBatches: summary.totalBatches,
                        importedCount: summary.guests.length,
                        totalCount: inputs.length
                    });
                }
                await reconcileEventStats(eventId);
                return { ...summary, importedCount: summary.guests.length };
            } catch (error) {
                if (summary.completedBatches > 0) await reconcileEventStats(eventId);
                throw createImportError(error, summary);
            }
        }
        let prepared;
        try {
            // This is the Excel creation boundary too: every row receives the
            // exact same counters/code/QR initialization as manual creation.
            const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
            const identities = buildExistingIdentityIndex(await getDocs(invitadosRef));
            prepared = guestsArray
                .filter((guest) => guest && typeof guest === 'object')
                .map((guest) => {
                    const guestRef = doc(invitadosRef);
                    return { guestRef, guest: prepareGuestBatchItem(guestRef, guest, identities) };
                });
        } catch (error) {
            wrapGuestServiceError('batch-import', error);
        }

        const totalBatches = Math.ceil(prepared.length / IMPORT_BATCH_SIZE);
        const summary = { guests: [], completedBatches: 0, totalBatches };
        if (prepared.length === 0) return { ...summary, importedCount: 0 };

        try {
            for (let offset = 0; offset < prepared.length; offset += IMPORT_BATCH_SIZE) {
                const chunk = prepared.slice(offset, offset + IMPORT_BATCH_SIZE);
                const createdInBatch = [];
                const eventRef = doc(db, 'eventos', eventId);
                await runTransaction(db, async (transaction) => {
                    const eventSnapshot = await transaction.get(eventRef);
                    assertTemporaryNumberingAllowed(eventSnapshot);
                    const timestamp = serverTimestamp();
                    chunk.forEach(({ guestRef, guest }) => {
                        transaction.set(guestRef, {
                            ...toFirestoreGuest(guest),
                            fechaCreacion: timestamp,
                            fechaActualizacion: timestamp
                        });
                        createdInBatch.push({
                            ...guest,
                            id: guestRef.id,
                            fechaCreacion: null,
                            fechaActualizacion: null,
                            horaLlegada: null
                        });
                    });
                    transaction.update(eventRef, {
                        ...createEventStatsMutation(
                            eventSnapshot.data(),
                            chunk.map(({ guest }) => ({ after: guest })),
                            timestamp
                        ),
                        fechaActualizacion: timestamp
                    });
                });
                summary.completedBatches += 1;
                summary.guests.push(...createdInBatch);
                notifyProgress(onProgress, {
                    completedBatches: summary.completedBatches,
                    totalBatches,
                    importedCount: summary.guests.length,
                    totalCount: prepared.length
                });
            }
            await reconcileEventStats(eventId);
            return { ...summary, importedCount: summary.guests.length };
        } catch (error) {
            if (summary.completedBatches > 0) await reconcileEventStats(eventId);
            throw createImportError(error, summary);
        }
    },

    subscribeToGuests(eventId, callback, onError) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        if (typeof callback !== 'function') throw new Error('guest/invalid-subscriber');

        return onSnapshot(collection(db, 'eventos', eventId, 'invitados'), (snapshot) => {
            callback(sortGuestsByName(snapshot.docs.map(sanitizeGuestDoc).filter(Boolean)));
        }, (error) => {
            if (typeof onError === 'function') return onError(error);
            console.error('[GuestService] Error en suscripción realtime:', error);
        });
    }
};
