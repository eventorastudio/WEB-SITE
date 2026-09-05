import test from 'node:test';
import assert from 'node:assert/strict';
import { handleLatePurgedEventObject, parseOwnedEventMediaPath } from '../functions/src/purge/late-upload-sweeper.js';

function fakeDb(docs) {
    return { doc(path) { return { async get() { const value = docs[path]; return { exists: value !== undefined, data: () => value }; } }; } };
}
const testProductionGate = () => {};
function fakeBucket() {
    const deleted = [];
    return { deleted, file(name) { return { async delete(options) { deleted.push({ name, options }); } }; } };
}
function objectEvent(name, extra = {}) {
    return { data: { name, bucket: 'demo-bucket.appspot.com', generation: '42', ...extra } };
}

test('sweeper deriva eventId del path exacto y no acepta namespaces ajenos', () => {
    assert.deepEqual(parseOwnedEventMediaPath('eventos/EVT-A/invitacion/media/gallery/MED-001-abcdefabcdef.webp'), {
        eventId: 'EVT-A', relativePath: 'gallery/MED-001-abcdefabcdef.webp'
    });
    assert.equal(parseOwnedEventMediaPath('demo-library/DML-test.webp'), null);
    assert.equal(parseOwnedEventMediaPath('eventos/EVT-A/other/file.webp'), null);
});

test('normal event conserva late object', async () => {
    const bucket = fakeBucket();
    const result = await handleLatePurgedEventObject({
        event: objectEvent('eventos/EVT-NORMAL/invitacion/media/gallery/MED-001-abcdefabcdef.webp'),
        db: fakeDb({}), bucket, expectedBucket: 'demo-bucket.appspot.com', productionGate: testProductionGate
    });
    assert.equal(result.action, 'KEEP');
    assert.equal(bucket.deleted.length, 0);
});

test('purge en curso y estados posteriores eliminan late object con generation', async () => {
    for (const record of [
        { status: 'PURGE_PENDING' }, { status: 'STORAGE_PURGING' }, { status: 'MEDIA_METADATA' },
        { status: 'PROFILES' }, { status: 'VERIFYING' }, { checkpoint: 'FIRESTORE_PURGING' },
        { checkpoint: 'ROOT_DELETED' }, { status: 'FAILED_RETRYABLE', checkpoint: 'ROOT' }, { status: 'PURGED' }
    ]) {
        const bucket = fakeBucket();
        const result = await handleLatePurgedEventObject({
            event: objectEvent('eventos/EVT-PURGE/invitacion/media/gallery/MED-001-abcdefabcdef.webp'),
            db: fakeDb({ 'administrativePurgeRecords/PURGE-EVT-PURGE': record }), bucket,
            expectedBucket: 'demo-bucket.appspot.com', productionGate: testProductionGate
        });
        assert.equal(result.action, 'DELETE_LATE_OBJECT');
        assert.deepEqual(bucket.deleted[0].options, { ifGenerationMatch: '42' });
    }
});

test('lock activo elimina aunque todavía no exista Final Record destructivo', async () => {
    const bucket = fakeBucket();
    const result = await handleLatePurgedEventObject({
        event: objectEvent('eventos/EVT-LOCK/invitacion/media/gallery/MED-001-abcdefabcdef.webp'),
        db: fakeDb({ 'eventos/EVT-LOCK': { purgeLock: { operationId: 'PURGE-LOCK' } } }), bucket,
        expectedBucket: 'demo-bucket.appspot.com', productionGate: testProductionGate
    });
    assert.equal(result.action, 'DELETE_LATE_OBJECT');
    assert.equal(bucket.deleted.length, 1);
});

test('root inexistente sólo elimina si el tombstone indica destrucción', async () => {
    const bucket = fakeBucket();
    const result = await handleLatePurgedEventObject({
        event: objectEvent('eventos/EVT-ROOT/invitacion/media/cover/MED-001-abcdefabcdef.webp'),
        db: fakeDb({ 'administrativePurgeRecords/PURGE-EVT-ROOT': { status: 'PURGED' } }), bucket,
        expectedBucket: 'demo-bucket.appspot.com', productionGate: testProductionGate
    });
    assert.equal(result.action, 'DELETE_LATE_OBJECT');
});

test('shared DEMO y otro prefijo nunca se eliminan', async () => {
    const bucket = fakeBucket();
    const demo = await handleLatePurgedEventObject({ event: objectEvent('demo-library/DML-test.webp'), db: fakeDb({}), bucket, productionGate: testProductionGate });
    const other = await handleLatePurgedEventObject({ event: objectEvent('unrelated/important.webp'), db: fakeDb({}), bucket, productionGate: testProductionGate });
    assert.equal(demo.action, 'IGNORE');
    assert.equal(other.action, 'IGNORE');
    assert.equal(bucket.deleted.length, 0);
});

test('fallo de delete se propaga para permitir retry', async () => {
    const bucket = { file() { return { async delete() { const error = new Error('temporary'); error.code = 503; throw error; } }; } };
    await assert.rejects(handleLatePurgedEventObject({
        event: objectEvent('eventos/EVT-RETRY/invitacion/media/gallery/MED-001-abcdefabcdef.webp'),
        db: fakeDb({ 'administrativePurgeRecords/PURGE-EVT-RETRY': { status: 'PURGED' } }), bucket,
        expectedBucket: 'demo-bucket.appspot.com', productionGate: testProductionGate
    }), { code: 503 });
});
