import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import {
    deserializeInvitationDraft,
    serializeInvitationDraft
} from '../admin/invitations/core/draft-persistence-schema.js';

const EVENT_ID = 'EVT-QR2-COMPAT';

function persistedDraft() {
    const draft = createInvitationDraft(EVENT_ID, { nombreEvento: 'Evento de prueba', fecha: '2026-12-01' });
    draft.themeId = 'champagne';
    return serializeInvitationDraft(draft, {
        eventId: EVENT_ID,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedBy: 'compat-test'
    });
}

test('QR-2 legacy access fields are normalized on read without a write', () => {
    const document = persistedDraft();
    const { guestLabel, passesLabel, showQr, showPrintPass, printButtonLabel, printTitle, printFooter, ...legacyAccess } = document.content.access;
    document.content.access = legacyAccess;

    const loaded = deserializeInvitationDraft(document, EVENT_ID);
    assert.equal(loaded.content.access.title, '');
    assert.equal(loaded.content.access.showQr, true);
    assert.equal(loaded.content.access.showPrintPass, true);
    assert.equal(loaded.content.access.printButtonLabel, 'Imprimir pase');
    assert.equal(loaded.content.access.printTitle, 'Pase de acceso');
    assert.equal(loaded.content.access.printFooter, 'Presenta este pase al llegar.');
    assert.deepEqual(document.content.access, legacyAccess);
});

test('current canonical access fields continue loading', () => {
    const document = persistedDraft();
    const loaded = deserializeInvitationDraft(document, EVENT_ID);
    assert.equal(loaded.content.access.showQr, true);
    assert.equal(loaded.content.access.showPrintPass, true);
});

test('invalid current document remains rejected', () => {
    const document = persistedDraft();
    document.content.access.unexpected = 'invalid';
    assert.throws(() => deserializeInvitationDraft(document, EVENT_ID), { code: 'draft/non-canonical-document' });
});
