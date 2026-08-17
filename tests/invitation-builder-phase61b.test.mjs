import test from 'node:test';
import assert from 'node:assert/strict';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import {
    INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION,
    serializeInvitationDraft
} from '../admin/invitations/core/draft-persistence-schema.js';
import { InvitationDraftService } from '../admin/invitations/services/invitation-draft-service.js';

const EVENT_ID = 'EVT-0001';
const UID = 'UID-PHASE61B';
const UPDATED_AT = new Date('2026-08-17T06:30:00.000Z');

function eventData() {
    return {
        nombreEvento: 'María & Fernando',
        tipoEvento: 'Boda',
        fecha: '2027-11-15',
        hora: '19:00',
        ciudad: 'Saltillo',
        estado: 'Coahuila'
    };
}

function createState() {
    const state = new InvitationBuilderState();
    state.initialize(EVENT_ID, eventData());
    return state;
}

function createGateway(initialDocument = null) {
    let document = initialDocument == null ? null : structuredClone(initialDocument);
    const writes = [];
    return {
        writes,
        getCurrentUid: () => UID,
        serverTimestamp: () => UPDATED_AT,
        async readDraft() { return document == null ? null : structuredClone(document); },
        async writeDraft(eventId, value) {
            writes.push({ eventId, value: structuredClone(value) });
            document = structuredClone(value);
        }
    };
}

test('guardar + recargar conserva accommodations', async () => {
    const gateway = createGateway();
    const service = new InvitationDraftService({ gateway });
    const source = createState();
    source.addAccommodation({
        name: 'Hotel Centro',
        address: 'Calle Principal 100',
        phone: '+528441234567',
        reservationUrl: 'https://example.com/reservar',
        reservationCode: 'EVENTORA'
    });

    await service.saveState(source, EVENT_ID);
    assert.equal(gateway.writes[0].value.schemaVersion, INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION);
    assert.equal(gateway.writes[0].value.accommodations[0].name, 'Hotel Centro');

    const reloaded = createState();
    await service.hydrateState(reloaded, EVENT_ID);
    const snapshot = reloaded.getSnapshot();
    assert.deepEqual(snapshot.draft.accommodations, source.getSnapshot().draft.accommodations);
    assert.equal(snapshot.ui.generalDraftDirty, false);
    assert.equal(snapshot.ui.isDirty, false);
});

test('draft 6.1 sin accommodations hidrata el default actual', async () => {
    const state = createState();
    const currentDocument = serializeInvitationDraft(state.getSnapshot().draft, {
        eventId: EVENT_ID,
        updatedAt: UPDATED_AT,
        updatedBy: UID
    });
    const legacyDocument = { ...currentDocument, schemaVersion: 1 };
    delete legacyDocument.accommodations;
    const gateway = createGateway(legacyDocument);
    const defaults = state.getSnapshot().draft.accommodations;

    const loaded = await new InvitationDraftService({ gateway }).hydrateState(state, EVENT_ID);

    assert.equal(loaded.exists, true);
    assert.equal(loaded.schemaVersion, INVITATION_DRAFT_PERSISTENCE_SCHEMA_VERSION);
    assert.deepEqual(state.getSnapshot().draft.accommodations, defaults);
    assert.equal(state.getSnapshot().ui.generalDraftDirty, false);
    assert.equal(state.getSnapshot().ui.isDirty, false);
    assert.equal(gateway.writes.length, 0);
});
