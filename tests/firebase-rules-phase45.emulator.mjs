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
import {
    deleteObject,
    getMetadata,
    ref,
    uploadBytes
} from 'firebase/storage';

import { createEmptyInvitationMedia, createMediaAsset } from '../admin/invitations/core/media-schema.js';
import {
    buildInvitationMediaStoragePath,
    createInvitationMediaIndex,
    hydrateInvitationMedia,
    serializeInvitationMediaDocument
} from '../admin/invitations/services/invitation-media-service.js';

const PROJECT_ID = 'demo-eventorastudio-phase45';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const UID = 'UID-RULES-EDITOR';
const VERSION_A = 'abcdef123456';
const VERSION_B = 'fedcba654321';

let testEnv;
const contextUids = new WeakMap();

before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
});

after(async () => {
    await testEnv?.cleanup();
});

function contextFor(role, claimName = 'role') {
    const uid = `${UID}-${role}-${claimName}`;
    const context = testEnv.authenticatedContext(uid, { [claimName]: role });
    contextUids.set(context, uid);
    return context;
}

function uidFor(context) {
    return contextUids.get(context);
}

function unauthenticatedContext() {
    return testEnv.unauthenticatedContext();
}

function contextWithUid(uid, claims = {}) {
    const context = testEnv.authenticatedContext(uid, claims);
    contextUids.set(context, uid);
    return context;
}

function mediaId(number) {
    return `MED-LOCAL-${String(number).padStart(3, '0')}`;
}

function rolePolicy(role) {
    return {
        cover: { kind: 'image', mimeType: 'image/webp', extension: 'webp' },
        gallery: { kind: 'image', mimeType: 'image/webp', extension: 'webp' },
        videoPoster: { kind: 'image', mimeType: 'image/webp', extension: 'webp' },
        video: { kind: 'video', mimeType: 'video/mp4', extension: 'mp4' },
        music: { kind: 'audio', mimeType: 'audio/mpeg', extension: 'mp3' }
    }[role];
}

function asset(eventId, role, id, { version = VERSION_A, size = 4, ...overrides } = {}) {
    const policy = rolePolicy(role);
    return createMediaAsset(id, {
        role,
        kind: policy.kind,
        originalName: `${role}.${policy.extension}`,
        mimeType: policy.mimeType,
        size,
        width: policy.kind === 'image' ? 1200 : (policy.kind === 'video' ? 1920 : 0),
        height: policy.kind === 'image' ? 800 : (policy.kind === 'video' ? 1080 : 0),
        duration: policy.kind === 'video' ? 30 : (policy.kind === 'audio' ? 90 : 0),
        alt: `Alt ${id}`,
        caption: `Caption ${id}`,
        storagePath: buildInvitationMediaStoragePath({
            eventId,
            assetId: id,
            role,
            mimeType: policy.mimeType,
            objectVersion: version
        }),
        status: 'uploaded',
        uploadProgress: 100,
        focalPoint: { x: 40, y: 60 },
        ...overrides
    });
}

function mediaFixture(eventId, galleryCount = 6) {
    const media = createEmptyInvitationMedia();
    media.cover = asset(eventId, 'cover', mediaId(1));
    media.gallery = Array.from({ length: galleryCount }, (_, index) => ({
        ...asset(eventId, 'gallery', mediaId(index + 2), {
            version: `abcde${String(index + 1).padStart(7, '0')}`
        }),
        sortOrder: index
    }));
    const singularStart = Math.max(8, galleryCount + 2);
    media.video = asset(eventId, 'video', mediaId(singularStart));
    media.videoPoster = asset(eventId, 'videoPoster', mediaId(singularStart + 1));
    media.music = asset(eventId, 'music', mediaId(singularStart + 2));
    return media;
}

function allAssets(media) {
    return [media.cover, ...(media.gallery ?? []), media.video, media.videoPoster, media.music].filter(Boolean);
}

function emptyIndex() {
    return {
        schemaVersion: 1,
        coverId: null,
        galleryIds: [],
        videoId: null,
        posterId: null,
        audioId: null
    };
}

