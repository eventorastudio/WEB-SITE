import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import {
    deserializeInvitationDraft,
    serializeInvitationDraft
} from '../admin/invitations/core/draft-persistence-schema.js';

const EVENT_ID = 'EVT-PLACE-LEGACY';
const OPTIONS = Object.freeze({
    eventId: EVENT_ID,
    updatedAt: new Date('2026-08-24T00:00:00.000Z'),
    updatedBy: 'place-compat-test'
});

function persistedDraft() {
    const draft = createInvitationDraft(EVENT_ID, { nombreEvento: 'Aloha', fecha: '2027-06-20' });
    draft.themeId = 'aloha';
    return serializeInvitationDraft(draft, OPTIONS);
}

test('legacy location imageId loads without rewriting its persisted shape', () => {
    const document = persistedDraft();
    document.locations[0].imageId = 'MED-LOCAL-001';

    const loaded = deserializeInvitationDraft(document, EVENT_ID);

    assert.equal(document.locations[0].imageId, 'MED-LOCAL-001');
    assert.equal(loaded.locations[0].imageId, 'MED-LOCAL-001');
    assert.equal(loaded.locations[0].imageMediaId, undefined);
});

test('current location and accommodation place references load when valid', () => {
    const document = persistedDraft();
    document.locations[0].imageMediaId = 'MED-LOCAL-001';
    document.accommodations = [{
        id: 'HOT-LOCAL-001', name: 'Hotel Aloha', address: '', description: '', phone: '',
        reservationUrl: '', mapsUrl: '', reservationCode: '', notes: '', imageMediaId: 'MED-LOCAL-001'
    }];

    const loaded = deserializeInvitationDraft(document, EVENT_ID);

    assert.equal(loaded.locations[0].imageMediaId, 'MED-LOCAL-001');
    assert.equal(loaded.accommodations[0].imageMediaId, 'MED-LOCAL-001');
});

test('legacy locations and accommodations without place references continue loading', () => {
    const document = persistedDraft();
    document.accommodations = [{
        id: 'HOT-LOCAL-001', name: 'Hotel Aloha', address: '', description: '', phone: '',
        reservationUrl: '', mapsUrl: '', reservationCode: '', notes: ''
    }];

    const loaded = deserializeInvitationDraft(document, EVENT_ID);

    assert.equal(loaded.locations[0].imageMediaId, undefined);
    assert.equal(loaded.accommodations[0].imageMediaId, undefined);
});

test('explicit null place references remain canonical optional values', () => {
    const document = persistedDraft();
    document.locations[0].imageMediaId = null;
    document.accommodations = [{
        id: 'HOT-LOCAL-001', name: 'Hotel Aloha', address: '', description: '', phone: '',
        reservationUrl: '', mapsUrl: '', reservationCode: '', notes: '', imageMediaId: null
    }];

    const loaded = deserializeInvitationDraft(document, EVENT_ID);

    assert.equal(loaded.locations[0].imageMediaId, null);
    assert.equal(loaded.accommodations[0].imageMediaId, null);
});

test('invalid imageMediaId and unknown entity fields remain rejected', () => {
    const invalidId = persistedDraft();
    invalidId.locations[0].imageMediaId = 'not-a-media-id';
    assert.throws(() => deserializeInvitationDraft(invalidId, EVENT_ID), { code: 'draft/invalid-image-media-id' });

    const unknownField = persistedDraft();
    unknownField.locations[0].unexpected = true;
    assert.throws(() => deserializeInvitationDraft(unknownField, EVENT_ID), { code: 'draft/non-canonical-document' });
});
