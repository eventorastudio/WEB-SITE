import assert from 'node:assert/strict';
import test from 'node:test';

import { PersonalizedInvitationService } from '../admin/services/personalized-invitation-service.js';
import { buildRsvpAccessDocument } from '../shared/rsvp-access-contract.js';

const EVENT_ID = 'EVT-7101';
const GUEST_ID = 'INV-7101';
const PUBLIC_KEY = 'a'.repeat(48);
const CONFIG_KEY = 'k'.repeat(43);
const ACTIVE_TOKEN = 'A'.repeat(43);
const REPLACEMENT_TOKEN = 'R'.repeat(43);
const REVOKED_TOKEN = 'V'.repeat(43);
const EXPIRED_TOKEN = 'E'.repeat(43);
const NOW = new Date('2026-08-17T12:00:00.000Z');
const FUTURE = new Date('2026-08-18T12:00:00.000Z');
const PAST = new Date('2026-08-16T12:00:00.000Z');

function timestamp(value = NOW) {
    const date = new Date(value);
    return { toDate: () => new Date(date.getTime()) };
}

function publication() {
    return {
        schemaVersion: 2,
        eventId: EVENT_ID,
        currentRevisionId: 'REV-000001',
        currentRevisionNumber: 1,
        publicKey: PUBLIC_KEY,
        publishedAt: timestamp(),
        publishedBy: 'UID-PHASE71'
    };
}

function guest() {
    return {
        nombre: 'Andrea Tellez',
        pases: 4
    };
}

function accessDocument(overrides = {}) {
    return buildRsvpAccessDocument({
        eventId: EVENT_ID,
        guestId: GUEST_ID,
        guest: guest(),
        configKey: CONFIG_KEY,
        active: true,
        expiresAt: FUTURE,
        ...overrides
    });
}

function gatewayWithAccess(records = []) {
    const calls = [];
    return {
        calls,
        async readPublication(eventId) {
            calls.push({ type: 'read-publication', eventId });
            return publication();
        },
        async findAccessByGuest(eventId, guestId) {
            calls.push({ type: 'find-access', eventId, guestId });
            return records;
        }
    };
}

function accessCreator({ token = REPLACEMENT_TOKEN, document = accessDocument() } = {}) {
    const calls = [];
    return {
        calls,
        async create(input) {
            calls.push(input);
            return {
                eventId: input.eventId,
                guestId: input.guestId,
                token,
                url: `https://eventora.test/rsvp/?event=${input.eventId}&token=${token}`,
                access: document
            };
        }
    };
}

function createService({ records = [], creator = accessCreator() } = {}) {
    return {
        creator,
        gateway: gatewayWithAccess(records),
        service: null
    };
}

function initService(fixture) {
    fixture.service = new PersonalizedInvitationService({
        gateway: fixture.gateway,
        accessService: fixture.creator,
        now: () => NOW,
        publicBaseUrl: 'https://eventorastudio.com/invitacion/'
    });
    return fixture.service;
}

test('7.1 reutiliza un RSVP Access activo y válido al copiar invitación', async () => {
    const fixture = createService({
        records: [{ token: ACTIVE_TOKEN, document: accessDocument() }],
        creator: accessCreator()
    });
    const service = initService(fixture);

    const result = await service.createGuestInvitationUrl({ eventId: EVENT_ID, guestId: GUEST_ID });
    const url = new URL(result.url);

    assert.equal(result.token, ACTIVE_TOKEN);
    assert.equal(url.pathname, '/invitacion/');
    assert.equal(url.searchParams.get('event'), EVENT_ID);
    assert.equal(url.searchParams.get('key'), PUBLIC_KEY);
    assert.equal(url.searchParams.get('token'), ACTIVE_TOKEN);
    assert.equal(url.searchParams.has('invite'), false);
    assert.deepEqual(fixture.creator.calls, []);
});

test('7.1 crea un RSVP Access cuando el invitado no tiene uno', async () => {
    const fixture = createService({ records: [] });
    const service = initService(fixture);

    const result = await service.createGuestInvitationUrl({ eventId: EVENT_ID, guestId: GUEST_ID });
    const url = new URL(result.url);

    assert.equal(result.token, REPLACEMENT_TOKEN);
    assert.deepEqual(fixture.creator.calls, [{ eventId: EVENT_ID, guestId: GUEST_ID }]);
    assert.equal(url.pathname, '/invitacion/');
    assert.equal(url.searchParams.get('event'), EVENT_ID);
    assert.equal(url.searchParams.get('key'), PUBLIC_KEY);
    assert.equal(url.searchParams.get('token'), REPLACEMENT_TOKEN);
});

test('7.1 crea uno nuevo si el Access anterior está revocado o expirado', async () => {
    for (const [token, document] of [
        [REVOKED_TOKEN, accessDocument({ active: false })],
        [EXPIRED_TOKEN, accessDocument({ expiresAt: PAST })]
    ]) {
        const fixture = createService({
            records: [{ token, document }],
            creator: accessCreator()
        });
        const service = initService(fixture);

        const result = await service.createGuestInvitationUrl({ eventId: EVENT_ID, guestId: GUEST_ID });

        assert.equal(result.token, REPLACEMENT_TOKEN);
        assert.notEqual(result.token, token);
        assert.deepEqual(fixture.creator.calls, [{ eventId: EVENT_ID, guestId: GUEST_ID }]);
    }
});
