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
    updateDoc,
    writeBatch
} from 'firebase/firestore';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import {
    createInvitationRevisionId,
    serializeInvitationPublication,
    serializeInvitationRevision
} from '../admin/invitations/core/invitation-publication-schema.js';

const PROJECT_ID = 'demo-eventorastudio-phase62';
const UID = 'UID-PHASE62-RULES';
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
    state.updateDraftField('content.identity.phrase', phrase);
    return state;
}

function publicationDocuments(eventId, uid, revisionNumber = 1, phrase = '') {
    const revisionId = createInvitationRevisionId(revisionNumber);
    const timestamp = serverTimestamp();
    const revision = serializeInvitationRevision(createState(eventId, phrase).getSnapshot().draft, {
        eventId,
        revisionNumber,
        publishedAt: timestamp,
        publishedBy: uid
    });
    const publication = serializeInvitationPublication({
        eventId,
        currentRevisionId: revisionId,
        currentRevisionNumber: revisionNumber,
        publishedAt: timestamp,
        publishedBy: uid
    });
    return { revisionId, revision, publication };
}

async function publishAtomic(db, eventId, uid, revisionNumber = 1, phrase = '') {
    const documents = publicationDocuments(eventId, uid, revisionNumber, phrase);
    const batch = writeBatch(db);
    batch.set(revisionRef(db, eventId, documents.revisionId), documents.revision);
    batch.set(publicationRef(db, eventId), documents.publication);
    await batch.commit();
    return documents;
}

async function seedPublication(eventId) {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        await publishAtomic(admin.firestore(), eventId, 'seed-user');
    });
}

test('CEO, Administrador y Diseñador pueden publicar y leer pointer/revisiones', async () => {
    for (const [role, claimName] of [
        ['CEO', 'role'],
        ['ADMINISTRADOR', 'userRole'],
        ['DISENADOR', 'role']
    ]) {
        const eventId = `EVT-PUBLICATION-${role}`;
        const current = actor(role, claimName);
        const db = current.context.firestore();
        await assertSucceeds(publishAtomic(db, eventId, current.uid));
        const pointer = await assertSucceeds(getDoc(publicationRef(db, eventId)));
        assert.equal(pointer.data().currentRevisionId, 'REV-000001');
        const revisions = await assertSucceeds(getDocs(collection(db, 'eventos', eventId, 'invitacion', 'publication', 'revisions')));
        assert.equal(revisions.size, 1);
    }
});

test('revisiones son inmutables y publication exige el siguiente par atómico', async () => {
    const eventId = 'EVT-PUBLICATION-IMMUTABLE';
    const current = actor('CEO');
    const db = current.context.firestore();
    await assertSucceeds(publishAtomic(db, eventId, current.uid));
    const revision = revisionRef(db, eventId, 'REV-000001');

    await assertFails(updateDoc(revision, { theme: 'garden' }));
    await assertFails(deleteDoc(revision));
    await assertFails(updateDoc(publicationRef(db, eventId), {
        currentRevisionId: 'REV-000002',
        currentRevisionNumber: 2,
        publishedAt: serverTimestamp(),
        publishedBy: current.uid
    }));
    const orphan = publicationDocuments(eventId, current.uid, 2, 'Huérfana');
    const batch = writeBatch(db);
    batch.set(revisionRef(db, eventId, orphan.revisionId), orphan.revision);
    await assertFails(batch.commit());

    await assertSucceeds(publishAtomic(db, eventId, current.uid, 2, 'Versión dos'));
    const pointer = await assertSucceeds(getDoc(publicationRef(db, eventId)));
    assert.equal(pointer.data().currentRevisionId, 'REV-000002');
    assert.equal((await assertSucceeds(getDoc(revision))).exists(), true);
});

test('CLIENTE, VENTAS y público no pueden leer ni publicar', async () => {
    for (const role of ['CLIENTE', 'VENTAS']) {
        const eventId = `EVT-PUBLICATION-DENY-${role}`;
        await seedPublication(eventId);
        const current = actor(role);
        const db = current.context.firestore();
        await assertFails(getDoc(publicationRef(db, eventId)));
        await assertFails(getDoc(revisionRef(db, eventId, 'REV-000001')));
        await assertFails(publishAtomic(db, `${eventId}-WRITE`, current.uid));
    }

    const eventId = 'EVT-PUBLICATION-DENY-PUBLIC';
    await seedPublication(eventId);
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(publicationRef(db, eventId)));
    await assertFails(getDoc(revisionRef(db, eventId, 'REV-000001')));
    await assertFails(publishAtomic(db, `${eventId}-WRITE`, 'spoofed-user'));
});
