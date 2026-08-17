import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { PersonalizedInvitationService } from '../admin/services/personalized-invitation-service.js';
import { PublicRsvpAccessLoader } from '../rsvp/services/rsvp-access-loader.js';
import {
    PublicInvitationPersonalizationLoader,
    applyPublicInvitationPersonalization
} from '../invitacion/public-invitation-personalization.js';
import { PublicInvitationPage } from '../invitacion/public-invitation-page.js';

const EVENT_ID = 'EVT-0001';
const GUEST_ID = 'INV-0022';
const PUBLIC_KEY = 'a'.repeat(48);
const RSVP_TOKEN = 'R'.repeat(43);
const CONFIG_KEY = 'C'.repeat(43);
const NOW = new Date('2026-08-17T12:00:00.000Z');

function projection() {
    return {
        schemaVersion: 1,
        contentSchemaVersion: 4,
        eventId: EVENT_ID,
        publicKey: PUBLIC_KEY,
        revisionId: 'REV-000001',
        revisionNumber: 1,
        theme: 'champagne',
        sections: ['welcome-story'],
        content: {
            identity: { primaryName: 'María', secondaryName: 'Fernando', eventType: 'Boda', phrase: '' }
        },
        locations: [],
        itinerary: [],
        gifts: [],
        accommodations: [],
        links: [],
        appearance: {},
        settings: { renderMode: 'builder', packageId: 'prestige' },
        media: {
            schemaVersion: 1,
            touchedRoles: [],
            cover: null,
            gallery: [],
            video: null,
            videoPoster: null,
            music: null
        }
    };
}

function access(overrides = {}) {
    return {
        schemaVersion: 2,
        eventId: EVENT_ID,
        guestId: GUEST_ID,
        configKey: CONFIG_KEY,
        displayName: 'Andrea Téllez',
        passLimit: 4,
        active: true,
        expiresAt: new Date('2026-09-17T12:00:00.000Z'),
        ...overrides
    };
}

function publication() {
    return {
        schemaVersion: 2,
        eventId: EVENT_ID,
        currentRevisionId: 'REV-000001',
        currentRevisionNumber: 1,
        publicKey: PUBLIC_KEY,
        publishedAt: new Date('2026-08-17T08:00:00.000Z'),
        publishedBy: 'UID-ADMIN'
    };
}

test('token válido personaliza nombre/pases y dirige el CTA al RSVP del Access', async () => {
    const reads = [];
    const accessLoader = new PublicRsvpAccessLoader({
        gateway: {
            async readPublicAccess(eventId, token) {
                reads.push({ eventId, token });
                return access();
            }
        },
        now: () => NOW
    });
    let payload;
    const page = new PublicInvitationPage({
        loader: { load: async () => projection() },
        personalizationLoader: new PublicInvitationPersonalizationLoader({ accessLoader }),
        renderer: async (value) => { payload = value; }
    });
    const result = await page.load({
        href: `https://eventorastudio.com/invitacion/?event=${EVENT_ID}&key=${PUBLIC_KEY}&token=${RSVP_TOKEN}`
    });

    assert.equal(result.status, 'rendered');
    assert.deepEqual(reads, [{ eventId: EVENT_ID, token: RSVP_TOKEN }]);
    assert.deepEqual(payload.personalization, { displayName: 'Andrea Téllez', passLimit: 4 });
    assert.deepEqual(Object.keys(payload.personalization).sort(), ['displayName', 'passLimit']);
    assert.equal(payload.rsvpUrl, `https://eventorastudio.com/rsvp/?event=${EVENT_ID}&token=${RSVP_TOKEN}`);

    const dom = new JSDOM('<!doctype html><body><main><a data-demo-action="rsvp">RSVP original</a></main></body>', {
        url: 'https://eventorastudio.com/invitacion/'
    });
    const applied = applyPublicInvitationPersonalization(dom.window.document, payload.personalization, payload.rsvpUrl);
    assert.equal(applied.applied, true);
    assert.match(dom.window.document.body.textContent, /Andrea Téllez/);
    assert.match(dom.window.document.body.textContent, /4 pases asignados/);
    dom.window.document.querySelectorAll('[data-public-invitation-rsvp]').forEach((cta) => {
        assert.equal(cta.href, payload.rsvpUrl);
    });
    dom.window.close();
});