function configData(uid, mediaIndex = emptyIndex()) {
    return {
        schemaVersion: 5,
        mediaIndex,
        updatedAt: serverTimestamp(),
        updatedBy: uid
    };
}

function mediaDocumentData(item, eventId, uid) {
    return {
        ...serializeInvitationMediaDocument(item, eventId),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: uid
    };
}

function configRef(db, eventId) {
    return doc(db, 'eventos', eventId, 'invitacion', 'config');
}

function mediaRef(db, eventId, id) {
    return doc(db, 'eventos', eventId, 'invitacion', 'config', 'media', id);
}

async function commitMedia(context, eventId, media) {
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.set(configRef(db, eventId), configData(uidFor(context), createInvitationMediaIndex(media)));
    for (const item of allAssets(media)) {
        batch.set(mediaRef(db, eventId, item.id), mediaDocumentData(item, eventId, uidFor(context)));
    }
    await assertSucceeds(batch.commit());
}

function storageMetadata(eventId, item, contentType = item.mimeType) {
    return {
        contentType,
        customMetadata: { eventId, mediaId: item.id, role: item.role }
    };
}

async function uploadAsset(context, eventId, item, bytes = new Uint8Array(item.size)) {
    return assertSucceeds(uploadBytes(ref(context.storage(), item.storagePath), bytes, storageMetadata(eventId, item)));
}

async function seedFirestore(seed) {
    await testEnv.withSecurityRulesDisabled(async (context) => seed(context.firestore()));
}

test('contratos productivos Admin preservan eventos, invitados, themes y lectura interna', async () => {
    const eventId = 'EVT-PRESERVE-ADMIN';
    const guestId = 'INV-0001';
    const ceo = contextFor('CEO');
    const db = ceo.firestore();
    await assertSucceeds(setDoc(doc(db, 'eventos', eventId), {
        nombreEvento: 'Evento de regresión',
        funcionalidades: { portalCliente: false, checkInQR: false, historialAccesos: false }
    }));
    await assertSucceeds(setDoc(doc(db, 'eventos', eventId, 'invitados', guestId), {
        nombre: 'Invitado de regresión'
    }));
    await assertSucceeds(getDoc(doc(db, 'eventos', eventId)));
    await assertSucceeds(getDocs(collection(db, 'eventos')));
    await assertSucceeds(getDoc(doc(db, 'eventos', eventId, 'invitados', guestId)));
    await assertSucceeds(getDocs(collection(db, 'eventos', eventId, 'invitados')));
    await assertSucceeds(setDoc(doc(db, 'themes', 'THEME-PRESERVE'), { nombre: 'Tema de regresión' }));

    const designer = contextFor('DISENADOR');
    await assertSucceeds(getDocs(collection(designer.firestore(), 'eventos')));
    await assertSucceeds(getDoc(doc(designer.firestore(), 'themes', 'THEME-PRESERVE')));
    await assertFails(updateDoc(doc(designer.firestore(), 'eventos', eventId), { nombreEvento: 'No permitido' }));

    const ventas = contextFor('VENTAS');
    await assertSucceeds(getDoc(doc(ventas.firestore(), 'eventos', eventId)));
    await assertSucceeds(getDocs(collection(ventas.firestore(), 'eventos', eventId, 'invitados')));
    await assertFails(updateDoc(doc(ventas.firestore(), 'eventos', eventId), { nombreEvento: 'No permitido' }));
});

