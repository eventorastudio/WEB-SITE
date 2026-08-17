import test from 'node:test';
import assert from 'node:assert/strict';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { InvitationPublicationService } from '../admin/invitations/services/invitation-publication-service.js';

const EVENT_ID = 'EVT-0001';
const UID = 'UID-PHASE62';

function eventData() {
    return {
        nombreEvento: 'María & Fernando',
        tipoEvento: 'Boda',
        fecha: '2027-11-15',
        hora: '19:00',
        ciudad: 'Saltillo',
        estado: 'Coahuila'
    };
}

function createState() {
    const state = new InvitationBuilderState();
    state.initialize(EVENT_ID, eventData());
    state.setPackage('premium');
    state.setTheme('champagne');
    state.toggleSection('welcome-story', true);
    state.addAccommodation({ name: 'Hotel Centro', reservationUrl: 'https://example.com/reservar' });
    return state;
}

function createGateway() {
    let publication = null;
    const revisions = new Map();
    const commits = [];
    let timestampSequence = 0;
    return {
        commits,
        revisions,
        get publication() { return publication == null ? null : structuredClone(publication); },
        getCurrentUid: () => UID,
        async runPublicationTransaction(eventId, planner) {
            const currentPublication = publication == null ? null : structuredClone(publication);
            const currentRevision = currentPublication == null
                ? null
                : structuredClone(revisions.get(currentPublication.currentRevisionId));
            const plan = planner({
                currentPublication,
                currentRevision,
                serverTimestamp: () => new Date(`2026-08-17T07:00:0${timestampSequence++}.000Z`)
            });
            if (plan.status === 'unchanged') return plan;
            if (revisions.has(plan.revisionId)) throw new Error('publication/revision-id-conflict');
            revisions.set(plan.revisionId, structuredClone(plan.revision));
            publication = structuredClone(plan.publication);
            commits.push({
                eventId,
                publicationPath: `eventos/${eventId}/invitacion/publication`,
                revisionPath: `eventos/${eventId}/invitacion/publication/revisions/${plan.revisionId}`
            });
            return plan;
        }
    };
}

test('primera publicación crea revision + pointer', async () => {
    const gateway = createGateway();
    const state = createState();
    const result = await new InvitationPublicationService({ gateway }).publishState(state, EVENT_ID);

    assert.equal(result.status, 'published');
    assert.equal(result.revisionId, 'REV-000001');
    assert.equal(result.revisionNumber, 1);
    assert.equal(gateway.publication.currentRevisionId, 'REV-000001');
    assert.equal(gateway.publication.currentRevisionNumber, 1);
    assert.equal(gateway.revisions.get('REV-000001').accommodations[0].name, 'Hotel Centro');
    assert.equal(Object.hasOwn(gateway.revisions.get('REV-000001'), 'media'), false);
    assert.equal(Object.hasOwn(gateway.revisions.get('REV-000001').content, 'rsvp'), false);
    assert.equal(gateway.commits[0].publicationPath, `eventos/${EVENT_ID}/invitacion/publication`);
    assert.equal(gateway.commits[0].revisionPath, `eventos/${EVENT_ID}/invitacion/publication/revisions/REV-000001`);
});

test('segunda publicación modificada crea nueva revision y conserva la anterior', async () => {
    const gateway = createGateway();
    const service = new InvitationPublicationService({ gateway });
    const state = createState();
    await service.publishState(state, EVENT_ID);
    const original = structuredClone(gateway.revisions.get('REV-000001'));
    state.updateDraftField('content.identity.phrase', 'Versión publicada número dos');

    const result = await service.publishState(state, EVENT_ID);

    assert.equal(result.status, 'published');
    assert.equal(result.revisionId, 'REV-000002');
    assert.equal(result.revisionNumber, 2);
    assert.equal(gateway.revisions.size, 2);
    assert.deepEqual(gateway.revisions.get('REV-000001'), original);
    assert.equal(gateway.revisions.get('REV-000002').content.identity.phrase, 'Versión publicada número dos');
    assert.equal(gateway.publication.currentRevisionId, 'REV-000002');
    assert.equal(gateway.publication.currentRevisionNumber, 2);
});

test('publicación idéntica devuelve unchanged sin crear revision duplicada', async () => {
    const gateway = createGateway();
    const service = new InvitationPublicationService({ gateway });
    const state = createState();
    await service.publishState(state, EVENT_ID);

    const result = await service.publishState(state, EVENT_ID);

    assert.equal(result.status, 'unchanged');
    assert.equal(result.revisionId, 'REV-000001');
    assert.equal(result.revisionNumber, 1);
    assert.equal(gateway.revisions.size, 1);
    assert.equal(gateway.commits.length, 1);
});
