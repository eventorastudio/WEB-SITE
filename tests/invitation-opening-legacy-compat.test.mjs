import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import {
    deserializeInvitationDraft,
    serializeInvitationDraft
} from '../admin/invitations/core/draft-persistence-schema.js';

const EVENT_ID = 'EVT-OPENING-COMPAT';
const OPTIONS = {
    eventId: EVENT_ID,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedBy: 'opening-test'
};

function persistedDraft() {
    const draft = createInvitationDraft(EVENT_ID, {
        nombreEvento: 'Ana & Luis',
        fecha: '2027-06-20',
        tipoEvento: 'Boda'
    });
    draft.themeId = 'aloha';
    return serializeInvitationDraft(draft, OPTIONS);
}

test('legacy welcome without opening loads with in-memory defaults only', () => {
    const document = persistedDraft();
    delete document.content.welcome.opening;

    const loaded = deserializeInvitationDraft(document, EVENT_ID);

    assert.equal(document.content.welcome.opening, undefined);
    assert.equal(loaded.content.welcome.opening.title, 'ALOHA');
    assert.equal(loaded.content.welcome.opening.stampLine1, 'Boda');
    assert.equal(loaded.content.welcome.opening.stampLine2, '2027');
});

test('current welcome opening loads and remains persisted on save', () => {
    const document = persistedDraft();
    document.content.welcome.opening.title = 'Celebración';
    const loaded = deserializeInvitationDraft(document, EVENT_ID);

    assert.equal(loaded.content.welcome.opening.title, 'Celebración');
    const saved = serializeInvitationDraft(loaded, OPTIONS);
    assert.equal(saved.content.welcome.opening.title, 'Celebración');
});
