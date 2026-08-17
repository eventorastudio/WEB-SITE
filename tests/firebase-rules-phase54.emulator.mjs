import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
    Timestamp,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    writeBatch
} from 'firebase/firestore';

const PROJECT_ID = 'demo-eventorastudio-phase54';
const TOKEN = 'T'.repeat(43);
const OTHER_TOKEN = 'U'.repeat(43);
const CONFIG_KEY = 'C'.repeat(43);
const OTHER_CONFIG_KEY = 'D'.repeat(43);
const FUTURE = Timestamp.fromDate(new Date('2035-01-01T00:00:00.000Z'));
const PAST = Timestamp.fromDate(new Date('2020-01-01T00:00:00.000Z'));

let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
});

after(async () => {
    await testEnv?.cleanup();
});

function context(role = 'CLIENTE', claimName = 'role') {
    const uid = `UID-54-${role}-${claimName}`;
    return { uid, context: testEnv.authenticatedContext(uid, { [claimName]: role }) };
}

function accessRef(db, eventId, token = TOKEN) {
    return doc(db, 'eventos', eventId, 'rsvpAccess', token);
}

function publicRef(db, eventId, configKey = CONFIG_KEY) {
    return doc(db, 'eventos', eventId, 'rsvpPublic', configKey);
}

function responseRef(db, eventId, token = TOKEN) {
    return doc(db, 'eventos', eventId, 'rsvpResponses', token);
}

function publicationRef(db, eventId) {
    return doc(db, 'eventos', eventId, 'invitacion', 'rsvpPublication');
}

function accessDocument(eventId, overrides = {}) {
    return {
        schemaVersion: 2,
        eventId,
        guestId: 'INV-0001',
        configKey: CONFIG_KEY,
        displayName: 'Andrea Téllez',
        passLimit: 4,
        active: true,
        expiresAt: null,
        ...overrides
    };
}

function publicDocument(eventId, overrides = {}) {
    return {
        schemaVersion: 1,
        eventId,
        enabled: true,
        title: 'Confirma tu asistencia',
        message: 'Nos encantará contar contigo.',
        buttonLabel: 'Enviar respuesta',
        method: 'internal',
        guestPolicy: 'assigned-only',
        responses: {
            acceptedLabel: 'Sí asistiré',
            declinedLabel: 'No podré asistir',
            confirmationMessage: 'Gracias por responder.'
        },
        whatsapp: { phone: '', message: '' },
        deadlineTimeZone: 'America/Mexico_City',
        responseClosesAt: FUTURE,
        ...overrides
    };
}

function responseDocument(eventId, overrides = {}) {
    return {
        schemaVersion: 1,
        eventId,
        guestId: 'INV-0001',
        status: 'accepted',
        passesConfirmed: 4,
        respondedAt: serverTimestamp(),
        ...overrides
    };
}

function seededResponseDocument(eventId, overrides = {}) {
    return {
        ...responseDocument(eventId, overrides),
        respondedAt: Timestamp.fromDate(new Date('2026-08-17T00:00:00.000Z'))
    };
}

function publicationDocument(eventId, configKey = CONFIG_KEY, overrides = {}) {
    return {
        schemaVersion: 1,
        eventId,
        configKey,
        createdAt: Timestamp.fromDate(new Date('2026-08-17T00:00:00.000Z')),
        createdBy: 'UID-SEED',
        updatedAt: Timestamp.fromDate(new Date('2026-08-17T00:00:00.000Z')),
        updatedBy: 'UID-SEED',
        ...overrides
    };
}

function privateRsvpDocument(eventId, uid) {
    return {
        schemaVersion: 2,
        contentSchemaVersion: 4,
        eventId,
        enabled: true,
        title: 'Confirma tu asistencia',
        message: 'Nos encantará contar contigo.',
        buttonLabel: 'Enviar respuesta',
        deadline: '2034-12-31',
        deadlineTime: '18:00',
        deadlineTimeZone: 'America/Mexico_City',
        responseClosesAt: FUTURE,
        method: 'internal',
        whatsapp: { phone: '', message: '' },
        guestPolicy: 'assigned-only',
        responses: {
            acceptedLabel: 'Sí asistiré',
            declinedLabel: 'No podré asistir',
            confirmationMessage: 'Gracias por responder.'
        },
        touchedPaths: [],
        updatedAt: serverTimestamp(),
        updatedBy: uid
    };
}

