import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { JSDOM } from 'jsdom';

import {
    createGuestRsvpOperationalElement,
    indexRsvpOperationalDocuments
} from '../admin/modules/guests/rsvp-operational-view.js';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const timestamp = () => ({ toDate: () => new Date('2026-08-17T15:00:00.000Z') });

function state(status, passesConfirmed, guestId) {
    return {
        schemaVersion: 1,
        eventId: 'EVT-56-ADMIN',
        guestId,
        status,
        passesConfirmed,
        respondedAt: timestamp(),
        syncedAt: timestamp()
    };
}

test('ADMIN muestra estado, pases y conflicto sin acoplarse a QR/check-in', async () => {
    const dom = new JSDOM('<main></main>');
    const accepted = state('accepted', 2, 'INV-0001');
    const declined = state('declined', 0, 'INV-0002');
    const index = indexRsvpOperationalDocuments({
        states: [accepted, declined],
        conflicts: [{ guestId: 'INV-0001' }]
    });
    const acceptedView = createGuestRsvpOperationalElement(dom.window.document, accepted, {
        hasConflict: index.conflictGuestIds.has('INV-0001')
    });
    const declinedView = createGuestRsvpOperationalElement(dom.window.document, declined);
    const pendingView = createGuestRsvpOperationalElement(dom.window.document, null);

    assert.match(acceptedView.textContent, /Confirmado.*2 pases confirmados.*Conflicto/);
    assert.match(declinedView.textContent, /No asistirá.*0 pases confirmados/);
    assert.match(pendingView.textContent, /Pendiente.*Sin respuesta/);
    assert.equal(index.statesByGuestId.get('INV-0001'), accepted);

    const [viewSource, serviceSource, controllerSource] = await Promise.all([
        read('admin/modules/guests/rsvp-operational-view.js'),
        read('admin/services/rsvp-operations-service.js'),
        read('admin/modules/event-controller.js')
    ]);
    assert.doesNotMatch(viewSource, /qrToken|qrActivo|pasesUtilizados|pasesDisponibles|checkinSecuencia|horaLlegada/);
    assert.doesNotMatch(serviceSource, /setDoc|updateDoc|deleteDoc|writeBatch|runTransaction/);
    assert.match(controllerSource, /'RSVP'/);
    assert.match(controllerSource, /createGuestRsvpSummary/);
});
