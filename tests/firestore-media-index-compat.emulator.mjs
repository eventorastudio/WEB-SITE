import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';

const PROJECT_ID = 'demo-eventora-media-index-compat';
const UID = 'UID-MEDIA-COMPAT';
const VALID_VERSION = 'abcdef123456';
const productionRules = await readFile(new URL('../audit/production-rules/firestore.production.rules', import.meta.url), 'utf8');
const localRules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

let productionEnv;
let localEnv;

before(async () => {
    productionEnv = await initializeTestEnvironment({
        projectId: `${PROJECT_ID}-production`,
        firestore: { rules: productionRules }
    });
    localEnv = await initializeTestEnvironment({
        projectId: `${PROJECT_ID}-local`,
        firestore: { rules: localRules }
    });
});

after(async () => {
    await productionEnv?.cleanup();
    await localEnv?.cleanup();
});

function editor(env) {
    return env.authenticatedContext(UID, { role: 'ADMIN' }).firestore();
}

function configRef(db, eventId) {
    return doc(db, `eventos/${eventId}/invitacion/config`);
}

function mediaRef(db, eventId, mediaId) {
    return doc(db, `eventos/${eventId}/invitacion/config/media/${mediaId}`);
}

function mediaId(number) {
    return `MED-LOCAL-${String(number).padStart(3, '0')}`;
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

function configData(mediaIndex) {
    return {
        schemaVersion: 5,
        mediaIndex,
        updatedAt: serverTimestamp(),
        updatedBy: UID
    };
}

function galleryIndex(ids) {
    return {
        ...emptyIndex(),
        galleryIds: ids
    };
}

function validMedia(eventId, id, role = 'gallery', overrides = {}) {
    const extension = role === 'video' ? 'mp4' : role === 'music' ? 'mp3' : 'webp';
    const kind = role === 'video' ? 'video' : role === 'music' ? 'audio' : 'image';
    const mimeType = role === 'video' ? 'video/mp4' : role === 'music' ? 'audio/mpeg' : 'image/webp';
    return {
        id,
        role,
        kind,
        originalName: `${role}.${extension}`,
        mimeType,
        size: 1000,
        width: role === 'music' ? 0 : 1200,
        height: role === 'music' ? 0 : 800,
        duration: role === 'music' ? 90 : role === 'video' ? 30 : 0,
        alt: 'Alt text',
        caption: 'Caption text',
        storagePath: `eventos/${eventId}/invitacion/media/${role}/${id}-${VALID_VERSION}.${extension}`,
        focalPoint: { x: 50, y: 50 },
        objectVersion: VALID_VERSION,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: UID,
        ...overrides
    };
}

async function decision(env, operation) {
    try {
        await operation(editor(env));
        return 'ALLOW';
    } catch {
        return 'DENY';
    }
}

async function compare(label, operation) {
    const prod = await decision(productionEnv, operation);
    const local = await decision(localEnv, operation);
    assert.equal(local, prod, `${label}: PROD=${prod} LOCAL=${local}`);
    return { label, prod, local };
}

test('mediaIndex contract: valid, invalid, duplicate and malformed cases match', async () => {
    const cases = [
        ['empty', emptyIndex(), 'ALLOW'],
        ['mediaId inexistente / referencia removida', { ...emptyIndex(), coverId: mediaId(1) }, 'ALLOW'],
        ['twenty gallery elements', galleryIndex(Array.from({ length: 20 }, (_, index) => mediaId(index + 1))), 'ALLOW'],
        ['duplicate mediaId', galleryIndex([mediaId(1), mediaId(1)]), 'DENY'],
        ['invalid mediaId', galleryIndex(['NOT-A-MEDIA-ID']), 'DENY'],
        ['gallery with hole', galleryIndex([mediaId(1), null]), 'DENY'],
        ['too many elements', galleryIndex(Array.from({ length: 21 }, (_, index) => mediaId(index + 1))), 'DENY'],
        ['wrong index type', null, 'DENY'],
        ['cover also in gallery', { ...emptyIndex(), coverId: mediaId(1), galleryIds: [mediaId(1)] }, 'DENY'],
        ['place role ids valid', { ...emptyIndex(), placeIds: [mediaId(2)] }, 'DENY'],
        ['place role ids invalid', { ...emptyIndex(), placeIds: ['NOT-A-MEDIA-ID'] }, 'DENY']
    ];
    const results = [];
    for (const [label, index, expected] of cases) {
        const eventId = `EVT-INDEX-${label.replace(/[^A-Z0-9]+/gi, '-')}`;
        const result = await compare(label, async (db) => {
            await setDoc(configRef(db, eventId), configData(index));
        });
        assert.equal(result.prod, expected, `${label}: unexpected production oracle result`);
        results.push(result);
    }
    assert.equal(results.filter(({ prod }) => prod === 'ALLOW').length, 3);
});

test('validMediaDocument contract: role, metadata, path and field constraints match', async () => {
    const cases = [
        ['valid gallery', (eventId) => validMedia(eventId, mediaId(30)), 'ALLOW'],
        ['invalid role', (eventId) => validMedia(eventId, mediaId(31), 'unknown'), 'DENY'],
        ['invalid metadata id', (eventId) => validMedia(eventId, mediaId(32), 'gallery', { id: mediaId(33) }), 'DENY'],
        ['malformed path', (eventId) => validMedia(eventId, mediaId(34), 'gallery', { storagePath: 'other/path.webp' }), 'DENY'],
        ['too long original name', (eventId) => validMedia(eventId, mediaId(35), 'gallery', { originalName: 'x'.repeat(181) }), 'DENY'],
        ['invalid image dimensions', (eventId) => validMedia(eventId, mediaId(36), 'gallery', { width: 0 }), 'DENY'],
        ['invalid video duration', (eventId) => validMedia(eventId, mediaId(37), 'video', { duration: 301 }), 'DENY'],
        ['invalid music dimensions', (eventId) => validMedia(eventId, mediaId(38), 'music', { width: 1 }), 'DENY']
    ];
    for (const [label, build, expected] of cases) {
        const eventId = `EVT-MEDIA-${label.replace(/[^A-Z0-9]+/gi, '-')}`;
        const result = await compare(label, async (db) => {
            const payload = build(eventId);
            const pathId = label === 'invalid metadata id' ? mediaId(99) : payload.id;
            await setDoc(mediaRef(db, eventId, pathId), payload);
        });
        assert.equal(result.prod, expected, `${label}: unexpected production oracle result`);
    }
});

test('shared demo media preserves the production branch in both rulesets', async () => {
    const eventId = 'EVT-SHARED-DEMO';
    const sharedId = 'DML-sharedasset';
    const shared = validMedia(eventId, mediaId(40), 'gallery', {
        sharedDemoAssetId: sharedId,
        storagePath: `demo-library/${sharedId}-${VALID_VERSION}.webp`
    });
    for (const env of [productionEnv, localEnv]) {
        await env.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), `eventos/${eventId}`), { demoMode: true });
        });
    }
    const result = await compare('valid shared demo', async (db) => {
        await setDoc(mediaRef(db, eventId, mediaId(40)), shared);
    });
    assert.equal(result.prod, 'ALLOW');
    const invalid = await compare('shared demo on normal event', async (db) => {
        const normalId = 'EVT-SHARED-NORMAL';
        await setDoc(mediaRef(db, normalId, mediaId(41)), {
            ...shared,
            id: mediaId(41),
            storagePath: `demo-library/${sharedId}-${VALID_VERSION}.webp`
        });
    });
    assert.equal(invalid.prod, 'DENY');
});

test('batch de config + 20 media y reorder de 20 son equivalentes', async () => {
    const batchEvent = 'EVT-BATCH-20';
    const ids = Array.from({ length: 20 }, (_, index) => mediaId(index + 50));
    const runBatch = async (db) => {
        const batch = writeBatch(db);
        ids.forEach((id) => batch.set(mediaRef(db, batchEvent, id), validMedia(batchEvent, id)));
        batch.set(configRef(db, batchEvent), configData(galleryIndex(ids)));
        await batch.commit();
    };
    const batchResult = await compare('batch config + 20 media', runBatch);
    assert.equal(batchResult.prod, 'ALLOW');

    const reorderEvent = 'EVT-REORDER-20';
    const reordered = [...ids].reverse();
    const runReorder = async (db) => {
        await setDoc(configRef(db, reorderEvent), configData(galleryIndex(ids)));
        await updateDoc(configRef(db, reorderEvent), configData(galleryIndex(reordered)));
    };
    const reorderResult = await compare('reorder 20', runReorder);
    assert.equal(reorderResult.prod, 'ALLOW');
    assert.deepEqual(new Set(ids), new Set(reordered));
    assert.equal(new Set(reordered).size, 20);
});