test('sin token conserva el payload público genérico y no consulta RSVP Access', async () => {
    let personalizationReads = 0;
    let payload;
    const page = new PublicInvitationPage({
        loader: { load: async () => projection() },
        personalizationLoader: {
            async load() {
                personalizationReads += 1;
                throw new Error('no debe consultarse');
            }
        },
        renderer: async (value) => { payload = value; }
    });
    const result = await page.load({
        href: `https://eventorastudio.com/invitacion/?event=${EVENT_ID}&key=${PUBLIC_KEY}`
    });

    assert.equal(result.status, 'rendered');
    assert.equal(personalizationReads, 0);
    assert.equal(Object.hasOwn(payload, 'personalization'), false);
    assert.equal(Object.hasOwn(payload, 'rsvpUrl'), false);
    assert.equal(payload.publication.revisionId, 'REV-000001');
});

test('Access inexistente, cross-event, revocado o expirado conserva la invitación genérica sin exponer datos', async () => {
    const invalidDocuments = [
        null,
        access({ eventId: 'EVT-OTHER', displayName: 'SECRETO CROSS EVENT' }),
        access({ active: false, displayName: 'SECRETO REVOCADO' }),
        access({ expiresAt: new Date('2026-08-17T11:59:59.000Z'), displayName: 'SECRETO EXPIRADO' })
    ];

    for (const document of invalidDocuments) {
        let payload;
        const accessLoader = new PublicRsvpAccessLoader({
            gateway: { readPublicAccess: async () => document },
            now: () => NOW
        });
        const page = new PublicInvitationPage({
            loader: { load: async () => projection() },
            personalizationLoader: new PublicInvitationPersonalizationLoader({ accessLoader }),
            renderer: async (value) => { payload = value; }
        });
        const result = await page.load({
            href: `https://eventorastudio.com/invitacion/?event=${EVENT_ID}&key=${PUBLIC_KEY}&token=${RSVP_TOKEN}`
        });

        assert.equal(result.status, 'rendered');
        assert.equal(Object.hasOwn(payload, 'personalization'), false);
        assert.equal(Object.hasOwn(payload, 'rsvpUrl'), false);
        assert.doesNotMatch(JSON.stringify(payload), /SECRETO/);
        assert.equal(payload.publication.eventId, EVENT_ID);
    }
});

test('ADMIN genera “Copiar invitación” con publicKey y RSVP token activos correctos', async () => {
    const service = new PersonalizedInvitationService({
        gateway: {
            readPublication: async () => publication(),
            findAccessByGuest: async (eventId, guestId) => {
                assert.equal(eventId, EVENT_ID);
                assert.equal(guestId, GUEST_ID);
                return [{ token: RSVP_TOKEN, document: access() }];
            }
        },
        now: () => NOW,
        publicBaseUrl: 'https://eventorastudio.com/invitacion/'
    });
    const result = await service.createGuestInvitationUrl({ eventId: EVENT_ID, guestId: GUEST_ID });
    const url = new URL(result.url);

    assert.equal(url.pathname, '/invitacion/');
    assert.equal(url.searchParams.get('event'), EVENT_ID);
    assert.equal(url.searchParams.get('key'), PUBLIC_KEY);
    assert.equal(url.searchParams.get('token'), RSVP_TOKEN);
    assert.deepEqual(result.personalization, { displayName: 'Andrea Téllez', passLimit: 4 });

    const controllerSource = readFileSync(
        new URL('../admin/modules/event-controller.js', import.meta.url),
        'utf8'
    );
    assert.match(controllerSource, /copy-invitation', 'Copiar invitación'/);
});
