import test from 'node:test';
import assert from 'node:assert/strict';

import {
    prepareRefundProjectPurge,
    recordRefundProcessed,
    confirmRefundRecord,
    authorizeRefundProjectPurge,
    cancelRefundProjectPurgeAuthorization
} from '../functions/index.js';

const callables = [
    ['prepareRefundProjectPurge', prepareRefundProjectPurge],
    ['recordRefundProcessed', recordRefundProcessed],
    ['confirmRefundRecord', confirmRefundRecord],
    ['authorizeRefundProjectPurge', authorizeRefundProjectPurge],
    ['cancelRefundProjectPurgeAuthorization', cancelRefundProjectPurgeAuthorization]
];

test('las cinco callables devuelven unauthenticated sin Firebase Auth', async () => {
    for (const [name, callable] of callables) {
        await assert.rejects(
            callable.run({ auth: null, data: {} }),
            (error) => error.code === 'unauthenticated',
            name
        );
    }
});

test('las cinco callables conservan permission-denied para Auth sin claim CEO', async () => {
    for (const [name, callable] of callables) {
        await assert.rejects(
            callable.run({ auth: { uid: `NON-CEO-${name}`, token: {} }, data: {} }),
            (error) => error.code === 'permission-denied',
            name
        );
    }
});
