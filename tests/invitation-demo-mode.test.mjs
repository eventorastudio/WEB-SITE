import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    createInvitationDraft,
    InvitationBuilderState
} from '../admin/invitations/core/builder-state.js';
import {
    deserializeInvitationDraft,
    serializeInvitationDraft
} from '../admin/invitations/core/draft-persistence-schema.js';
import { InvitationDraftService } from '../admin/invitations/services/invitation-draft-service.js';

const EVENT = {
    nombreEvento: 'Demo segura',
    fecha: '2027-10-18',
    hora: '16:30',
    paquete: 'premium'
};

test('Demo legacy inicia en false, cambia sólo por el switch y conserva dirty', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-DEMO', EVENT);
    assert.equal(state.getSnapshot().draft.settings.demoMode, false);
    assert.equal(state.getSnapshot().ui.isDirty, false);

    const enabled = state.updateDraftField('settings.demoMode', true);
    assert.equal(enabled.ok, true);
    assert.equal(state.getSnapshot().draft.settings.demoMode, true);
    assert.equal(state.getSnapshot().ui.isDirty, true);

    state.updateDraftField('settings.demoMode', false);
    assert.equal(state.getSnapshot().draft.settings.demoMode, false);
});

test('Demo mode roundtrips como booleano y legacy ausente usa false', () => {
    const draft = createInvitationDraft('EVT-DEMO', EVENT);
    draft.settings.demoMode = true;
    const document = serializeInvitationDraft(draft, {
        updatedAt: new Date(),
        updatedBy: 'test-user'
    });
    assert.equal(document.settings.demoMode, true);

    const legacy = structuredClone(document);
    delete legacy.settings.demoMode;
    assert.equal(deserializeInvitationDraft(legacy, 'EVT-DEMO').settings.demoMode, false);

    const invalid = structuredClone(document);
    invalid.settings.demoMode = 'true';
    assert.throws(() => deserializeInvitationDraft(invalid, 'EVT-DEMO'), /invalid-demo-mode/);
});

test('public runtime neutraliza sólo cuando demoMode es true', async () => {
    const source = await readFile(new URL('../admin/invitations/preview/frame.js', import.meta.url), 'utf8');
    assert.match(source, /activePayload\?\.draft\?\.settings\?\.demoMode === true/);
    assert.match(source, /Esta acción está deshabilitada en la demostración\./);
    assert.match(source, /EVENTORA-PREVIEW-QR/);
});

test('Dashboard indexa DEMOS exclusivamente por metadata booleana del evento', async () => {
    const source = await readFile(new URL('../admin/dashboard.js', import.meta.url), 'utf8');
    assert.match(source, /events\.filter\(\(event\) => event\.demoMode === true\)/);
    assert.doesNotMatch(source, /getGuestsByEventId|qrToken|rsvpToken/);
});

function atomicGateway({ failAt = null } = {}) {
    const state = {
        draft: null,
        event: { demoMode: false }
    };
    return {
        state,
        getCurrentUid: () => 'demo-test-user',
        serverTimestamp: () => new Date('2026-08-26T00:00:00.000Z'),
        async writeDraftAndDemoMode(eventId, document) {
            if (failAt) throw new Error(`${failAt} denied`);
            const nextDraft = structuredClone(document);
            const nextEvent = { ...state.event, demoMode: nextDraft.settings.demoMode === true };
            state.draft = nextDraft;
            state.event = nextEvent;
            assert.equal(eventId, 'EVT-DEMO');
        }
    };
}

test('guardado demo atómico confirma draft y metadata juntos', async () => {
    const gateway = atomicGateway();
    const service = new InvitationDraftService({ gateway });
    const draft = createInvitationDraft('EVT-DEMO', EVENT);
    draft.settings.demoMode = true;

    await service.save({ eventId: 'EVT-DEMO', draftEventId: 'EVT-DEMO', draft });
    assert.equal(gateway.state.draft.settings.demoMode, true);
    assert.equal(gateway.state.event.demoMode, true);
});

test('rechazo de metadata no deja el draft actualizado parcialmente', async () => {
    const gateway = atomicGateway({ failAt: 'metadata' });
    gateway.state.draft = { settings: { demoMode: false } };
    const before = structuredClone(gateway.state);
    const service = new InvitationDraftService({ gateway });
    const draft = createInvitationDraft('EVT-DEMO', EVENT);
    draft.settings.demoMode = true;

    await assert.rejects(
        service.save({ eventId: 'EVT-DEMO', draftEventId: 'EVT-DEMO', draft }),
        /draft\/write-failed/
    );
    assert.deepEqual(gateway.state, before);
});

test('rechazo de draft no cambia la metadata parcialmente', async () => {
    const gateway = atomicGateway({ failAt: 'draft' });
    const before = structuredClone(gateway.state);
    const service = new InvitationDraftService({ gateway });
    const draft = createInvitationDraft('EVT-DEMO', EVENT);
    draft.settings.demoMode = true;

    await assert.rejects(
        service.save({ eventId: 'EVT-DEMO', draftEventId: 'EVT-DEMO', draft }),
        /draft\/write-failed/
    );
    assert.deepEqual(gateway.state, before);
});
