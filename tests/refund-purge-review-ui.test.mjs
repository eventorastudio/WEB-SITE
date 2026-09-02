import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    areConfirmationsComplete,
    canAuthorizeReview,
    expectedConfirmationPhrase,
    summarizeDryRun
} from '../admin/modules/purge/refund-purge-review.js';

test('la UI exige todos los checkboxes y frase exacta', () => {
    const confirmations = {
        refundProcessed: true,
        eventAndReferenceReviewed: true,
        irreversibleUnderstood: true,
        commercialRecordsPreserved: true
    };
    assert.equal(areConfirmationsComplete(confirmations), true);
    assert.equal(expectedConfirmationPhrase('EVT-1', 'FOLIO-1'), 'PURGAR EVT-1 FOLIO-1');
    assert.equal(canAuthorizeReview({
        dryRun: { status: 'DRY_RUN_READY', blockers: [] },
        phrase: 'PURGAR EVT-1 FOLIO-1',
        expectedPhrase: 'PURGAR EVT-1 FOLIO-1',
        confirmations,
        freshAuthConfirmed: true
    }), true);
    assert.equal(canAuthorizeReview({
        dryRun: { status: 'DRY_RUN_READY', blockers: [{ code: 'UNKNOWN_STORAGE_ASSET' }] },
        phrase: 'PURGAR EVT-1 FOLIO-1', expectedPhrase: 'PURGAR EVT-1 FOLIO-1', confirmations
    }), false);
});

test('el resumen sólo expone conteos técnicos y la UI no persiste confirmaciones ni ejecuta', async () => {
    assert.deepEqual(summarizeDryRun({ counts: { firestoreDocuments: 12, invitados: 2, rsvpAccess: 1, rsvpResponses: 1, publicProjections: 1 } }), {
        firestore: 12, guests: 2, rsvp: 2, checkins: 0, publications: 1, media: 0,
        storage: 0, sharedDemo: 0, profiles: 0, warnings: 0, blockers: 0
    });
    const source = await readFile(new URL('../admin/refund-purge.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage|executeRefundProjectPurge/);
    assert.match(source, /textContent/);
});

test('la UI exige una intención explícita y muestra aviso para terminación completa', async () => {
    const source = await readFile(new URL('../admin/refund-purge.js', import.meta.url), 'utf8');
    const html = await readFile(new URL('../admin/refund-purge.html', import.meta.url), 'utf8');
    assert.match(html, /SERVICE_CONTINUES/);
    assert.match(html, /COMPLETE_TERMINATION/);
    assert.match(html, /termination-warning/);
    assert.match(source, /terminationIntent: selectedTerminationIntent\(\)/);
    assert.doesNotMatch(html, /checked[^>]*value="COMPLETE_TERMINATION"/);
});