test('contrato productivo Portal Prestige preserva lectura y check-in transaccional correlacionado', async () => {
    const uid = 'UID-PORTAL-PRESERVE';
    const eventId = 'EVT-PRESERVE-PORTAL';
    const guestId = 'INV-0001';
    const checkinId = `${guestId}-001`;
    await seedFirestore(async (db) => {
        await setDoc(doc(db, 'usuarios', uid), {
            activo: true,
            rol: 'cliente',
            eventosPermitidos: [eventId]
        });
        await setDoc(doc(db, 'eventos', eventId), {
            nombreEvento: 'Portal Prestige',
            funcionalidades: { portalCliente: true, checkInQR: true, historialAccesos: true }
        });
        await setDoc(doc(db, 'eventos', eventId, 'invitados', guestId), {
            nombre: 'Invitado Portal',
            codigo: 'INV-0001',
            pases: 3,
            pasesUtilizados: 0,
            pasesDisponibles: 3,
            llegadaRegistrada: false,
            horaLlegada: null,
            estado: 'pendiente',
            checkinSecuencia: 0,
            fechaActualizacion: null
        });
    });

    const portal = contextWithUid(uid);
    const db = portal.firestore();
    await assertSucceeds(getDoc(doc(db, 'usuarios', uid)));
    await assertSucceeds(getDoc(doc(db, 'eventos', eventId)));
    await assertSucceeds(getDocs(collection(db, 'eventos', eventId, 'invitados')));
    await assertSucceeds(getDocs(collection(db, 'eventos', eventId, 'checkins')));
    await assertFails(updateDoc(doc(db, 'eventos', eventId), { nombreEvento: 'No permitido' }));

    const batch = writeBatch(db);
    batch.update(doc(db, 'eventos', eventId, 'invitados', guestId), {
        pasesUtilizados: 1,
        pasesDisponibles: 2,
        llegadaRegistrada: true,
        horaLlegada: serverTimestamp(),
        estado: 'llego',
        checkinSecuencia: 1,
        ultimoCheckinId: checkinId,
        fechaActualizacion: serverTimestamp()
    });
    batch.set(doc(db, 'eventos', eventId, 'checkins', checkinId), {
        eventId,
        invitadoId: guestId,
        codigoInvitado: 'INV-0001',
        nombreInvitado: 'Invitado Portal',
        pasesRegistrados: 1,
        pasesDisponiblesDespues: 2,
        fechaHora: serverTimestamp(),
        registradoPor: uid,
        metodo: 'manual',
        resultado: 'parcial',
        checkinSecuencia: 1
    });
    await assertSucceeds(batch.commit());
    const guestAfter = (await getDoc(doc(db, 'eventos', eventId, 'invitados', guestId))).data();
    const checkinAfter = await getDoc(doc(db, 'eventos', eventId, 'checkins', checkinId));
    assert.equal(guestAfter.pasesUtilizados, 1);
    assert.equal(guestAfter.pasesDisponibles, 2);
    assert.equal(checkinAfter.exists(), true);
});

for (const [role, claimName] of [
    ['CEO', 'role'],
    ['ADMINISTRADOR', 'userRole'],
    ['DISENADOR', 'role']
]) {
    test(`${role} puede escribir config, documento media y objeto Storage`, async () => {
        const eventId = `EVT-ROLE-${role}`;
        const context = contextFor(role, claimName);
        const item = asset(eventId, 'cover', mediaId(1));
        const db = context.firestore();
        await assertSucceeds(setDoc(configRef(db, eventId), configData(uidFor(context), {
            ...emptyIndex(), coverId: item.id
        })));
        await assertSucceeds(setDoc(mediaRef(db, eventId, item.id), mediaDocumentData(item, eventId, uidFor(context))));
        await uploadAsset(context, eventId, item);
        await assertSucceeds(getDoc(configRef(db, eventId)));
        await assertSucceeds(getDoc(mediaRef(db, eventId, item.id)));
        await assertSucceeds(getMetadata(ref(context.storage(), item.storagePath)));
    });
}

test('CLIENTE no puede leer ni escribir config, media documents o Storage', async () => {
    const eventId = 'EVT-CLIENTE';
    const context = contextFor('CLIENTE');
    const item = asset(eventId, 'cover', mediaId(1));
    const db = context.firestore();
    await assertFails(setDoc(configRef(db, eventId), configData(uidFor(context), { ...emptyIndex(), coverId: item.id })));
    await assertFails(setDoc(mediaRef(db, eventId, item.id), mediaDocumentData(item, eventId, uidFor(context))));
    await assertFails(getDoc(configRef(db, eventId)));
    await assertFails(getDoc(mediaRef(db, eventId, item.id)));
    await assertFails(uploadBytes(ref(context.storage(), item.storagePath), new Uint8Array(4), storageMetadata(eventId, item)));
});

