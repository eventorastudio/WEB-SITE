import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationDraft, InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import {
    deserializeInvitationDraft,
    serializeInvitationDraft
} from '../admin/invitations/core/draft-persistence-schema.js';

const EVENT_ID = 'EVT-QR2-SAVE';

function draft() {
    const value = createInvitationDraft(EVENT_ID, { nombreEvento: 'Evento de prueba', fecha: '2026-12-01' });
    value.themeId = 'champagne';
    value.enabledSections = ['welcome-story', 'access-preview'];
    return value;
}

function noUndefined(value, path = 'root') {
    if (value === undefined) throw new Error(`undefined:${path}`);
    if (Array.isArray(value)) value.forEach((item, index) => noUndefined(item, `${path}[${index}]`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => noUndefined(item, `${path}.${key}`));
}

function serialize(value) {
    return serializeInvitationDraft(value, {
        eventId: EVENT_ID,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedBy: 'save-test'
    });
}

test('legacy access draft can be normalized, edited and serialized as current payload', () => {
    const original = serialize(draft());
    const { guestLabel, passesLabel, showQr, showPrintPass, printButtonLabel, printTitle, printFooter, ...legacyAccess } = original.content.access;
    original.content.access = legacyAccess;
    const loaded = deserializeInvitationDraft(original, EVENT_ID);
    const state = new InvitationBuilderState();
    state.initialize(EVENT_ID, { nombreEvento: 'Evento de prueba', fecha: '2026-12-01' });
    state.hydrateDraft(loaded);
    state.updateDraftField('content.access.title', 'Pase de acceso');
    const saved = serialize(state.getSnapshot().draft);
    assert.equal(saved.content.access.showQr, true);
    assert.equal(saved.content.access.showPrintPass, true);
    noUndefined(saved);
});

test('complete QR-2 access content serializes and reloads canonically', () => {
    const saved = serialize(draft());
    const loaded = deserializeInvitationDraft(saved, EVENT_ID);
    assert.equal(loaded.content.access.printFooter, 'Presenta este pase al llegar.');
    noUndefined(saved);
});

test('invalid draft data continues to be rejected', () => {
    const value = draft();
    value.themeId = 'invalid-theme';
    assert.throws(() => serialize(value), { code: 'draft/unknown-theme' });
});