async function seed(path, data) {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        await setDoc(doc(admin.firestore(), ...path), data);
    });
}

async function seedBundle(eventId, {
    token = TOKEN,
    access = accessDocument(eventId),
    configKey = CONFIG_KEY,
    config = publicDocument(eventId),
    response = undefined
} = {}) {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        const db = admin.firestore();
        await setDoc(accessRef(db, eventId, token), access);
        await setDoc(publicRef(db, eventId, configKey), config);
        if (response !== undefined) await setDoc(responseRef(db, eventId, token), response);
    });
}

test('1. config pública: GET exacto anónimo válido pasa', async () => {
    const eventId = 'EVT-54-CONFIG-ANON';
    await seed(['eventos', eventId, 'rsvpPublic', CONFIG_KEY], publicDocument(eventId));
    await assertSucceeds(getDoc(publicRef(testEnv.unauthenticatedContext().firestore(), eventId)));
});

test('2. config pública: GET exacto autenticado no se rompe por Auth', async () => {
    const eventId = 'EVT-54-CONFIG-AUTH';
    await seed(['eventos', eventId, 'rsvpPublic', CONFIG_KEY], publicDocument(eventId));
    for (const role of ['CLIENTE', 'ROL-DESCONOCIDO', 'CEO']) {
        await assertSucceeds(getDoc(publicRef(context(role).context.firestore(), eventId)));
    }
});

test('3. config pública: wrong event, key malformada y disabled se deniegan', async () => {
    const anonymous = testEnv.unauthenticatedContext().firestore();
    await seed(['eventos', 'EVT-54-CONFIG-WRONG', 'rsvpPublic', CONFIG_KEY], publicDocument('EVT-OTHER'));
    await assertFails(getDoc(publicRef(anonymous, 'EVT-54-CONFIG-WRONG')));
    await seed(['eventos', 'EVT-54-CONFIG-SHORT', 'rsvpPublic', 'short'], publicDocument('EVT-54-CONFIG-SHORT'));
    await assertFails(getDoc(publicRef(anonymous, 'EVT-54-CONFIG-SHORT', 'short')));
    await seed(['eventos', 'EVT-54-CONFIG-DISABLED', 'rsvpPublic', CONFIG_KEY], publicDocument('EVT-54-CONFIG-DISABLED', { enabled: false }));
    await assertFails(getDoc(publicRef(anonymous, 'EVT-54-CONFIG-DISABLED')));
});

test('4. config pública: LIST y query se deniegan', async () => {
    const eventId = 'EVT-54-CONFIG-LIST';
    await seed(['eventos', eventId, 'rsvpPublic', CONFIG_KEY], publicDocument(eventId));
    for (const db of [
        testEnv.unauthenticatedContext().firestore(),
        context('CLIENTE').context.firestore(),
        context('ROL-DESCONOCIDO').context.firestore(),
        context('CEO').context.firestore()
    ]) {
        const configs = collection(db, 'eventos', eventId, 'rsvpPublic');
        await assertFails(getDocs(configs));
        await assertFails(getDocs(query(configs, where('enabled', '==', true))));
    }
});

test('5. config pública: CREATE, UPDATE y DELETE públicos se deniegan', async () => {
    const actors = [
        testEnv.unauthenticatedContext().firestore(),
        context('CLIENTE').context.firestore(),
        context('ROL-DESCONOCIDO').context.firestore()
    ];
    for (const [index, db] of actors.entries()) {
        const eventId = `EVT-54-CONFIG-WRITES-${index}`;
        await assertFails(setDoc(publicRef(db, eventId), publicDocument(eventId)));
        await seed(['eventos', eventId, 'rsvpPublic', CONFIG_KEY], publicDocument(eventId));
        await assertFails(updateDoc(publicRef(db, eventId), { title: 'Ataque' }));
        await assertFails(deleteDoc(publicRef(db, eventId)));
    }
});

