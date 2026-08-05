import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import test from 'node:test';

const modules = [
    '../portal/services/checkin-validation.js',
    '../portal/services/checkin-service.js',
    '../portal/services/portal-guest-service.js',
    '../portal/modules/guest-search.js',
    '../portal/modules/qr-scanner.js',
    '../portal/modules/portal-controller.js',
    '../portal/modules/portal-login.js',
    '../portal/service-worker.js'
];

test('los módulos modificados tienen sintaxis ECMAScript válida', async () => {
    for (const relativePath of modules) {
        const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
        assert.doesNotThrow(() => new SourceTextModule(source, { identifier: relativePath }));
    }
});
