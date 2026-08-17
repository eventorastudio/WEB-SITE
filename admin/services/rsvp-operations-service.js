import { db } from '../firebase.js';
import {
    collection,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
    deserializeRsvpConflictDocument,
    deserializeRsvpStateDocument
} from '../../shared/rsvp-operations-contract.js?v=phase56-rsvp-operations-20260817';

export const rsvpOperationsService = Object.freeze({
    subscribeToGuestRsvpOperations(eventId, callback, onError) {
        if (!eventId) throw new Error('rsvp-operations/invalid-event-id');
        if (typeof callback !== 'function') throw new Error('rsvp-operations/invalid-subscriber');

        let states = null;
        let conflicts = null;
        const emit = () => {
            if (!states || !conflicts) return;
            callback(Object.freeze({ states, conflicts }));
        };
        const report = (error) => {
            if (typeof onError === 'function') return onError(error);
            console.error('[RsvpOperationsService] No fue posible leer el estado operacional.', error);
        };

        const unsubscribeStates = onSnapshot(
            collection(db, 'eventos', eventId, 'rsvpState'),
            (snapshot) => {
                try {
                    states = Object.freeze(snapshot.docs.map((item) => deserializeRsvpStateDocument(
                        item.data(),
                        { expectedEventId: eventId, expectedGuestId: item.id }
                    )));
                    emit();
                } catch (error) {
                    report(error);
                }
            },
            report
        );
        const unsubscribeConflicts = onSnapshot(
            collection(db, 'eventos', eventId, 'rsvpConflicts'),
            (snapshot) => {
                try {
                    conflicts = Object.freeze(snapshot.docs.map((item) => ({
                        id: item.id,
                        ...deserializeRsvpConflictDocument(item.data(), { expectedEventId: eventId })
                    })));
                    emit();
                } catch (error) {
                    report(error);
                }
            },
            report
        );

        return () => {
            unsubscribeStates();
            unsubscribeConflicts();
        };
    }
});