for (const [role, claimName] of [['CEO', 'role'], ['ADMINISTRADOR', 'userRole'], ['DISENADOR', 'role']]) {
    test(`6.${role}: rol interno gestiona config pública exacta`, async () => {
        const eventId = `EVT-54-CONFIG-${role}`;
        const actor = context(role, claimName);
        const reference = publicRef(actor.context.firestore(), eventId);
        await assertSucceeds(setDoc(reference, publicDocument(eventId)));
        await assertSucceeds(getDoc(reference));
        await assertSucceeds(updateDoc(reference, { title: `Título ${role}` }));
        await assertFails(deleteDoc(reference));
    });
}

test('7. publication metadata: acceso público denegado y escritura interna estricta', async () => {
    const eventId = 'EVT-54-PUBLICATION';
    const anonymousRef = publicationRef(testEnv.unauthenticatedContext().firestore(), eventId);
    await seed(['eventos', eventId, 'invitacion', 'rsvpPublication'], publicationDocument(eventId));
    await assertFails(getDoc(anonymousRef));
    await assertFails(updateDoc(anonymousRef, { configKey: OTHER_CONFIG_KEY }));
    const actor = context('CEO');
    const internalRef = publicationRef(actor.context.firestore(), eventId);
    await assertSucceeds(getDoc(internalRef));
    await assertSucceeds(updateDoc(internalRef, { updatedAt: serverTimestamp(), updatedBy: actor.uid }));
    await assertFails(updateDoc(internalRef, { configKey: OTHER_CONFIG_KEY, updatedAt: serverTimestamp(), updatedBy: actor.uid }));
    await assertFails(deleteDoc(internalRef));
});

test('8. Access create exige configKey canónica del mismo evento', async () => {
    const eventId = 'EVT-54-ACCESS-RELATION';
    const actor = context('CEO');
    await seed(['eventos', eventId, 'invitacion', 'rsvpPublication'], publicationDocument(eventId));
    await assertSucceeds(setDoc(accessRef(actor.context.firestore(), eventId), accessDocument(eventId)));
    await assertFails(setDoc(accessRef(actor.context.firestore(), eventId, OTHER_TOKEN), accessDocument(eventId, { configKey: OTHER_CONFIG_KEY })));
    for (const field of ['token', 'qrToken', 'createdBy', 'updatedBy', 'uid', 'correo']) {
        await assertFails(setDoc(
            accessRef(actor.context.firestore(), eventId, OTHER_TOKEN),
            accessDocument(eventId, { [field]: 'INTERNAL-LEAK' })
        ));
    }
});

test('8A. publicación inicial acepta private + metadata + public en un batch atómico', async () => {
    const eventId = 'EVT-54-ATOMIC-PASS';
    const actor = context('CEO');
    const db = actor.context.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'eventos', eventId, 'invitacion', 'rsvp'), privateRsvpDocument(eventId, actor.uid));
    batch.set(publicationRef(db, eventId), publicationDocument(eventId, CONFIG_KEY, {
        createdAt: serverTimestamp(), createdBy: actor.uid,
        updatedAt: serverTimestamp(), updatedBy: actor.uid
    }));
    batch.set(publicRef(db, eventId), publicDocument(eventId));
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(publicationRef(db, eventId)));
});

