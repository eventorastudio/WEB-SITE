import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch
} from 'firebase/firestore';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import {
    createInvitationRevisionId,
    serializeInvitationPublication,
    serializeInvitationRevision
} from '../admin/invitations/core/invitation-publication-schema.js';
import { serializePublicInvitationProjection } from '../admin/invitations/core/invitation-public-projection.js';
import { serializeInvitationDraft } from '../admin/invitations/core/draft-persistence-schema.js';

const PROJECT_ID = 'demo-eventorastudio-phase63';
const UID = 'UID-PHASE63-RULES';
const PUBLIC_KEY = 'b'.repeat(48);
const ROTATED_KEY = 'c'.repeat(48);
let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
});

after(async () => {
    await testEnv?.cleanup();
});

function actor(role, claimName = 'role') {
    const uid = `${UID}-${role}-${claimName}`;
    return { uid, context: testEnv.authenticatedContext(uid, { [claimName]: role }) };
}

function publicationRef(db, eventId) {
    return doc(db, 'eventos', eventId, 'invitacion', 'publication');
}

function revisionRef(db, eventId, revisionId) {
    return doc(db, 'eventos', eventId, 'invitacion', 'publication', 'revisions', revisionId);
}

function publicProjectionRef(db, eventId, publicKey = PUBLIC_KEY) {
    return doc(db, 'eventos', eventId, 'invitacionPublic', publicKey);
}

function draftRef(db, eventId) {
    return doc(db, 'eventos', eventId, 'invitacion', 'draft');
}

function createState(eventId, phrase = '') {
    const state = new InvitationBuilderState();
    state.initialize(eventId, {
        nombreEvento: 'María & Fernando',
        tipoEvento: 'Boda',
        fecha: '2027-11-15',
        hora: '19:00',
        ciudad: 'Saltillo',
        estado: 'Coahuila'
    });
    state.setPackage('premium');
    state.setTheme('champagne');
    state.toggleSection('welcome-story', true);
    state.toggleSection('rsvp', true);
    state.updateDraftField('content.identity.phrase', phrase);
    return state;
}

function publicationDocuments(eventId, uid, revisionNumber = 1, phrase = '', publicKey = PUBLIC_KEY) {
    const revisionId = createInvitationRevisionId(revisionNumber);
    const timestamp = serverTimestamp();
    const draft = createState(eventId, phrase).getSnapshot().draft;
    const revision = serializeInvitationRevision(draft, {
        eventId,
        revisionNumber,
        publishedAt: timestamp,
        publishedBy: uid
    });
    const publication = serializeInvitationPublication({
        eventId,
        publicKey,
        currentRevisionId: revisionId,
        currentRevisionNumber: revisionNumber,
        publishedAt: timestamp,
        publishedBy: uid
    });
    const publicProjection = serializePublicInvitationProjection(revision, {
        eventId,
        publicKey,
        revisionId,
        media: draft.media,
        touchedMediaRoles: draft.meta.touchedMediaRoles
    });
    return { revisionId, revision, publication, publicProjection, publicKey };
}

async function publishAtomic(db, eventId, uid, revisionNumber = 1, phrase = '', publicKey = PUBLIC_KEY) {
    const documents = publicationDocuments(eventId, uid, revisionNumber, phrase, publicKey);
    const batch = writeBatch(db);
    batch.set(revisionRef(db, eventId, documents.revisionId), documents.revision);
    batch.set(publicationRef(db, eventId), documents.publication);
    batch.set(publicProjectionRef(db, eventId, publicKey), documents.publicProjection);
    await batch.commit();
    return documents;
}

test('admin publica revision, pointer y proyección pública en un write atómico', async () => {
    for (const [role, claimName] of [
        ['CEO', 'role'],
        ['ADMINISTRADOR', 'userRole'],
        ['DISENADOR', 'role']
    ]) {
        const eventId = `EVT-PUBLIC-${role}`;
        const current = actor(role, claimName);
        const db = current.context.firestore();
        await assertSucceeds(publishAtomic(db, eventId, current.uid));
        assert.equal((await assertSucceeds(getDoc(publicationRef(db, eventId)))).data().publicKey, PUBLIC_KEY);
        assert.equal((await assertSucceeds(getDoc(publicProjectionRef(db, eventId)))).data().revisionId, 'REV-000001');
    }
});

test('GET público exacto pasa; key inválida, LIST y escrituras públicas se deniegan', async () => {
    const eventId = 'EVT-PUBLIC-READ';
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        await publishAtomic(admin.firestore(), eventId, 'seed-user');
    });
    const publicDb = testEnv.unauthenticatedContext().firestore();
    const projection = await assertSucceeds(getDoc(publicProjectionRef(publicDb, eventId)));
    assert.equal(projection.data().revisionId, 'REV-000001');
    await assertFails(getDoc(publicProjectionRef(publicDb, eventId, 'invalid-key')));
    await assertFails(getDoc(publicProjectionRef(publicDb, eventId, ROTATED_KEY)));
    await assertFails(getDocs(collection(publicDb, 'eventos', eventId, 'invitacionPublic')));
    await assertFails(setDoc(publicProjectionRef(publicDb, eventId), projection.data()));

    for (const role of ['CLIENTE', 'VENTAS']) {
        const current = actor(role);
        await assertFails(setDoc(publicProjectionRef(current.context.firestore(), eventId), projection.data()));
    }
});

