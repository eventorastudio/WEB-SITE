import { db } from '../firebase.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
    EVENT_STATS_SCHEMA_VERSION,
    calculateEventStats,
    getStoredEventStats,
    toEventStatsViewModel
} from '../../shared/event-stats.js';

const MAX_SYNC_ATTEMPTS = 4;

function snapshotGuests(snapshot) {
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function revisionOf(eventData) {
    const value = Number(eventData?.statsRevision);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

async function calculateFromSource(eventId) {
    const snapshot = await getDocs(collection(db, 'eventos', eventId, 'invitados'));
    return calculateEventStats(snapshotGuests(snapshot));
}

export const eventStatsService = {
    calculateEventStats,
    toEventStatsViewModel,

    async getEventStats(eventId) {
        if (!eventId) throw new Error('event-stats/invalid-event-id');
        const snapshot = await getDoc(doc(db, 'eventos', eventId));
        if (!snapshot.exists()) throw new Error('event-stats/event-not-found');
        return getStoredEventStats(snapshot.data());
    },

    async recalculateEventStats(eventId, { sync = false } = {}) {
        if (!eventId) throw new Error('event-stats/invalid-event-id');
        return sync ? this.syncEventStats(eventId) : calculateFromSource(eventId);
    },

    async syncEventStats(eventId) {
        if (!eventId) throw new Error('event-stats/invalid-event-id');
        const eventRef = doc(db, 'eventos', eventId);

        for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt += 1) {
            const eventBefore = await getDoc(eventRef);
            if (!eventBefore.exists()) throw new Error('event-stats/event-not-found');
            const expectedRevision = revisionOf(eventBefore.data());
            const stats = await calculateFromSource(eventId);

            try {
                await runTransaction(db, async (transaction) => {
                    const current = await transaction.get(eventRef);
                    if (!current.exists()) throw new Error('event-stats/event-not-found');
                    if (revisionOf(current.data()) !== expectedRevision) {
                        throw new Error('event-stats/concurrent-guest-change');
                    }
                    transaction.update(eventRef, {
                        estadisticas: stats,
                        statsSchemaVersion: EVENT_STATS_SCHEMA_VERSION,
                        statsUpdatedAt: serverTimestamp()
                    });
                });
                return stats;
            } catch (error) {
                if (error?.message !== 'event-stats/concurrent-guest-change' || attempt === MAX_SYNC_ATTEMPTS) throw error;
            }
        }
        throw new Error('event-stats/sync-retry-exhausted');
    },

    subscribeEventStats(eventId, callback, onError) {
        if (!eventId || typeof callback !== 'function') throw new Error('event-stats/invalid-subscription');
        return onSnapshot(doc(db, 'eventos', eventId), (snapshot) => {
            if (!snapshot.exists()) return callback(null, { missing: true, revision: 0 });
            const data = snapshot.data();
            callback(getStoredEventStats(data), {
                missing: false,
                revision: revisionOf(data),
                updatedAt: data.statsUpdatedAt?.toDate?.().toISOString?.() ?? null
            });
        }, onError);
    }
};
