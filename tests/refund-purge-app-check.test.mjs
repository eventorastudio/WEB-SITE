import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

test('las cinco callables administrativas de purge exigen App Check server-side', () => {
    assert.match(source, /enforceAppCheck:\s*true/);
    assert.doesNotMatch(source, /enforceAppCheck:\s*false/);
    for (const name of [
        'prepareRefundProjectPurge', 'recordRefundProcessed', 'confirmRefundRecord',
        'authorizeRefundProjectPurge', 'cancelRefundProjectPurgeAuthorization'
    ]) {
        const start = source.indexOf(`export const ${name}`);
        const end = source.indexOf('\nexport const ', start + 1);
        const block = source.slice(start, end < 0 ? source.length : end);
        assert.match(block, /ADMIN_PURGE_CALLABLE_OPTIONS/);
    }
});
