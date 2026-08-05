// services/guest-service.js
// Contrato y persistencia exclusivos de invitados en Firestore.

import { db } from '../firebase.js';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    serverTimestamp,
    updateDoc,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
    GUEST_ACCESS_TYPES,
    GUEST_STATUSES,
    normalizeGuestData
} from '../../shared/guest-contract.js';

export { GUEST_ACCESS_TYPES, GUEST_STATUSES, normalizeGuestData } from '../../shared/guest-contract.js';

const IMPORT_BATCH_SIZE = 400;

const LEGACY_GUEST_STATUSES = Object.freeze(['pendiente', 'confirmado', 'no_asistira', 'llego']);
const LEGACY_GUEST_ACCESS_TYPES = Object.freeze(['ambos', 'qr', 'enlace', 'manual']);

/**
 * Contrato canónico interno. `estado` es la fuente de verdad para confirmado y llegada.
 * Las fechas de Firestore se convierten a ISO al leer para no filtrar objetos Firebase a la interfaz.
 */
function legacyNormalizeGuestData(data = {}, { requireName = false, strict = false } = {}) {
    const source = data && typeof data === 'object' ? data : {};
    const nombre = normalizeText(source.nombre ?? source.name, 160);
    const correo = normalizeText(source.correo ?? source.email, 160).toLowerCase();
    const telefono = normalizePhone(source.telefono ?? source.tel ?? source.phone);
    const pases = normalizePasses(source.pases, { strict });
    const mesa = normalizeTable(source.mesa ?? source.table, { strict });
    const estado = normalizeStatus(source, { strict });
    const tipoAcceso = normalizeAccessType(source.tipoAcceso ?? source.acceso, { strict });
    const codigoInvitado = normalizeText(
        source.codigoInvitado ?? source.codigo ?? source.codigoInvitacion ?? source.folio ?? source.code,
        160
    );
    const llegadaRegistrada = estado === 'llego';
    const confirmado = estado === 'confirmado' || estado === 'llego';
    const horaLlegada = llegadaRegistrada ? normalizeArrivalTime(source.horaLlegada) : null;

    if (requireName && !nombre) throw new Error('guest/invalid-name');
    if (strict && correo && !isValidEmail(correo)) throw new Error('guest/invalid-email');
    if (strict && telefono && !isValidPhone(telefono)) throw new Error('guest/invalid-phone');

    return {
        codigoInvitado,
        nombre,
        correo,
        telefono,
        pases,
        mesa,
        estado,
        confirmado,
        llegadaRegistrada,
        horaLlegada,
        tipoAcceso,
        notas: normalizeText(source.notas ?? source.comentarios ?? source.observaciones, 1000)
    };
}

function normalizeStatus(source, { strict }) {
    const rawStatus = normalizeComparableText(source.estado ?? source.status);
    if (!rawStatus) {
        if (Boolean(source.llegadaRegistrada || source.llego || source.checkIn || source.horaLlegada)) return 'llego';
        if (Boolean(source.confirmado || source.asistenciaConfirmada)) return 'confirmado';
        return 'pendiente';
    }
    if (rawStatus.includes('llego') || rawStatus.includes('arrivo') || rawStatus.includes('arrived')) return 'llego';
    if (rawStatus.includes('confirm')) return 'confirmado';
    if (rawStatus.includes('no asist') || rawStatus.includes('cancel')) return 'no_asistira';
    if (rawStatus.includes('pend')) return 'pendiente';
    if (strict) throw new Error('guest/invalid-status');
    return 'pendiente';
}

function normalizeAccessType(value, { strict }) {
    const comparable = normalizeComparableText(value);
    if (!comparable || comparable.includes('ambos')) return 'ambos';
    if (comparable.includes('qr')) return 'qr';
    if (comparable.includes('enlace') || comparable.includes('link') || comparable.includes('url')) return 'enlace';
    if (comparable.includes('manual') || comparable.includes('impreso') || comparable.includes('print')) return 'manual';
    if (strict) throw new Error('guest/invalid-access-type');
    return 'manual';
}

function normalizePasses(value, { strict }) {
    const text = normalizeText(value, 30);
    if (!text) return 1;
    const parsed = Number(text.replace(',', '.'));
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 999) return parsed;
    if (strict) throw new Error('guest/invalid-passes');
    return 1;
}

function normalizeTable(value, { strict }) {
    if (value === null || value === undefined || normalizeText(value, 80) === '') return null;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;

    const text = normalizeComparableText(value);
    const match = text.match(/^(?:mesa\s*)?(\d+)$/);
    if (match) return Number(match[1]);
    if (strict) throw new Error('guest/invalid-table');
    return null;
}

function normalizeArrivalTime(value) {
    if (value === null || value === undefined || value === '') return null;
    return value;
}