test('8B. fallo de proyección aborta también private y metadata', async () => {
    const eventId = 'EVT-54-ATOMIC-FAIL';
    const actor = context('CEO');
    const db = actor.context.firestore();
    const batch = writeBatch(db);
    const privateReference = doc(db, 'eventos', eventId, 'invitacion', 'rsvp');
    batch.set(privateReference, privateRsvpDocument(eventId, actor.uid));
    batch.set(publicationRef(db, eventId), publicationDocument(eventId, CONFIG_KEY, {
        createdAt: serverTimestamp(), createdBy: actor.uid,
        updatedAt: serverTimestamp(), updatedBy: actor.uid
    }));
    batch.set(publicRef(db, eventId), publicDocument(eventId, { internalLeak: true }));
    await assertFails(batch.commit());
    assert.equal((await getDoc(privateReference)).exists(), false);
    assert.equal((await getDoc(publicationRef(db, eventId))).exists(), false);
});

test('9. response GET: bearer válido anónimo pasa', async () => {
    const eventId = 'EVT-54-GET-ANON';
    await seedBundle(eventId, { response: seededResponseDocument(eventId) });
    await assertSucceeds(getDoc(responseRef(testEnv.unauthenticatedContext().firestore(), eventId)));
});

test('10. response GET: bearer autenticado pasa', async () => {
    const eventId = 'EVT-54-GET-AUTH';
    await seedBundle(eventId, { response: seededResponseDocument(eventId) });
    await assertSucceeds(getDoc(responseRef(context('CLIENTE').context.firestore(), eventId)));
});

test('10A. bearer autenticado no-admin puede CREATE y UPDATE igual que anonimo', async () => {
    const eventId = 'EVT-54-WRITE-AUTH';
    await seedBundle(eventId);
    const db = context('CLIENTE').context.firestore();
    await assertSucceeds(setDoc(responseRef(db, eventId), responseDocument(eventId)));
    await assertSucceeds(updateDoc(responseRef(db, eventId), {
        status: 'declined',
        passesConfirmed: 0,
        respondedAt: serverTimestamp()
    }));
});

test('11. response GET: revoked y expired se deniegan', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await seedBundle('EVT-54-GET-REVOKED', {
        access: accessDocument('EVT-54-GET-REVOKED', { active: false }),
        config: publicDocument('EVT-54-GET-REVOKED'),
        response: seededResponseDocument('EVT-54-GET-REVOKED')
    });
    await assertFails(getDoc(responseRef(db, 'EVT-54-GET-REVOKED')));
    await seedBundle('EVT-54-GET-EXPIRED', {
        access: accessDocument('EVT-54-GET-EXPIRED', { expiresAt: PAST }),
        config: publicDocument('EVT-54-GET-EXPIRED'),
        response: seededResponseDocument('EVT-54-GET-EXPIRED')
    });
    await assertFails(getDoc(responseRef(db, 'EVT-54-GET-EXPIRED')));
});

test('12. response GET: wrong event, malformed token y wrong config relation se deniegan', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await seedBundle('EVT-54-GET-WRONG-EVENT', {
        access: accessDocument('EVT-OTHER'),
        config: publicDocument('EVT-54-GET-WRONG-EVENT'),
        response: seededResponseDocument('EVT-54-GET-WRONG-EVENT')
    });
    await assertFails(getDoc(responseRef(db, 'EVT-54-GET-WRONG-EVENT')));
    const malformedEvent = 'EVT-54-GET-MALFORMED';
    await seedBundle(malformedEvent, {
        token: 'short',
        access: accessDocument(malformedEvent),
        config: publicDocument(malformedEvent),
        response: seededResponseDocument(malformedEvent)
    });
    await assertFails(getDoc(responseRef(db, malformedEvent, 'short')));
    const relationEvent = 'EVT-54-GET-RELATION';
    await seedBundle(relationEvent, {
        access: accessDocument(relationEvent, { configKey: OTHER_CONFIG_KEY }),
        configKey: OTHER_CONFIG_KEY,
        config: publicDocument('EVT-OTHER'),
        response: seededResponseDocument(relationEvent)
    });
    await assertFails(getDoc(responseRef(db, relationEvent)));
});

