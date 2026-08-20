import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

test('Rules de appearance cubren vacío, accentColor hexadecimal y whitelist estricta', () => {
    assert.equal((rules.match(/validInvitationAppearance\(data\.appearance\)/g) ?? []).length, 2);
    assert.match(rules, /appearance\.keys\(\)\.size\(\) == 0/);
    assert.match(rules, /appearance\.keys\(\)\.size\(\) == 1/);
    assert.match(rules, /appearance\.keys\(\)\.hasOnly\(\['accentColor'\]\)/);
    assert.match(rules, /appearance\.accentColor is string/);
    assert.match(rules, /appearance\.accentColor\.matches\('\^#\[0-9a-f\]\{6\}\$'\)/);
});