test('usuario no autenticado no puede leer ni escribir Firestore o Storage', async () => {
    const eventId = 'EVT-UNAUTH';
    const context = unauthenticatedContext();
    const item = asset(eventId, 'cover', mediaId(1));
    const db = context.firestore();
    await assertFails(getDoc(configRef(db, eventId)));
    await assertFails(setDoc(configRef(db, eventId), configData('spoofed-user')));
    await assertFails(uploadBytes(ref(context.storage(), item.storagePath), new Uint8Array(4), storageMetadata(eventId, item)));
});

test('cross-event rechaza metadata Storage y storagePath Firestore de otro evento', async () => {
    const eventId = 'EVT-CROSS-A';
    const otherEventId = 'EVT-CROSS-B';
    const context = contextFor('CEO');
    const item = asset(eventId, 'cover', mediaId(1));
    await assertFails(uploadBytes(
        ref(context.storage(), item.storagePath),
        new Uint8Array(4),
        storageMetadata(otherEventId, item)
    ));

    const corrupted = {
        ...mediaDocumentData(item, eventId, uidFor(context)),
        storagePath: buildInvitationMediaStoragePath({
            eventId: otherEventId,
            assetId: item.id,
            role: item.role,
            mimeType: item.mimeType,
            objectVersion: VERSION_A
        })
    };
    await assertFails(setDoc(mediaRef(context.firestore(), eventId, item.id), corrupted));
});

test('MIME peligroso o extensión incompatible se rechazan', async () => {
    const eventId = 'EVT-MIME';
    const context = contextFor('CEO');
    const item = asset(eventId, 'cover', mediaId(1));
    await assertFails(uploadBytes(
        ref(context.storage(), item.storagePath),
        new Uint8Array(4),
        storageMetadata(eventId, item, 'image/svg+xml')
    ));
    await assertFails(uploadBytes(
        ref(context.storage(), item.storagePath.replace(/\.webp$/, '.png')),
        new Uint8Array(4),
        storageMetadata(eventId, item, 'image/webp')
    ));
});

test('boundary de imagen acepta exactamente 20 MiB y rechaza 20 MiB + 1 byte', async () => {
    const eventId = 'EVT-SIZE';
    const context = contextFor('CEO');
    const exact = asset(eventId, 'gallery', mediaId(1), { size: MAX_IMAGE_BYTES });
    const oversized = asset(eventId, 'gallery', mediaId(2), { size: MAX_IMAGE_BYTES + 1 });
    await uploadAsset(context, eventId, exact, new Uint8Array(MAX_IMAGE_BYTES));
    await assertFails(uploadBytes(
        ref(context.storage(), oversized.storagePath),
        new Uint8Array(MAX_IMAGE_BYTES + 1),
        storageMetadata(eventId, oversized)
    ));
});

test('metadata mismatch rechaza eventId, mediaId, role y MIME/extensión', async () => {
    const eventId = 'EVT-METADATA';
    const context = contextFor('CEO');
    const item = asset(eventId, 'cover', mediaId(1));
    const base = storageMetadata(eventId, item);
    for (const customMetadata of [
        { ...base.customMetadata, eventId: 'EVT-OTHER' },
        { ...base.customMetadata, mediaId: mediaId(99) },
        { ...base.customMetadata, role: 'gallery' }
    ]) {
        await assertFails(uploadBytes(ref(context.storage(), item.storagePath), new Uint8Array(4), {
            contentType: item.mimeType,
            customMetadata
        }));
    }
    await assertFails(uploadBytes(ref(context.storage(), item.storagePath), new Uint8Array(4), {
        ...base,
        contentType: 'image/png'
    }));
});