test('13. response LIST y queries se deniegan a bearer anónimo y autenticado', async () => {
    const eventId = 'EVT-54-GET-LIST';
    await seedBundle(eventId, { response: seededResponseDocument(eventId) });
    for (const db of [testEnv.unauthenticatedContext().firestore(), context('CLIENTE').context.firestore()]) {
        const responses = collection(db, 'eventos', eventId, 'rsvpResponses');
        await assertFails(getDocs(responses));
        await assertFails(getDocs(query(responses, where('guestId', '==', 'INV-0001'))));
    }
});

test('14. CREATE assigned-only accepted correcto pasa; conteos incorrectos se deniegan', async () => {
    const eventId = 'EVT-54-CREATE-ASSIGNED';
    await seedBundle(eventId);
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(responseRef(db, eventId), responseDocument(eventId)));
    for (const [suffix, passesConfirmed] of [['ZERO', 0], ['ONE', 1], ['OVER', 5]]) {
        const invalidEvent = `${eventId}-${suffix}`;
        await seedBundle(invalidEvent);
        await assertFails(setDoc(responseRef(db, invalidEvent), responseDocument(invalidEvent, { passesConfirmed })));
    }
});

test('15. CREATE declined 0 pasa y declined >0 se deniega', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const validEvent = 'EVT-54-CREATE-DECLINED';
    await seedBundle(validEvent);
    await assertSucceeds(setDoc(responseRef(db, validEvent), responseDocument(validEvent, { status: 'declined', passesConfirmed: 0 })));
    const invalidEvent = 'EVT-54-CREATE-DECLINED-PASSES';
    await seedBundle(invalidEvent);
    await assertFails(setDoc(responseRef(db, invalidEvent), responseDocument(invalidEvent, { status: 'declined', passesConfirmed: 1 })));
});

test('16. CREATE select-up acepta 1 y passLimit; rechaza 0 y passLimit+1', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    for (const [suffix, passesConfirmed] of [['ONE', 1], ['LIMIT', 4]]) {
        const eventId = `EVT-54-CREATE-SELECT-${suffix}`;
        await seedBundle(eventId, { config: publicDocument(eventId, { guestPolicy: 'select-up-to-assigned' }) });
        await assertSucceeds(setDoc(responseRef(db, eventId), responseDocument(eventId, { passesConfirmed })));
    }
    for (const [suffix, passesConfirmed] of [['ZERO', 0], ['OVER', 5]]) {
        const eventId = `EVT-54-CREATE-SELECT-${suffix}`;
        await seedBundle(eventId, { config: publicDocument(eventId, { guestPolicy: 'select-up-to-assigned' }) });
        await assertFails(setDoc(responseRef(db, eventId), responseDocument(eventId, { passesConfirmed })));
    }
});

test('17. CREATE rechaza negativo, float y numeric string', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    for (const [suffix, passesConfirmed] of [['NEG', -1], ['FLOAT', 1.5], ['STRING', '2']]) {
        const eventId = `EVT-54-CREATE-TYPE-${suffix}`;
        await seedBundle(eventId, { config: publicDocument(eventId, { guestPolicy: 'select-up-to-assigned' }) });
        await assertFails(setDoc(responseRef(db, eventId), responseDocument(eventId, { passesConfirmed })));
    }
});

test('18. CREATE rechaza wrong guestId, wrong eventId, extra field y schema', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    for (const [suffix, patch] of [
        ['GUEST', { guestId: 'INV-OTHER' }],
        ['EVENT', { eventId: 'EVT-OTHER' }],
        ['EXTRA', { internal: true }],
        ['SCHEMA', { schemaVersion: 2 }]
    ]) {
        const eventId = `EVT-54-CREATE-SHAPE-${suffix}`;
        await seedBundle(eventId);
        await assertFails(setDoc(responseRef(db, eventId), responseDocument(eventId, patch)));
    }
});

test('19. CREATE exige respondedAt == request.time', async () => {
    const eventId = 'EVT-54-CREATE-TIME';
    await seedBundle(eventId);
    await assertFails(setDoc(responseRef(testEnv.unauthenticatedContext().firestore(), eventId), responseDocument(eventId, {
        respondedAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'))
    })));
});

