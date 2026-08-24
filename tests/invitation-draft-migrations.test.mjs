import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import {
    findCanonicalDifferences,
    serializeInvitationDraft,
    deserializeInvitationDraft
} from '../admin/invitations/core/draft-persistence-schema.js';
import { INVITATION_CONTENT_SCHEMA_VERSION } from '../admin/invitations/core/content-schema.js';
import {
    CURRENT_DRAFT_SCHEMA_VERSION,
    migrateInvitationDraftToCurrentSchema
} from '../admin/invitations/core/draft-migrations.js';

const EVENT_ID = 'EVT-MIGRATION-001';
const OPTIONS = Object.freeze({
    eventId: EVENT_ID,
    updatedAt: new Date('2026-08-24T00:00:00.000Z'),
    updatedBy: 'migration-test'
});

function currentFixture() {
    const draft = createInvitationDraft(EVENT_ID, { nombreEvento: 'Migración', fecha: '2027-06-20' });
    const document = serializeInvitationDraft(draft, OPTIONS);
    document.theme = null;
    document.locations = [
        { ...document.locations[0], id: 'LOC-LOCAL-001' },
        { ...document.locations[0], id: 'LOC-LOCAL-002', imageMediaId: 'MED-LOCAL-001' },
        { ...document.locations[0], id: 'LOC-LOCAL-003' }
    ];
    return document;
}

function legacyFixture() {
    const legacy = currentFixture();
    legacy.schemaVersion = 1;
    delete legacy.accommodations;
    legacy.locations[1].imageId = legacy.locations[1].imageMediaId;
    delete legacy.locations[1].imageMediaId;
    delete legacy.content.welcome.opening;
    delete legacy.settings.format;
    return legacy;
}

test('legacy draft migrates to current schema in memory and round-trips current fields', () => {
    const legacy = legacyFixture();
    const migrated = migrateInvitationDraftToCurrentSchema(legacy);
    assert.equal(migrated.schemaVersion, CURRENT_DRAFT_SCHEMA_VERSION);
    assert.equal(migrated.contentSchemaVersion, INVITATION_CONTENT_SCHEMA_VERSION);
    assert.equal(migrated.locations[1].imageMediaId, 'MED-LOCAL-001');
    assert.equal(migrated.locations[1].imageId, undefined);
    assert.equal(migrated.accommodations.length, 0);
    assert.equal(migrated.settings.format, 'website');
    assert.ok(migrated.content.welcome.opening);

    const runtime = deserializeInvitationDraft(legacy, EVENT_ID);
    const saved = serializeInvitationDraft(runtime, OPTIONS);
    assert.equal(saved.locations[1].imageMediaId, 'MED-LOCAL-001');
    assert.equal(saved.locations[1].imageId, undefined);
    assert.equal(saved.schemaVersion, CURRENT_DRAFT_SCHEMA_VERSION);
    assert.equal(saved.contentSchemaVersion, INVITATION_CONTENT_SCHEMA_VERSION);
});

test('migration is idempotent', () => {
    const legacy = legacyFixture();
    assert.deepEqual(
        migrateInvitationDraftToCurrentSchema(migrateInvitationDraftToCurrentSchema(legacy)),
        migrateInvitationDraftToCurrentSchema(legacy)
    );
});

test('current draft migration is a structural no-op', () => {
    const current = currentFixture();
    const migrated = migrateInvitationDraftToCurrentSchema(current);
    assert.deepEqual(migrated, current);
    const runtime = deserializeInvitationDraft(current, EVENT_ID);
    const serialized = serializeInvitationDraft(runtime, OPTIONS);
    assert.deepEqual(findCanonicalDifferences(current, serialized), []);
});

test('future, unknown, and invalid versions are rejected explicitly', () => {
    const current = currentFixture();
    assert.throws(() => migrateInvitationDraftToCurrentSchema({ ...current, schemaVersion: 99 }), { code: 'draft/unsupported-future-schema' });
    assert.throws(() => migrateInvitationDraftToCurrentSchema({ ...current, schemaVersion: 3 }), { code: 'draft/unsupported-future-schema' });
    assert.throws(() => migrateInvitationDraftToCurrentSchema({ ...current, schemaVersion: 0 }), { code: 'draft/unsupported-schema' });
    assert.throws(() => migrateInvitationDraftToCurrentSchema({ ...current, contentSchemaVersion: 99 }), { code: 'draft/unsupported-future-content-schema' });
    assert.throws(() => migrateInvitationDraftToCurrentSchema({ ...current, contentSchemaVersion: '4' }), { code: 'draft/unsupported-content-schema' });
});
