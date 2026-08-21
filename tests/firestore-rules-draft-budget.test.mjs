import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { serializeInvitationDraft } from '../admin/invitations/core/draft-persistence-schema.js';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const ROOT_KEYS = [
    'schemaVersion', 'contentSchemaVersion', 'eventId', 'theme', 'sections', 'content',
    'locations', 'itinerary', 'gifts', 'accommodations', 'links', 'appearance',
    'settings', 'updatedAt', 'updatedBy'
];
const CONTENT_KEYS = [
    'identity', 'schedule', 'place', 'welcome', 'countdown', 'location', 'dressCode',
    'music', 'video', 'gallery', 'gifts', 'passes', 'itinerary', 'access'
];

function validStructuralDraft(data, eventId, uid) {
    return Object.keys(data).length === 15
        && Object.keys(data).every((key) => ROOT_KEYS.includes(key))
        && data.schemaVersion === 2
        && data.contentSchemaVersion === 4
        && data.eventId === eventId
        && Array.isArray(data.sections) && data.sections.length <= 13
        && data.content && typeof data.content === 'object'
        && Object.keys(data.content).length === 14
        && Object.keys(data.content).every((key) => CONTENT_KEYS.includes(key))
        && data.locations.length <= 20
        && data.itinerary.length <= 80
        && data.gifts.length <= 50
        && data.accommodations.length <= 1
        && data.links.length <= 50
        && data.settings?.renderMode === 'builder'
        && data.updatedBy === uid;
}

function validDocument() {
    const state = new InvitationBuilderState();
    state.initialize('EVT-RULE-BUDGET', {
        nombreEvento: 'Evento local', fecha: '2027-11-15', hora: '19:00'
    });
    state.setPackage('premium');
    state.setTheme('champagne');
    state.toggleSection('welcome-story', true);
    return serializeInvitationDraft(state.getSnapshot().draft, {
        eventId: 'EVT-RULE-BUDGET',
        updatedAt: { serverTimestamp: true },
        updatedBy: 'UID-RULE-BUDGET'
    });
}

test('draft Rules usan contrato estructural y permanecen bajo el presupuesto', () => {
    const document = validDocument();
    assert.equal(validStructuralDraft(document, 'EVT-RULE-BUDGET', 'UID-RULE-BUDGET'), true);

    const withRootExtra = { ...document, unexpected: true };
    assert.equal(validStructuralDraft(withRootExtra, 'EVT-RULE-BUDGET', 'UID-RULE-BUDGET'), false);

    const withContentExtra = {
        ...document,
        content: { ...document.content, unexpected: true }
    };
    assert.equal(validStructuralDraft(withContentExtra, 'EVT-RULE-BUDGET', 'UID-RULE-BUDGET'), false);

    assert.equal(validStructuralDraft({ ...document, schemaVersion: 1 }, 'EVT-RULE-BUDGET', 'UID-RULE-BUDGET'), false);
    assert.equal(validStructuralDraft({ ...document, locations: Array(21).fill({}) }, 'EVT-RULE-BUDGET', 'UID-RULE-BUDGET'), false);
    assert.equal(validStructuralDraft({ ...document, updatedBy: 'UID-OTHER' }, 'EVT-RULE-BUDGET', 'UID-RULE-BUDGET'), false);

    const draftFunction = rules.match(/function validInvitationDraftWrite\(eventId\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
    assert.doesNotMatch(draftFunction, /validDraftContent\(data\.content\)/);
    const snapshotFunction = rules.match(/function validInvitationSnapshot\(data, eventId\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
    assert.match(snapshotFunction, /data\.content\.keys\(\)\.size\(\) == 14/);
    assert.match(snapshotFunction, /data\.content\.keys\(\)\.hasOnly\(\[/);
    assert.match(rules, /isThemeEditor\(\) && validInvitationDraftWrite\(eventId\)/);
});