test('20. CREATE se deniega para revoked, expired, disabled y wrong-event Access', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const scenarios = [
        ['REVOKED', { access: { active: false } }],
        ['EXPIRED', { access: { expiresAt: PAST } }],
        ['DISABLED', { config: { enabled: false } }],
        ['WRONG', { access: { eventId: 'EVT-OTHER' } }]
    ];
    for (const [suffix, changes] of scenarios) {
        const eventId = `EVT-54-CREATE-CONTEXT-${suffix}`;
        await seedBundle(eventId, {
            access: accessDocument(eventId, changes.access),
            config: publicDocument(eventId, changes.config)
        });
        await assertFails(setDoc(responseRef(db, eventId), responseDocument(eventId)));
    }
});

test('21. CREATE se deniega para method whatsapp', async () => {
    const eventId = 'EVT-54-CREATE-WHATSAPP';
    await seedBundle(eventId, { config: publicDocument(eventId, {
        method: 'whatsapp',
        whatsapp: { phone: '+525512345678', message: 'Confirmo' }
    }) });
    await assertFails(setDoc(responseRef(testEnv.unauthenticatedContext().firestore(), eventId), responseDocument(eventId)));
});

test('22. CREATE se deniega cuando responseClosesAt ya pasó', async () => {
    const eventId = 'EVT-54-CREATE-CLOSED';
    await seedBundle(eventId, { config: publicDocument(eventId, { enabled: false, responseClosesAt: PAST }) });
    await assertFails(setDoc(responseRef(testEnv.unauthenticatedContext().firestore(), eventId), responseDocument(eventId)));
});

test('23. UPDATE permite accepted a declined', async () => {
    const eventId = 'EVT-54-UPDATE-DECLINED';
    await seedBundle(eventId, { response: seededResponseDocument(eventId) });
    await assertSucceeds(updateDoc(responseRef(testEnv.unauthenticatedContext().firestore(), eventId), {
        status: 'declined', passesConfirmed: 0, respondedAt: serverTimestamp()
    }));
});

test('24. UPDATE permite declined a accepted', async () => {
    const eventId = 'EVT-54-UPDATE-ACCEPTED';
    await seedBundle(eventId, { response: seededResponseDocument(eventId, { status: 'declined', passesConfirmed: 0 }) });
    await assertSucceeds(updateDoc(responseRef(testEnv.unauthenticatedContext().firestore(), eventId), {
        status: 'accepted', passesConfirmed: 4, respondedAt: serverTimestamp()
    }));
});

test('25. UPDATE permite cambiar conteo accepted dentro de select-up', async () => {
    const eventId = 'EVT-54-UPDATE-COUNT';
    await seedBundle(eventId, {
        config: publicDocument(eventId, { guestPolicy: 'select-up-to-assigned' }),
        response: seededResponseDocument(eventId, { passesConfirmed: 1 })
    });
    await assertSucceeds(updateDoc(responseRef(testEnv.unauthenticatedContext().firestore(), eventId), {
        passesConfirmed: 2, respondedAt: serverTimestamp()
    }));
});

test('26. UPDATE rechaza mutaciones de identidad, extras y pase inválido', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    for (const [suffix, patch] of [
        ['GUEST', { guestId: 'INV-OTHER' }],
        ['EVENT', { eventId: 'EVT-OTHER' }],
        ['EXTRA', { internal: true }],
        ['PASS', { passesConfirmed: 3 }]
    ]) {
        const eventId = `EVT-54-UPDATE-${suffix}`;
        await seedBundle(eventId, { response: seededResponseDocument(eventId) });
        await assertFails(updateDoc(responseRef(db, eventId), { ...patch, respondedAt: serverTimestamp() }));
    }
});

