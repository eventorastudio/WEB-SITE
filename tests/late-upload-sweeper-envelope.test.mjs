import test from 'node:test';
import assert from 'node:assert/strict';

import { refundPurgeLateUploadSweeper } from '../functions/index.js';
import { handleLatePurgedEventObject } from '../functions/src/purge/late-upload-sweeper.js';

const EXPECTED_BUCKET = 'eventorastudio-d6d95.firebasestorage.app';
const TARGET = 'eventos/EVT-SWEEPER/invitacion/media/gallery/MED-LOCAL-901-abcdef123456.webp';

function fakeDb(docs) {
    return {
        doc(path) {
            return {
                async get() {
                    const value = docs[path];
                    return { exists: value !== undefined, data: () => value };
                }
            };
        }
    };
}

function fakeBucket({ deleteError = null } = {}) {
    const deleted = [];
    return {
        deleted,
        file(name) {
            return {
                async delete(options) {
                    deleted.push({ name, options });
                    if (deleteError) throw deleteError;
                }
            };
        }
    };
}

function objectEvent(name, extra = {}) {
    return { data: { name, bucket: EXPECTED_BUCKET, generation: '10', ...extra } };
}

async function runHandler({ event, docs = {}, bucket = fakeBucket() }) {
    return handleLatePurgedEventObject({
        event,
        db: fakeDb(docs),
        bucket,
        expectedBucket: EXPECTED_BUCKET
    });
}

test('export productivo es Gen 2, bucket exacto, region exacta y retry true', () => {
    const endpoint = refundPurgeLateUploadSweeper.__endpoint;
    assert.ok(endpoint);
    assert.equal(endpoint.platform, 'gcfv2');
    assert.deepEqual(endpoint.region, ['us-east1']);
    assert.equal(endpoint.eventTrigger.eventType, 'google.cloud.storage.object.v1.finalized');
    assert.equal(endpoint.eventTrigger.retry, true);
    assert.deepEqual(endpoint.eventTrigger.eventFilters, { bucket: EXPECTED_BUCKET });
});

test('normal, shared demo, namespace ajeno y root missing sin tombstone conservan', async () => {
    const cases = [
        { event: objectEvent(TARGET), docs: { [`eventos/EVT-SWEEPER`]: { title: 'Normal' } } },
        { event: objectEvent('demo-library/DML-test-abcdef123456.webp') },
        { event: objectEvent('other/important.webp') },
        { event: objectEvent('eventos/EVT-UNKNOWN/invitacion/media/gallery/MED-LOCAL-901-abcdef123456.webp') }
    ];
    for (const input of cases) {
        const bucket = fakeBucket();
        const result = await runHandler({ ...input, bucket });
        assert.notEqual(result.action, 'DELETE_LATE_OBJECT');
        assert.equal(bucket.deleted.length, 0);
    }
});

test('purged late object borra con ifGenerationMatch y la repetición es idempotente', async () => {
    const bucket = fakeBucket();
    const first = await runHandler({
        event: objectEvent(TARGET),
        docs: { 'administrativePurgeRecords/PURGE-EVT-SWEEPER': { status: 'PURGED' } },
        bucket
    });
    assert.equal(first.action, 'DELETE_LATE_OBJECT');
    assert.deepEqual(bucket.deleted[0].options, { ifGenerationMatch: '10' });

    const goneBucket = fakeBucket({ deleteError: Object.assign(new Error('gone'), { code: 404 }) });
    const second = await runHandler({
        event: objectEvent(TARGET),
        docs: { 'administrativePurgeRecords/PURGE-EVT-SWEEPER': { status: 'PURGED' } },
        bucket: goneBucket
    });
    assert.equal(second.action, 'ALREADY_GONE');
});

test('generation ausente no permite delete y mismatch no borra la generación actual', async () => {
    const noGenerationBucket = fakeBucket();
    const noGeneration = await runHandler({
        event: objectEvent(TARGET, { generation: undefined }),
        docs: { 'administrativePurgeRecords/PURGE-EVT-SWEEPER': { status: 'PURGED' } },
        bucket: noGenerationBucket
    });
    assert.equal(noGeneration.action, 'KEEP');
    assert.equal(noGeneration.reason, 'MISSING_GENERATION');
    assert.equal(noGenerationBucket.deleted.length, 0);

    const mismatchBucket = fakeBucket({ deleteError: Object.assign(new Error('generation changed'), { code: 412 }) });
    const mismatch = await runHandler({
        event: objectEvent(TARGET),
        docs: { 'administrativePurgeRecords/PURGE-EVT-SWEEPER': { status: 'PURGED' } },
        bucket: mismatchBucket
    });
    assert.equal(mismatch.action, 'KEEP');
    assert.equal(mismatch.reason, 'GENERATION_MISMATCH');
    assert.deepEqual(mismatchBucket.deleted[0].options, { ifGenerationMatch: '10' });
});

test('error transitorio propaga para retry explícito', async () => {
    const transientBucket = fakeBucket({ deleteError: Object.assign(new Error('temporary'), { code: 503 }) });
    await assert.rejects(runHandler({
        event: objectEvent(TARGET),
        docs: { 'administrativePurgeRecords/PURGE-EVT-SWEEPER': { status: 'PURGED' } },
        bucket: transientBucket
    }), { code: 503 });
});
