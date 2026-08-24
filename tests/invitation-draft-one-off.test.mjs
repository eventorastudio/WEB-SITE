import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import { serializeInvitationDraft } from '../admin/invitations/core/draft-persistence-schema.js';
import { buildMigrationReport, parseArguments } from '../scripts/migrate-invitation-draft-one-off.mjs';

const EVENT_ID = 'EVT-ONE-OFF-001';

function fixture() {
    const draft = createInvitationDraft(EVENT_ID, { nombreEvento: 'Fixture', fecha: '2027-06-20' });
    const document = serializeInvitationDraft(draft, {
        eventId: EVENT_ID,
        updatedAt: new Date('2026-08-24T00:00:00.000Z'),
        updatedBy: 'one-off-test'
    });
    document.theme = null;
    document.schemaVersion = 1;
    delete document.accommodations;
    document.locations = [
        { ...document.locations[0], id: 'LOC-LOCAL-001' },
        { ...document.locations[0], id: 'LOC-LOCAL-002', imageId: 'MED-LOCAL-001' },
        { ...document.locations[0], id: 'LOC-LOCAL-003' }
    ];
    delete document.locations[1].imageMediaId;
    delete document.content.welcome.opening;
    delete document.settings.format;
    return document;
}

test('one-off report migrates legacy fixture without exposing values and preserves location media', () => {
    const report = buildMigrationReport(fixture(), EVENT_ID);
    assert.equal(report.current.locations[1].imageMediaId, 'MED-LOCAL-001');
    assert.equal(report.current.locations[1].imageId, undefined);
    assert.equal(report.current.locations.length, 3);
    assert.ok(report.current.content.welcome.opening);
    assert.equal(report.migrated.accommodations.length, 0);
    assert.ok(report.rawDifferences.some(({ path }) => path === 'locations[1].imageId'));
    assert.deepEqual(report.canonicalDifferences, []);
});

test('one-off tool requires explicit dry-run and rejects unsafe flags', () => {
    assert.equal(parseArguments(['--event', EVENT_ID, '--dry-run']).valid, true);
    assert.equal(parseArguments(['--event', EVENT_ID]).valid, false);
    assert.equal(parseArguments(['--event', EVENT_ID, '--apply']).valid, false);
});
