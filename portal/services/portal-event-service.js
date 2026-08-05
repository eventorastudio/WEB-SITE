import { db } from '../firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getPortalEntitlements } from '../core/entitlement-guard.js';

const PORTAL_ROLES = new Set(['cliente']);

function text(value, maxLength = 160) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function toIso(value) {
    return value?.toDate ? value.toDate().toISOString() : (value || null);
}

function normalizeRole(value) {
    return text(value, 40)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function sanitizeUserProfile(snapshot) {
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    const events = Array.isArray(data.eventosPermitidos)
        ? [...new Set(data.eventosPermitidos.map((id) => text(id, 160)).filter(Boolean))]
        : [];
    return {
        uid: snapshot.id,
        nombre: text(data.nombre ?? data.displayName, 120),
        correo: text(data.correo ?? data.email, 160).toLowerCase(),
        rol: normalizeRole(data.rol),
        activo: data.activo === true,
        eventosPermitidos: events
    };
}

function sanitizeEvent(snapshot) {
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    const event = {
        id: snapshot.id,
        nombre: text(data.nombreEvento ?? data.nombre, 180) || 'Evento sin nombre',
        fecha: toIso(data.fecha) || text(data.fecha, 40) || null,
        hora: text(data.hora, 20),
        ubicacion: [data.ciudad, data.estado, data.pais].map((item) => text(item, 80)).filter(Boolean).join(', ') || 'Ubicación por confirmar',
        estado: text(data.estadoEvento ?? data.estado, 50) || 'Borrador',
        clienteNombre: text(data.clienteNombre ?? data.cliente ?? data.organizador, 120),
        funcionalidades: getPortalEntitlements(data)
    };
    return event;
}

export const portalEventService = {
    async getProfile(uid) {
        if (!uid) throw new Error('portal/profile-id-required');
        const snapshot = await getDoc(doc(db, 'usuarios', uid));
        const profile = sanitizeUserProfile(snapshot);
        if (!profile) throw new Error('portal/profile-not-found');
        if (!profile.activo) throw new Error('portal/profile-inactive');
        if (!PORTAL_ROLES.has(profile.rol)) throw new Error('portal/role-not-allowed');
        return profile;
    },

    async getAuthorizedEvent(eventId, profile) {
        const normalizedId = text(eventId, 160);
        if (!normalizedId) throw new Error('portal/event-id-required');
        if (!profile?.eventosPermitidos?.includes(normalizedId)) throw new Error('portal/event-not-assigned');
        const snapshot = await getDoc(doc(db, 'eventos', normalizedId));
        const event = sanitizeEvent(snapshot);
        if (!event) throw new Error('portal/event-not-found');
        return event;
    },

    async getAuthorizedEventOptions(profile) {
        const ids = profile?.eventosPermitidos ?? [];
        const events = await Promise.all(ids.map(async (eventId) => {
            try { return await this.getAuthorizedEvent(eventId, profile); } catch { return null; }
        }));
        return events.filter((event) => event?.funcionalidades?.portalCliente === true);
    }
};