test('Storage es create-only: sobrescritura denegada y delete del owner permitido', async () => {
    const eventId = 'EVT-CREATE-ONLY';
    const context = contextFor('CEO');
    const item = asset(eventId, 'cover', mediaId(1));
    await uploadAsset(context, eventId, item);
    await assertFails(uploadBytes(ref(context.storage(), item.storagePath), new Uint8Array(4), storageMetadata(eventId, item)));
    await assertSucceeds(deleteObject(ref(context.storage(), item.storagePath)));
});

test('contrato media document exige campos exactos, ID/path/tipo/auditoría y niega list', async () => {
    const eventId = 'EVT-DOC-CONTRACT';
    const context = contextFor('CEO');
    const db = context.firestore();
    const valid = asset(eventId, 'cover', mediaId(1));
    await assertSucceeds(setDoc(mediaRef(db, eventId, valid.id), mediaDocumentData(valid, eventId, uidFor(context))));
    await assertFails(getDocs(collection(db, 'eventos', eventId, 'invitacion', 'config', 'media')));

    const extra = mediaDocumentData(asset(eventId, 'cover', mediaId(2)), eventId, uidFor(context));
    extra.downloadUrl = 'https://token.example/secret';
    await assertFails(setDoc(mediaRef(db, eventId, mediaId(2)), extra));

    const missing = mediaDocumentData(asset(eventId, 'cover', mediaId(3)), eventId, uidFor(context));
    delete missing.caption;
    await assertFails(setDoc(mediaRef(db, eventId, mediaId(3)), missing));

    const wrongId = mediaDocumentData(asset(eventId, 'cover', mediaId(4)), eventId, uidFor(context));
    await assertFails(setDoc(mediaRef(db, eventId, mediaId(5)), wrongId));

    const badFocal = mediaDocumentData(asset(eventId, 'cover', mediaId(6)), eventId, uidFor(context));
    badFocal.focalPoint = { x: 101, y: 50 };
    await assertFails(setDoc(mediaRef(db, eventId, mediaId(6)), badFocal));

    const badMime = mediaDocumentData(asset(eventId, 'cover', mediaId(7)), eventId, uidFor(context));
    badMime.mimeType = 'image/png';
    await assertFails(setDoc(mediaRef(db, eventId, mediaId(7)), badMime));

    const badPath = mediaDocumentData(asset(eventId, 'cover', mediaId(8)), eventId, uidFor(context));
    badPath.storagePath = badPath.storagePath.replace('/cover/', '/gallery/');
    await assertFails(setDoc(mediaRef(db, eventId, mediaId(8)), badPath));

    await assertFails(updateDoc(mediaRef(db, eventId, valid.id), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
});

test('mediaIndex acepta galería vacía, 1, 6 y 20; rechaza >20, duplicados y campos extra', async () => {
    const eventId = 'EVT-INDEX-BOUNDARIES';
    const context = contextFor('CEO');
    const reference = configRef(context.firestore(), eventId);
    for (const count of [0, 1, 6, 20]) {
        const galleryIds = Array.from({ length: count }, (_, index) => mediaId(index + 1));
        await assertSucceeds(setDoc(reference, configData(uidFor(context), { ...emptyIndex(), galleryIds })));
    }
    await assertSucceeds(setDoc(reference, configData(uidFor(context), {
        ...emptyIndex(),
        placeIds: [mediaId(1)],
        dressCodeId: null
    })));
    await assertFails(setDoc(reference, configData(uidFor(context), {
        ...emptyIndex(),
        galleryIds: Array.from({ length: 21 }, (_, index) => mediaId(index + 1))
    })));
    await assertFails(setDoc(reference, configData(uidFor(context), {
        ...emptyIndex(), galleryIds: [mediaId(1), mediaId(1)]
    })));
    await assertFails(setDoc(reference, configData(uidFor(context), {
        ...emptyIndex(), coverId: mediaId(1), galleryIds: [mediaId(1)]
    })));
    await assertFails(setDoc(reference, { ...configData(uidFor(context)), legacyMedia: [] }));
});

test('una imagen de galería persiste como un documento más mediaIndex', async () => {
    const eventId = 'EVT-BATCH-ONE';
    const context = contextFor('CEO');
    const media = createEmptyInvitationMedia();
    media.gallery = [asset(eventId, 'gallery', mediaId(1))];
    await commitMedia(context, eventId, media);
    const db = context.firestore();
    const config = (await getDoc(configRef(db, eventId))).data();
    const document = await getDoc(mediaRef(db, eventId, media.gallery[0].id));
    assert.deepEqual(config.mediaIndex.galleryIds, [media.gallery[0].id]);
    assert.equal(document.exists(), true);
});

test('regresión de expresiones: batch con mediaIndex y 20 documentos completos pasa', async () => {
    const eventId = 'EVT-BATCH-20';
    const context = contextFor('CEO');
    const media = createEmptyInvitationMedia();
    media.gallery = Array.from({ length: 20 }, (_, index) => ({
        ...asset(eventId, 'gallery', mediaId(index + 1), {
            version: `abcde${String(index + 1).padStart(7, '0')}`
        }),
        sortOrder: index
    }));
    await commitMedia(context, eventId, media);
    const config = (await assertSucceeds(getDoc(configRef(context.firestore(), eventId)))).data();
    const documents = new Map(await Promise.all(config.mediaIndex.galleryIds.map(async (id) => {
        const snapshot = await assertSucceeds(getDoc(mediaRef(context.firestore(), eventId, id)));
        return [id, snapshot.data()];
    })));
    const hydrated = hydrateInvitationMedia({ mediaIndex: config.mediaIndex, mediaDocuments: documents }, eventId);
    assert.equal(hydrated.media.gallery.length, 20);
    assert.deepEqual(hydrated.media.gallery.map(({ id }) => id), config.mediaIndex.galleryIds);
});

test('integración upload → batch metadata → lectura/hidratación conserva cover + 6 + video + poster + audio', async () => {
    const eventId = 'EVT-INTEGRATION';
    const context = contextFor('CEO');
    const media = mediaFixture(eventId, 6);
    for (const item of allAssets(media)) await uploadAsset(context, eventId, item);
    await commitMedia(context, eventId, media);

    const db = context.firestore();
    const config = (await assertSucceeds(getDoc(configRef(db, eventId)))).data();
    const ids = [
        config.mediaIndex.coverId,
        ...config.mediaIndex.galleryIds,
        config.mediaIndex.videoId,
        config.mediaIndex.posterId,
        config.mediaIndex.audioId
    ].filter(Boolean);
    const documents = new Map(await Promise.all(ids.map(async (id) => {
        const snapshot = await assertSucceeds(getDoc(mediaRef(db, eventId, id)));
        return [id, snapshot.data()];
    })));
    const hydrated = hydrateInvitationMedia({ mediaIndex: config.mediaIndex, mediaDocuments: documents }, eventId);
    assert.equal(hydrated.inconsistencies.length, 0);
    assert.equal(hydrated.media.cover.id, media.cover.id);
    assert.deepEqual(hydrated.media.gallery.map(({ id }) => id), media.gallery.map(({ id }) => id));
    assert.equal(hydrated.media.video.id, media.video.id);
    assert.equal(hydrated.media.videoPoster.id, media.videoPoster.id);
    assert.equal(hydrated.media.music.id, media.music.id);
});

test('reorder de 20 cambia sólo mediaIndex y la hidratación sigue el orden nuevo', async () => {
    const eventId = 'EVT-REORDER';
    const context = contextFor('CEO');
    const db = context.firestore();
    const media = createEmptyInvitationMedia();
    media.gallery = Array.from({ length: 20 }, (_, index) => ({
        ...asset(eventId, 'gallery', mediaId(index + 1), {
            version: `abcde${String(index + 1).padStart(7, '0')}`
        }),
        sortOrder: index
    }));
    await commitMedia(context, eventId, media);
    const watchedId = media.gallery[0].id;
    const beforeDocument = (await getDoc(mediaRef(db, eventId, watchedId))).data();
    const reordered = structuredClone(media);
    reordered.gallery.unshift(reordered.gallery.pop());
    reordered.gallery = reordered.gallery.map((item, sortOrder) => ({ ...item, sortOrder }));
    await assertSucceeds(setDoc(configRef(db, eventId), configData(uidFor(context), createInvitationMediaIndex(reordered))));
    const afterDocument = (await getDoc(mediaRef(db, eventId, watchedId))).data();
    assert.deepEqual(afterDocument, beforeDocument);

    const config = (await getDoc(configRef(db, eventId))).data();
    const documents = new Map(await Promise.all(config.mediaIndex.galleryIds.map(async (id) => [
        id,
        (await getDoc(mediaRef(db, eventId, id))).data()
    ])));
    const hydrated = hydrateInvitationMedia({ mediaIndex: config.mediaIndex, mediaDocuments: documents }, eventId);
    assert.deepEqual(hydrated.media.gallery.map(({ id }) => id), reordered.gallery.map(({ id }) => id));
});

test('replacement de galería conserva ID lógico, publica versión nueva y luego elimina Storage anterior', async () => {
    const eventId = 'EVT-REPLACEMENT';
    const context = contextFor('CEO');
    const db = context.firestore();
    const original = createEmptyInvitationMedia();
    original.gallery = [asset(eventId, 'gallery', mediaId(1), { version: VERSION_A })];
    await uploadAsset(context, eventId, original.gallery[0]);
    await commitMedia(context, eventId, original);

    const replacement = asset(eventId, 'gallery', mediaId(1), {
        version: VERSION_B,
        originalName: 'gallery-replacement.webp'
    });
    await uploadAsset(context, eventId, replacement);
    const batch = writeBatch(db);
    batch.set(configRef(db, eventId), configData(uidFor(context), { ...emptyIndex(), galleryIds: [replacement.id] }));
    batch.update(mediaRef(db, eventId, replacement.id), {
        ...serializeInvitationMediaDocument(replacement, eventId),
        updatedAt: serverTimestamp(),
        updatedBy: uidFor(context)
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(deleteObject(ref(context.storage(), original.gallery[0].storagePath)));

    const config = (await getDoc(configRef(db, eventId))).data();
    const stored = (await getDoc(mediaRef(db, eventId, replacement.id))).data();
    assert.deepEqual(config.mediaIndex.galleryIds, [replacement.id]);
    assert.equal(stored.id, original.gallery[0].id);
    assert.equal(stored.objectVersion, VERSION_B);
    assert.equal(stored.storagePath, replacement.storagePath);
    await assertSucceeds(getMetadata(ref(context.storage(), replacement.storagePath)));
    await assertFails(getMetadata(ref(context.storage(), original.gallery[0].storagePath)));
});

test('delete de galería actualiza orden, elimina documento en batch y después Storage', async () => {
    const eventId = 'EVT-DELETE';
    const context = contextFor('CEO');
    const db = context.firestore();
    const media = createEmptyInvitationMedia();
    media.gallery = Array.from({ length: 3 }, (_, index) => asset(eventId, 'gallery', mediaId(index + 1), {
        version: `abcde${String(index + 1).padStart(7, '0')}`
    }));
    for (const item of media.gallery) await uploadAsset(context, eventId, item);
    await commitMedia(context, eventId, media);

    const deleted = media.gallery[1];
    const batch = writeBatch(db);
    batch.set(configRef(db, eventId), configData(uidFor(context), {
        ...emptyIndex(), galleryIds: [media.gallery[0].id, media.gallery[2].id]
    }));
    batch.delete(mediaRef(db, eventId, deleted.id));
    await assertSucceeds(batch.commit());
    const configAfter = (await getDoc(configRef(db, eventId))).data();
    assert.deepEqual(configAfter.mediaIndex.galleryIds, [media.gallery[0].id, media.gallery[2].id]);
    assert.equal((await getDoc(mediaRef(db, eventId, deleted.id))).exists(), false);

    await assertSucceeds(deleteObject(ref(context.storage(), deleted.storagePath)));
    await assertFails(getMetadata(ref(context.storage(), deleted.storagePath)));
});
