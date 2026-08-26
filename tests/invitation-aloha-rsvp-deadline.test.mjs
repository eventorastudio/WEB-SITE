import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { applyTemplateContentBindings } from '../admin/invitations/core/template-binding-registry.js';

const template = fs.readFileSync('principal/demos/xv-renatta/index.html', 'utf8');

function renderDeadline(deadline) {
    const dom = new JSDOM(template);
    const { document } = dom.window;
    const draft = {
        content: { rsvp: { deadline } },
        meta: { touchedPaths: ['content.rsvp.deadline'] }
    };
    applyTemplateContentBindings(document, 'aloha', draft);
    return document.querySelector('.rsvp [data-builder-field-path="content.rsvp.deadline"]');
}

test('Aloha RSVP renders canonical deadline in the shared binding', () => {
    const deadline = renderDeadline('2027-11-26');
    assert.ok(deadline);
    assert.equal(deadline.textContent, 'Confirma antes del 26 de noviembre de 2027.');
    assert.equal(deadline.hidden, false);
});

test('Aloha RSVP renders the second canonical deadline', () => {
    const deadline = renderDeadline('2028-05-20');
    assert.ok(deadline);
    assert.equal(deadline.textContent, 'Confirma antes del 20 de mayo de 2028.');
    assert.equal(deadline.hidden, false);
});

test('Aloha RSVP hides the deadline when the value is empty', () => {
    const deadline = renderDeadline('');
    assert.ok(deadline);
    assert.equal(deadline.textContent, '');
    assert.equal(deadline.hidden, true);
});
