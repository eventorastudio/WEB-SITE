import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import {
    deserializeInvitationDraft,
    findCanonicalDifferences,
    findFirstCanonicalDifference,
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

test('legacy location imageId is normalized to imageMediaId without a write', () => {
    const document = persistedDraft();
    document.locations[0].imageId = 'MED-LOCAL-001';

    const loaded = deserializeInvitationDraft(document, EVENT_ID);

    assert.equal(document.locations[0].imageId, 'MED-LOCAL-001');
    assert.equal(loaded.locations[0].imageMediaId, 'MED-LOCAL-001');
    assert.equal(loaded.locations[0].imageId, undefined);
    const saved = serializeInvitationDraft(loaded, OPTIONS);
    assert.equal(saved.locations[0].imageMediaId, 'MED-LOCAL-001');
    assert.equal(saved.locations[0].imageId, undefined);
});

test('production-shaped second location imageId is accepted and serialized canonically', () => {
    const document = persistedDraft();
    document.locations = [
        { ...document.locations[0], id: 'LOC-LOCAL-001' },
        { ...document.locations[0], id: 'LOC-LOCAL-002', imageId: 'MED-LOCAL-001' },
        { ...document.locations[0], id: 'LOC-LOCAL-003' }
    ];

    const loaded = deserializeInvitationDraft(document, EVENT_ID);
    assert.equal(loaded.locations[1].imageMediaId, 'MED-LOCAL-001');
    assert.equal(loaded.locations[1].imageId, undefined);
    const saved = serializeInvitationDraft(loaded, OPTIONS);
    assert.equal(saved.locations[1].imageMediaId, 'MED-LOCAL-001');
    assert.equal(saved.locations[1].imageId, undefined);
});

test('production-shaped current imageMediaId survives all three locations', () => {
    const document = persistedDraft();
    document.locations = [
        { ...document.locations[0], id: 'LOC-LOCAL-001', imageMediaId: 'MED-LOCAL-001' },
        { ...document.locations[0], id: 'LOC-LOCAL-002', imageMediaId: 'MED-LOCAL-002' },
        { ...document.locations[0], id: 'LOC-LOCAL-003', imageMediaId: 'MED-LOCAL-003' }
    ];

    const loaded = deserializeInvitationDraft(document, EVENT_ID);
    assert.deepEqual(loaded.locations.map(({ imageMediaId, imageId }) => ({ imageMediaId, imageId })), [
        { imageMediaId: 'MED-LOCAL-001', imageId: undefined },
        { imageMediaId: 'MED-LOCAL-002', imageId: undefined },
        { imageMediaId: 'MED-LOCAL-003', imageId: undefined }
    ]);
    const saved = serializeInvitationDraft(loaded, OPTIONS);
    assert.deepEqual(saved.locations.map(({ imageMediaId, imageId }) => ({ imageMediaId, imageId })), [
        { imageMediaId: 'MED-LOCAL-001', imageId: undefined },
        { imageMediaId: 'MED-LOCAL-002', imageId: undefined },
        { imageMediaId: 'MED-LOCAL-003', imageId: undefined }
    ]);
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
    const saved = serializeInvitationDraft(loaded, OPTIONS);
    assert.equal(saved.accommodations[0].imageMediaId, 'MED-LOCAL-001');
    assert.equal(saved.accommodations[0].imageId, undefined);
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

    const invalidLegacyId = persistedDraft();
    invalidLegacyId.locations[0].imageId = 123;
    assert.throws(() => deserializeInvitationDraft(invalidLegacyId, EVENT_ID), { code: 'draft/invalid-image-media-id' });

    const conflictingAliases = persistedDraft();
    conflictingAliases.locations[0].imageId = 'MED-LOCAL-001';
    conflictingAliases.locations[0].imageMediaId = 'MED-LOCAL-002';
    assert.throws(() => deserializeInvitationDraft(conflictingAliases, EVENT_ID), { code: 'draft/non-canonical-document' });

    const unknownField = persistedDraft();
    unknownField.locations[0].unexpected = true;
    assert.throws(() => deserializeInvitationDraft(unknownField, EVENT_ID), { code: 'draft/non-canonical-document' });
});

test('canonical diagnostic reports only the first structural difference', () => {
    const difference = findFirstCanonicalDifference(
        { locations: [{ id: 'LOC-LOCAL-001', unexpected: true }] },
        { locations: [{ id: 'LOC-LOCAL-001' }] }
    );

    assert.deepEqual(difference, {
        path: 'locations[0].unexpected',
        type: 'key-presence-mismatch',
        storedPresence: 'present',
        normalizedPresence: 'missing',
        storedType: 'boolean',
        normalizedType: 'missing'
    });
    assert.deepEqual(findCanonicalDifferences(
        { locations: [{ id: 'LOC-LOCAL-001', unexpected: true }], settings: { extra: true } },
        { locations: [{ id: 'LOC-LOCAL-001' }], settings: {} }
    ), [
        difference,
        {
            path: 'settings.extra',
            type: 'key-presence-mismatch',
            storedPresence: 'present',
            normalizedPresence: 'missing',
            storedType: 'boolean',
            normalizedType: 'missing'
        }
    ]);
});

test('canonical diagnostic walks complete arrays and distinguishes structural mismatch types', () => {
    const differences = findCanonicalDifferences(
        { locations: [{ title: 'A' }, { title: 'B' }], settings: { format: 'square' } },
        { locations: [{ title: 1 }], settings: { format: 'square', extra: true } }
    );

    assert.deepEqual(differences, [
        {
            path: 'locations',
            type: 'array-length-mismatch',
            storedPresence: 'present',
            normalizedPresence: 'present',
            storedType: 'array',
            normalizedType: 'array'
        },
        {
            path: 'locations[0].title',
            type: 'type-mismatch',
            storedPresence: 'present',
            normalizedPresence: 'present',
            storedType: 'string',
            normalizedType: 'number'
        },
        {
            path: 'settings.extra',
            type: 'key-presence-mismatch',
            storedPresence: 'missing',
            normalizedPresence: 'present',
            storedType: 'missing',
            normalizedType: 'boolean'
        }
    ]);
});
