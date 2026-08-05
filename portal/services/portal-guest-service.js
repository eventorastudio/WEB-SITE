import { db } from '../firebase.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    query,
    where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { normalizeGuestData } from '../../shared/guest-contract.js';

function toIso(value) {
    return value?.toDate ? value.toDate().toISOString() : (value || null);
}

function boundedInteger(value, minimum, maximum, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function sanitizeGuest(snapshot) {
    if (!snapshot.exists()) return null;
    const raw = snapshot.data();
    const canonical = normalizeGuestData(raw);
    const inferredUsed = raw.pasesUtilizados ?? raw.pasesUsados ?? (canonical.llegadaRegistrada ? canonical.pases : 0);
    const pasesUtilizados = boundedInteger(inferredUsed, 0, canonical.pases, 0);
    return {
        ...canonical,
        id: snapshot.id,
        pasesUtilizados,
        pasesDisponibles: Math.max(canonical.pases - pasesUtilizados, 0),
        qrActivo: raw.qrActivo !== false,
        ultimaLlegada: toIso(raw.ultimaLlegada ?? raw.horaLlegada),
        fechaCreacion: toIso(raw.fechaCreacion),
        fechaActualizacion: toIso(raw.fechaActualizacion)
    };
}

export function normalizeSearch(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

export function filterGuests(guests, search = '', filter = 'todos') {
    const needle = normalizeSearch(search).replace(/\s/g, '');
    return guests.filter((guest) => {
        const matchesFilter = filter === 'todos'
            || (filter === 'pendientes' && guest.pasesUtilizados === 0)
            || (filter === 'parciales' && guest.pasesUtilizados > 0 && guest.pasesDisponibles > 0)
            || (filter === 'ingresaron' && guest.pasesUtilizados > 0)
            || (filter === 'agotados' && guest.pasesDisponibles === 0);
        if (!matchesFilter) return false;
        if (!needle) return true;
        return [guest.nombre, guest.codigoInvitado, guest.correo, guest.telefono, guest.mesa]
            .some((value) => normalizeSearch(value).replace(/\s/g, '').includes(needle));
    });
}

export const portalGuestService = {
    async getGuests(eventId) {
        const snapshot = await getDocs(collection(db, 'eventos', eventId, 'invitados'));
        return snapshot.docs.map(sanitizeGuest).filter(Boolean).sort(sortByName);
    },

    async getGuest(eventId, guestId) {
        return sanitizeGuest(await getDoc(doc(db, 'eventos', eventId, 'invitados', guestId)));
    },

    async getGuestByQrToken(eventId, token) {
        const guestQuery = query(
            collection(db, 'eventos', eventId, 'invitados'),
            where('qrToken', '==', token),
            limit(2)
        );
        const snapshot = await getDocs(guestQuery);
        if (snapshot.empty) return null;
        if (snapshot.size !== 1) throw new Error('portal-guest/ambiguous-token');
        return sanitizeGuest(snapshot.docs[0]);
    },

    subscribeGuests(eventId, callback, onError) {
        return onSnapshot(collection(db, 'eventos', eventId, 'invitados'), (snapshot) => {
            callback(snapshot.docs.map(sanitizeGuest).filter(Boolean).sort(sortByName));
        }, (error) => onError?.(error));
    }
};

function sortByName(left, right) {
    return left.nombre.localeCompare(right.nombre, 'es', { sensitivity: 'base', numeric: true });
}
