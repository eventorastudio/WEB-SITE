import test from 'node:test';
import assert from 'node:assert/strict';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import {
    INVITATION_CONTENT_SCHEMA_VERSION,
    createInvitationContent
} from '../admin/invitations/core/content-schema.js';
import { InvitationDraftService } from '../admin/invitations/services/invitation-draft-service.js';

const EVENT_ID = 'EVT-0001';
const UID = 'UID-PHASE61';

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

function createGateway({ document = null } = {}) {
    let persisted = document;
    const writes = [];
    return {
        writes,
        getCurrentUid: () => UID,
        serverTimestamp: () => new Date('2026-08-17T06:00:00.000Z'),
        async readDraft() { return persisted == null ? null : structuredClone(persisted); },
        async writeDraft(eventId, value) {
            writes.push({ eventId, value: structuredClone(value) });
            persisted = structuredClone(value);
        }
    };
}

function createState() {
    const state = new InvitationBuilderState();
    state.initialize(EVENT_ID, eventData());
    return state;
}

test('save + reload conserva sólo el draft general y la hidratación queda clean', async () => {
    const gateway = createGateway();
    const service = new InvitationDraftService({ gateway });
    const source = createState();

    source.setPackage('premium');
    source.setTheme('champagne');
    source.toggleSection('welcome-story', true);
    source.updateDraftFields({
        'content.identity.phrase': 'Nuestro gran día',
        'content.welcome.title': 'Bienvenidos'
    });
    source.addGift({ name: 'Mesa de regalos', url: 'https://example.com/regalos' });

    const saved = await service.saveState(source, EVENT_ID);
    assert.equal(saved.clean, true);
    assert.equal(source.getSnapshot().ui.generalDraftDirty, false);

    const reloaded = createState();
    const hydrated = await service.hydrateState(reloaded, EVENT_ID);
    const snapshot = reloaded.getSnapshot();

    assert.equal(hydrated.exists, true);
    assert.equal(snapshot.draft.packageId, 'premium');
    assert.equal(snapshot.draft.themeId, 'champagne');
    assert.deepEqual(snapshot.draft.enabledSections, ['welcome-story']);
    assert.equal(snapshot.draft.content.identity.phrase, 'Nuestro gran día');
    assert.equal(snapshot.draft.content.welcome.title, 'Bienvenidos');
    assert.equal(snapshot.draft.gifts[0].name, 'Mesa de regalos');
    assert.equal(snapshot.ui.generalDraftDirty, false);
    assert.equal(snapshot.ui.rsvpDirty, false);
    assert.equal(snapshot.ui.mediaDirty, false);
    assert.equal(snapshot.ui.isDirty, false);
});

test('whitelist no duplica RSVP/media y guardar draft limpia sólo su dirty', async () => {
    const gateway = createGateway();
    const service = new InvitationDraftService({ gateway });
    const state = createState();

    state.setPackage('premium');
    state.setTheme('garden');
    state.updateDraftField('content.rsvp.title', 'RSVP separado');
    state.markMediaPending();

    const result = await service.saveState(state, EVENT_ID);
    const document = gateway.writes[0].value;
    const snapshot = state.getSnapshot();

    assert.equal(result.clean, true);
    assert.deepEqual(Object.keys(document).sort(), [
        'accommodations', 'appearance', 'content', 'contentSchemaVersion',
        'eventId', 'gifts', 'itinerary', 'links', 'locations', 'schemaVersion',
        'sections', 'settings', 'theme', 'updatedAt', 'updatedBy'
    ].sort());
    assert.equal(document.contentSchemaVersion, INVITATION_CONTENT_SCHEMA_VERSION);
    assert.equal(Object.hasOwn(document, 'media'), false);
    assert.equal(Object.hasOwn(document.content, 'rsvp'), false);
    assert.equal(JSON.stringify(document).includes('RSVP separado'), false);
    assert.equal(JSON.stringify(document).includes('mediaIndex'), false);
    assert.equal(JSON.stringify(document).includes('accessToken'), false);
    assert.equal(snapshot.ui.generalDraftDirty, false);
    assert.equal(snapshot.ui.rsvpDirty, true);
    assert.equal(snapshot.ui.mediaDirty, true);
    assert.equal(snapshot.ui.isDirty, true);
});

test('documento ausente conserva defaults actuales sin dirty ni write', async () => {
    const gateway = createGateway();
    const state = createState();
    const before = state.getSnapshot();
    const loaded = await new InvitationDraftService({ gateway }).hydrateState(state, EVENT_ID);

    assert.equal(loaded.exists, false);
    assert.deepEqual(state.getSnapshot().draft.content, before.draft.content);
    assert.deepEqual(state.getSnapshot().draft.content, createInvitationContent(eventData()));
    assert.equal(state.getSnapshot().ui.isDirty, false);
    assert.equal(gateway.writes.length, 0);
});