test('republicar actualiza la misma proyección y no permite rotar publicKey', async () => {
    const eventId = 'EVT-PUBLIC-REPUBLISH';
    const current = actor('CEO');
    const db = current.context.firestore();
    await assertSucceeds(publishAtomic(db, eventId, current.uid, 1, 'Versión uno'));
    await assertSucceeds(publishAtomic(db, eventId, current.uid, 2, 'Versión dos'));

    const projection = await assertSucceeds(getDoc(publicProjectionRef(testEnv.unauthenticatedContext().firestore(), eventId)));
    assert.equal(projection.data().revisionId, 'REV-000002');
    assert.equal(projection.data().content.identity.phrase, 'Versión dos');
    assert.equal((await assertSucceeds(getDoc(revisionRef(db, eventId, 'REV-000001')))).exists(), true);

    const rotated = publicationDocuments(eventId, current.uid, 3, 'Versión tres', ROTATED_KEY);
    const batch = writeBatch(db);
    batch.set(revisionRef(db, eventId, rotated.revisionId), rotated.revision);
    batch.set(publicationRef(db, eventId), rotated.publication);
    batch.set(publicProjectionRef(db, eventId, ROTATED_KEY), rotated.publicProjection);
    await assertFails(batch.commit());
    await assertFails(deleteDoc(publicProjectionRef(db, eventId)));
});

test('publication 6.2 migra a publicKey/proyección sin crear otra revisión', async () => {
    const eventId = 'EVT-PUBLIC-MIGRATION';
    const seed = publicationDocuments(eventId, 'seed-user');
    const legacyPublication = { ...seed.publication, schemaVersion: 1 };
    delete legacyPublication.publicKey;
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        const batch = writeBatch(admin.firestore());
        batch.set(revisionRef(admin.firestore(), eventId, seed.revisionId), seed.revision);
        batch.set(publicationRef(admin.firestore(), eventId), legacyPublication);
        await batch.commit();
    });

    const current = actor('CEO');
    const db = current.context.firestore();
    const stored = (await assertSucceeds(getDoc(publicationRef(db, eventId)))).data();
    const migrated = serializeInvitationPublication({
        eventId,
        publicKey: PUBLIC_KEY,
        currentRevisionId: stored.currentRevisionId,
        currentRevisionNumber: stored.currentRevisionNumber,
        publishedAt: stored.publishedAt,
        publishedBy: stored.publishedBy
    });
    const batch = writeBatch(db);
    batch.set(publicationRef(db, eventId), migrated);
    batch.set(publicProjectionRef(db, eventId), seed.publicProjection);
    await assertSucceeds(batch.commit());
    assert.equal((await assertSucceeds(getDoc(publicProjectionRef(testEnv.unauthenticatedContext().firestore(), eventId)))).data().revisionId, 'REV-000001');
    assert.equal((await assertSucceeds(getDocs(collection(db, 'eventos', eventId, 'invitacion', 'publication', 'revisions')))).size, 1);
});

test('public projection permits rsvp/access-preview but rejects pass-selection', async () => {
    const eventId = 'EVT-PUBLIC-SECTIONS';
    const current = actor('CEO');
    const db = current.context.firestore();
    const documents = publicationDocuments(eventId, current.uid);

    const publicProjection = {
        ...documents.publicProjection,
        sections: ['welcome-story', 'rsvp', 'access-preview']
    };
    const validBatch = writeBatch(db);
    validBatch.set(revisionRef(db, eventId, documents.revisionId), documents.revision);
    validBatch.set(publicationRef(db, eventId), documents.publication);
    validBatch.set(publicProjectionRef(db, eventId), publicProjection);
    await assertSucceeds(validBatch.commit());

    const invalidProjection = {
        ...publicProjection,
        sections: ['welcome-story', 'rsvp', 'access-preview', 'pass-selection']
    };
    await assertFails(setDoc(publicProjectionRef(db, eventId), invalidProjection));
});

test('demoMode en settings acepta legacy/booleanos y rechaza tipos o claves extra', async () => {
    const cases = [
        ['legacy', undefined, true],
        ['true', true, true],
        ['false', false, true],
        ['string', 'true', false],
        ['object', {}, false],
        ['extra', true, false]
    ];
    for (const [label, value, allowed] of cases) {
        const eventId = `EVT-DEMO-SETTINGS-${label.toUpperCase()}`;
        const current = actor('DISENADOR');
        const draft = serializeInvitationDraft(createState(eventId).getSnapshot().draft, {
            eventId,
            updatedAt: serverTimestamp(),
            updatedBy: current.uid
        });
        if (value === undefined) delete draft.settings.demoMode;
        else draft.settings.demoMode = value;
        if (label === 'extra') draft.settings.unexpected = true;
        const operation = setDoc(draftRef(current.context.firestore(), eventId), draft);
        if (allowed) await assertSucceeds(operation);
        else await assertFails(operation);
    }
});

test('demoMode metadata sólo permite el cambio booleano aislado al theme editor', async () => {
    const eventId = 'EVT-DEMO-METADATA';
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        await setDoc(doc(admin.firestore(), 'eventos', eventId), { demoMode: false, nombreEvento: 'Demo' });
    });
    const designer = actor('DISENADOR');
    const designerDb = designer.context.firestore();
    await assertSucceeds(updateDoc(doc(designerDb, 'eventos', eventId), { demoMode: true }));
    await assertSucceeds(updateDoc(doc(designerDb, 'eventos', eventId), { demoMode: false }));
    await assertFails(updateDoc(doc(designerDb, 'eventos', eventId), { demoMode: true, nombreEvento: 'Cambio' }));
    await assertFails(updateDoc(doc(designerDb, 'eventos', eventId), { demoMode: 'true' }));

    const manager = actor('CEO');
    await assertSucceeds(updateDoc(doc(manager.context.firestore(), 'eventos', eventId), { nombreEvento: 'Manager' }));
});