test('27. UPDATE se deniega closed, revoked y expired', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    for (const [suffix, accessPatch, configPatch] of [
        ['CLOSED', {}, { responseClosesAt: PAST }],
        ['REVOKED', { active: false }, {}],
        ['EXPIRED', { expiresAt: PAST }, {}]
    ]) {
        const eventId = `EVT-54-UPDATE-${suffix}`;
        await seedBundle(eventId, {
            access: accessDocument(eventId, accessPatch),
            config: publicDocument(eventId, configPatch),
            response: seededResponseDocument(eventId)
        });
        await assertFails(updateDoc(responseRef(db, eventId), {
            status: 'declined', passesConfirmed: 0, respondedAt: serverTimestamp()
        }));
    }
});

test('28. DELETE response se deniega anónimo y autenticado no-admin', async () => {
    const eventId = 'EVT-54-DELETE';
    await seedBundle(eventId, { response: seededResponseDocument(eventId) });
    await assertFails(deleteDoc(responseRef(testEnv.unauthenticatedContext().firestore(), eventId)));
    await assertFails(deleteDoc(responseRef(context('CLIENTE').context.firestore(), eventId)));
});

test('29. roles internos pueden GET/LIST responses pero no reciben delete', async () => {
    const eventId = 'EVT-54-INTERNAL-RESPONSES';
    await seedBundle(eventId, { response: seededResponseDocument(eventId) });
    const db = context('DISENADOR').context.firestore();
    await assertSucceeds(getDoc(responseRef(db, eventId)));
    await assertSucceeds(getDocs(collection(db, 'eventos', eventId, 'rsvpResponses')));
    await assertFails(deleteDoc(responseRef(db, eventId)));
});

test('29A. migración interna puede crear copia histórica exacta, pero público no', async () => {
    const eventId = 'EVT-54-INTERNAL-MIGRATION';
    await seedBundle(eventId, { config: publicDocument(eventId, { responseClosesAt: PAST }) });
    const historical = responseDocument(eventId, {
        respondedAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'))
    });
    await assertFails(setDoc(responseRef(testEnv.unauthenticatedContext().firestore(), eventId), historical));
    await assertSucceeds(setDoc(responseRef(context('CEO').context.firestore(), eventId), historical));
    await assertFails(updateDoc(responseRef(context('CEO').context.firestore(), eventId), {
        status: 'declined', passesConfirmed: 0,
        respondedAt: Timestamp.fromDate(new Date('2026-02-01T00:00:00.000Z'))
    }));
});

test('30. guest, checkin, RSVP privado, Access LIST y publication siguen privados', async () => {
    const eventId = 'EVT-54-OTHER-PRIVATE';
    await testEnv.withSecurityRulesDisabled(async (admin) => {
        const db = admin.firestore();
        await setDoc(doc(db, 'eventos', eventId, 'invitados', 'INV-0001'), { nombre: 'Privado', pases: 4 });
        await setDoc(doc(db, 'eventos', eventId, 'checkins', 'INV-0001-001'), { invitadoId: 'INV-0001' });
        await setDoc(doc(db, 'eventos', eventId, 'invitacion', 'rsvp'), { enabled: true });
        await setDoc(publicationRef(db, eventId), publicationDocument(eventId));
        await setDoc(accessRef(db, eventId), accessDocument(eventId));
    });
    for (const db of [
        testEnv.unauthenticatedContext().firestore(),
        context('CLIENTE').context.firestore(),
        context('ROL-DESCONOCIDO').context.firestore()
    ]) {
        await assertFails(getDoc(doc(db, 'eventos', eventId, 'invitados', 'INV-0001')));
        await assertFails(getDocs(collection(db, 'eventos', eventId, 'invitados')));
        await assertFails(getDoc(doc(db, 'eventos', eventId, 'checkins', 'INV-0001-001')));
        await assertFails(getDocs(collection(db, 'eventos', eventId, 'checkins')));
        await assertFails(getDoc(doc(db, 'eventos', eventId, 'invitacion', 'rsvp')));
        await assertFails(getDocs(collection(db, 'eventos', eventId, 'rsvpAccess')));
        await assertFails(getDoc(publicationRef(db, eventId)));
        await assertFails(getDoc(responseRef(db, eventId, OTHER_TOKEN)));
    }
});