function normalizeText(value, maxLength) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeComparableText(value) {
    return normalizeText(value, 160)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[\-_./]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizePhone(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const digits = text.replace(/\D/g, '');
    return digits ? `${text.startsWith('+') ? '+' : ''}${digits}` : '';
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
}

function sanitizeGuestDoc(docSnap) {
    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    const codigoInvitado = resolveGuestCode(data, docSnap.id);
    return {
        ...normalizeGuestData({ ...data, codigoInvitado }),
        id: docSnap.id,
        fechaCreacion: toIsoString(data.fechaCreacion),
        fechaActualizacion: toIsoString(data.fechaActualizacion),
        horaLlegada: toIsoString(data.horaLlegada)
    };
}

function resolveGuestCode(data, documentId) {
    if (data?.codigoInvitado ?? data?.codigo ?? data?.codigoInvitacion ?? data?.folio ?? data?.code) {
        return data.codigoInvitado ?? data.codigo ?? data.codigoInvitacion ?? data.folio ?? data.code;
    }
    return /^INV-\d+$/i.test(documentId) ? documentId : '';
}

function toIsoString(value) {
    return value?.toDate ? value.toDate().toISOString() : value ?? null;
}

function cleanGuestInput(guest) {
    const payload = {};
    Object.entries(guest || {}).forEach(([key, value]) => {
        if (['id', 'fechaCreacion', 'fechaActualizacion'].includes(key) || value === undefined) return;
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
        mesa: guest.mesa,
        estado: guest.estado,
        confirmado: guest.confirmado,
        llegadaRegistrada: guest.llegadaRegistrada,
        horaLlegada: guest.llegadaRegistrada ? (guest.horaLlegada || serverTimestamp()) : null,
        tipoAcceso: guest.tipoAcceso,
        notas: guest.notas
    };
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

export const guestService = {
    normalizeGuestData,

    async getGuestsByEventId(eventId) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        try {
            const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
            const snapshot = await getDocs(invitadosRef);
            const guests = [];
            snapshot.forEach((docSnap) => {
                const cleaned = sanitizeGuestDoc(docSnap);
                if (cleaned) guests.push(cleaned);
            });
            return sortGuestsByName(guests);
        } catch (error) {
            throw new Error(`guest/fetch-all-failed: ${error.message}`);
        }
    },

    async getGuestById(eventId, guestId) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            return sanitizeGuestDoc(await getDoc(doc(db, 'eventos', eventId, 'invitados', guestId)));
        } catch (error) {
            throw new Error(`guest/fetch-one-failed: ${error.message}`);
        }
    },

    async createGuest(eventId, guestData) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        try {
            const guest = normalizeGuestData(guestData, { requireName: true, strict: true });
            const docRef = await addDoc(collection(db, 'eventos', eventId, 'invitados'), {
                ...toFirestoreGuest(guest),
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            });
            return docRef.id;
        } catch (error) {
            throw new Error(`guest/create-failed: ${error.message}`);
        }
    },

    async updateGuest(eventId, guestId, guestData) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            const docRef = doc(db, 'eventos', eventId, 'invitados', guestId);
            const current = await getDoc(docRef);
            if (!current.exists()) throw new Error('guest/not-found');
            const guest = normalizeGuestData(
                {
                    ...current.data(),
                    codigoInvitado: resolveGuestCode(current.data(), guestId),
                    ...cleanGuestInput(guestData)
                },
                { requireName: true, strict: true }
            );
            await updateDoc(docRef, { ...toFirestoreGuest(guest), fechaActualizacion: serverTimestamp() });
        } catch (error) {
            throw new Error(`guest/update-failed: ${error.message}`);
        }
    },

    async deleteGuest(eventId, guestId) {
        if (!eventId || !guestId) throw new Error('guest/invalid-parameters');
        try {
            await deleteDoc(doc(db, 'eventos', eventId, 'invitados', guestId));
        } catch (error) {
            throw new Error(`guest/delete-failed: ${error.message}`);
        }
    },

    async importGuestsBatch(eventId, guestsArray, { onProgress } = {}) {
        if (!eventId || !Array.isArray(guestsArray)) throw new Error('guest/invalid-batch-params');

        const guests = guestsArray
            .filter((guest) => guest && typeof guest === 'object')
            .map((guest) => normalizeGuestData(guest, { requireName: true, strict: true }));
        const totalBatches = Math.ceil(guests.length / IMPORT_BATCH_SIZE);
        const summary = { guests: [], completedBatches: 0, totalBatches };
        if (guests.length === 0) return { ...summary, importedCount: 0 };

        const invitadosRef = collection(db, 'eventos', eventId, 'invitados');
        try {
            for (let offset = 0; offset < guests.length; offset += IMPORT_BATCH_SIZE) {
                const chunk = guests.slice(offset, offset + IMPORT_BATCH_SIZE);
                const batch = writeBatch(db);
                const createdInBatch = [];

                chunk.forEach((guest) => {
                    const guestRef = doc(invitadosRef);
                    batch.set(guestRef, {
                        ...toFirestoreGuest(guest),
                        fechaCreacion: serverTimestamp(),
                        fechaActualizacion: serverTimestamp()
                    });
                    createdInBatch.push({
                        ...guest,
                        id: guestRef.id,
                        fechaCreacion: null,
                        fechaActualizacion: null,
                        horaLlegada: null
                    });
                });

                await batch.commit();
                summary.completedBatches += 1;
                summary.guests.push(...createdInBatch);
                notifyProgress(onProgress, {
                    completedBatches: summary.completedBatches,
                    totalBatches,
                    importedCount: summary.guests.length,
                    totalCount: guests.length
                });
            }
            return { ...summary, importedCount: summary.guests.length };
        } catch (error) {
            throw createImportError(error, summary);
        }
    },

    subscribeToGuests(eventId, callback, onError) {
        if (!eventId) throw new Error('guest/invalid-event-id');
        if (typeof callback !== 'function') throw new Error('guest/invalid-subscriber');

        return onSnapshot(collection(db, 'eventos', eventId, 'invitados'), (snapshot) => {
            const guests = [];
            snapshot.forEach((docSnap) => {
                const cleaned = sanitizeGuestDoc(docSnap);
                if (cleaned) guests.push(cleaned);
            });
            callback(sortGuestsByName(guests));
        }, (error) => {
            if (typeof onError === 'function') return onError(error);
            console.error('[GuestService] Error en suscripción realtime:', error);
        });
    }
};
