import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import {
    RSVP_CONFIG_KEY_BITS,
    RSVP_CONFIG_KEY_BYTES,
    buildRsvpAccessDocument,
    generateRsvpConfigKey
} from '../shared/rsvp-access-contract.js';
import {
    areRsvpResponsesEquivalent,
    assertRsvpResponseSelection,
    buildRsvpResponseDocument,
    deserializeRsvpResponseDocument
} from '../shared/rsvp-response-contract.js';
import { normalizeRsvpConfig } from '../admin/invitations/core/rsvp-schema.js';
import { serializeRsvpConfig } from '../admin/invitations/core/rsvp-persistence-schema.js';
import {
    createPublicRsvpProjection,
    deserializeRsvpPublicationMetadata,
    serializeRsvpPublicationMetadata
} from '../admin/invitations/core/rsvp-publication-schema.js';
import { InvitationRsvpService } from '../admin/invitations/services/invitation-rsvp-service.js';
import {
    deserializePublicRsvpConfig,
    isPublicRsvpClosed
} from '../rsvp/core/rsvp-public-config-contract.js';
import { PublicRsvpConfigLoader } from '../rsvp/services/rsvp-public-config-loader.js';
import { RsvpResponseService } from '../rsvp/services/rsvp-response-service.js';
import { PublicRsvpSessionLoader } from '../rsvp/services/rsvp-session-loader.js';
import { RsvpPageController } from '../rsvp/rsvp-controller.js';
import { createRsvpView } from '../rsvp/rsvp-view.js';

const EVENT_ID = 'EVT-PHASE54';
const GUEST_ID = 'INV-0001';
const UID = 'UID-PHASE54';
const TOKEN = 'T'.repeat(43);
const CONFIG_KEY = 'C'.repeat(43);
const CLOSES_DATE = new Date('2030-12-21T00:30:00.000Z');
const NOW_DATE = new Date('2026-08-17T12:00:00.000Z');

function timestamp(value = NOW_DATE) {
    const date = new Date(value);
    return Object.freeze({
        seconds: Math.floor(date.getTime() / 1000),
        nanoseconds: 0,
        toDate: () => new Date(date.getTime())
    });
}

function privateRsvp(overrides = {}) {
    return normalizeRsvpConfig({
        enabled: true,
        title: 'Confirma tu asistencia',
        message: 'Nos encantará contar contigo.',
        buttonLabel: 'Enviar respuesta',
        deadline: '2030-12-20',
        deadlineTime: '18:30',
        deadlineTimeZone: 'America/Mexico_City',
        method: 'internal',
        whatsapp: { phone: '', message: '' },
        guestPolicy: 'assigned-only',
        responses: {
            acceptedLabel: 'Sí asistiré',
            declinedLabel: 'No podré asistir',
            confirmationMessage: 'Gracias por responder.'
        },
        ...overrides
    });
}

function privateDocument(overrides = {}) {
    const config = privateRsvp(overrides.config ?? {});
    return serializeRsvpConfig(config, {
        eventId: EVENT_ID,
        touchedPaths: [],
        responseClosesAt: overrides.responseClosesAt === undefined ? timestamp(CLOSES_DATE) : overrides.responseClosesAt,
        updatedAt: timestamp(),
        updatedBy: UID
    });
}

function publicConfig(overrides = {}) {
    return { ...createPublicRsvpProjection(privateDocument(), { expectedEventId: EVENT_ID }), ...overrides };
}

function accessDocument(overrides = {}) {
    return buildRsvpAccessDocument({
        eventId: EVENT_ID,
        guestId: GUEST_ID,
        guest: { nombre: 'Andrea <script>alert(1)</script>', pases: 4 },
        configKey: CONFIG_KEY,
        active: true,
        expiresAt: null,
        ...overrides
    });
}

function responseDocument(overrides = {}) {
    return buildRsvpResponseDocument({
        eventId: EVENT_ID,
        guestId: GUEST_ID,
        status: 'accepted',
        passesConfirmed: 4,
        respondedAt: timestamp(),
        guestPolicy: 'assigned-only',
        passLimit: 4,
        ...overrides
    });
}

function publicationDocument(configKey = CONFIG_KEY) {
    return serializeRsvpPublicationMetadata({
        eventId: EVENT_ID,
        configKey,
        createdAt: timestamp(),
        createdBy: UID,
        updatedAt: timestamp(),
        updatedBy: UID
    });
}

function createAtomicGateway({ existingPublication = null, failPublish = false } = {}) {
    const state = { privateDocument: null, publication: existingPublication, publicProjection: null };
    const operations = [];
    return {
        state,
        operations,
        getCurrentUid: () => UID,
        serverTimestamp: () => timestamp(),
        timestampFromDate: (value) => timestamp(value),
        readRsvp: async () => state.privateDocument,
        async publishRsvp(eventId, { privateDocument: nextPrivate, updatedBy, configKeyFactory }) {
            operations.push({ type: 'transaction', eventId });
            const existing = state.publication;
            const configKey = existing?.configKey ?? configKeyFactory();
            const nextPublication = existing
                ? serializeRsvpPublicationMetadata({ ...existing, updatedAt: timestamp(), updatedBy })
                : serializeRsvpPublicationMetadata({
                    eventId,
                    configKey,
                    createdAt: timestamp(),
                    createdBy: updatedBy,
                    updatedAt: timestamp(),
                    updatedBy
                });
            const nextPublic = createPublicRsvpProjection(nextPrivate, { expectedEventId: eventId });
            if (failPublish) throw new Error('atomic failure');
            state.privateDocument = nextPrivate;
            state.publication = nextPublication;
            state.publicProjection = nextPublic;
            return {
                configKey,
                metadata: nextPublication,
                publicProjection: nextPublic,
                created: !existing
            };
        }
    };
}

function createResponseGateway({ initial = null, failWrite = false, pendingWrite = null } = {}) {
    let stored = initial;
    const writes = [];
    return {
        writes,
        serverTimestamp: () => Object.freeze({ serverTimestamp: true }),
        readResponse: async () => stored,
        async writeResponse(eventId, token, document) {
            writes.push({ eventId, token, document });
            if (pendingWrite) await pendingWrite;
            if (failWrite) throw new Error('unsafe firebase details');
            stored = { ...document, respondedAt: timestamp() };
        }
    };
}

test('1. configKey usa 256 bits, 32 bytes y base64url de 43 caracteres', () => {
    const key = generateRsvpConfigKey();
    assert.equal(RSVP_CONFIG_KEY_BYTES, 32);
    assert.equal(RSVP_CONFIG_KEY_BITS, 256);
    assert.equal(key.length, 43);
    assert.match(key, /^[A-Za-z0-9_-]{43}$/);
});

test('2. configKey usa getRandomValues y nunca Math.random', async () => {
    let received;
    const key = generateRsvpConfigKey({ cryptoApi: { getRandomValues(bytes) { received = bytes; bytes.fill(9); } } });
    assert.equal(received.byteLength, 32);
    assert.equal(key.length, 43);
    const source = await readFile(new URL('../shared/rsvp-access-contract.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /Math\.random/);
});

test('3. publication metadata tiene siete campos exactos y ownership', () => {
    const document = publicationDocument();
    assert.deepEqual(Object.keys(document).sort(), [
        'configKey', 'createdAt', 'createdBy', 'eventId', 'schemaVersion', 'updatedAt', 'updatedBy'
    ]);
    assert.equal(deserializeRsvpPublicationMetadata(document, { expectedEventId: EVENT_ID }).configKey, CONFIG_KEY);
    assert.throws(() => deserializeRsvpPublicationMetadata(document, { expectedEventId: 'EVT-OTHER' }), /ownership-mismatch/);
});

test('4. la proyección pública RAW contiene sólo los doce campos runtime', () => {
    const projection = publicConfig();
    assert.deepEqual(Object.keys(projection).sort(), [
        'buttonLabel', 'deadlineTimeZone', 'enabled', 'eventId', 'guestPolicy', 'message',
        'method', 'responseClosesAt', 'responses', 'schemaVersion', 'title', 'whatsapp'
    ]);
});

test('5. la proyección excluye touched, auditoría, UID, guest phone y QR', () => {
    const raw = JSON.stringify(publicConfig());
    for (const field of ['touchedPaths', 'updatedBy', 'createdBy', 'uid', 'dirty', 'displayName', 'qrToken', 'guestId']) {
        assert.equal(raw.includes(`"${field}"`), false);
    }
});

test('6. public config usa responseClosesAt y timezone sin fecha/hora raw', () => {
    const projection = publicConfig();
    assert.equal(projection.deadlineTimeZone, 'America/Mexico_City');
    assert.equal(projection.responseClosesAt.toDate().toISOString(), CLOSES_DATE.toISOString());
    assert.equal('deadline' in projection, false);
    assert.equal('deadlineTime' in projection, false);
});

test('6A. método internal no publica datos WhatsApp retenidos en privado', () => {
    const projection = createPublicRsvpProjection(privateDocument({ config: {
        method: 'internal',
        whatsapp: { phone: '+525512345678', message: 'Dato retenido' }
    } }), { expectedEventId: EVENT_ID });
    assert.deepEqual(projection.whatsapp, { phone: '', message: '' });
});

test('7. documento público corrupto o con extra se rechaza', () => {
    assert.throws(() => deserializePublicRsvpConfig({ ...publicConfig(), internal: true }, { expectedEventId: EVENT_ID }), /invalid-document-shape/);
    assert.throws(() => deserializePublicRsvpConfig({ ...publicConfig(), eventId: 'EVT-OTHER' }, { expectedEventId: EVENT_ID }), /ownership-mismatch/);
});

test('8. save crea private, metadata y projection en una sola operación lógica', async () => {
    const gateway = createAtomicGateway();
    const service = new InvitationRsvpService({ gateway, configKeyFactory: () => CONFIG_KEY });
    const result = await service.save({ eventId: EVENT_ID, draftEventId: EVENT_ID, rsvp: privateRsvp() });
    assert.equal(gateway.operations.length, 1);
    assert.equal(result.configKey, CONFIG_KEY);
    assert.equal(gateway.state.privateDocument.eventId, EVENT_ID);
    assert.equal(gateway.state.publication.configKey, CONFIG_KEY);
    assert.equal(gateway.state.publicProjection.eventId, EVENT_ID);
});

test('9. un save posterior conserva configKey y no invoca otra generación', async () => {
    let generations = 0;
    const gateway = createAtomicGateway({ existingPublication: publicationDocument() });
    const service = new InvitationRsvpService({ gateway, configKeyFactory: () => { generations += 1; return 'N'.repeat(43); } });
    const result = await service.save({ eventId: EVENT_ID, draftEventId: EVENT_ID, rsvp: privateRsvp() });
    assert.equal(result.configKey, CONFIG_KEY);
    assert.equal(generations, 0);
});

test('10. fallo atómico no deja private o public parcialmente actualizados', async () => {
    const gateway = createAtomicGateway({ failPublish: true });
    await assert.rejects(
        new InvitationRsvpService({ gateway, configKeyFactory: () => CONFIG_KEY })
            .save({ eventId: EVENT_ID, draftEventId: EVENT_ID, rsvp: privateRsvp() }),
        /atomic failure/
    );
    assert.equal(gateway.state.privateDocument, null);
    assert.equal(gateway.state.publication, null);
    assert.equal(gateway.state.publicProjection, null);
});

test('10A. gateway real usa runTransaction y publica los tres documentos', async () => {
    const source = await readFile(new URL('../admin/invitations/services/invitation-rsvp-service.js', import.meta.url), 'utf8');
    assert.match(source, /firestoreApi\.runTransaction/);
    assert.equal((source.match(/transaction\.set\(/g) ?? []).length, 3);
    assert.doesNotMatch(source, /writeRsvp\s*:/);
});

test('11. Access v2 RAW incluye configKey y ningún secreto adicional', () => {
    const access = accessDocument();
    assert.equal(access.schemaVersion, 2);
    assert.equal(access.configKey, CONFIG_KEY);
    assert.deepEqual(Object.keys(access).sort(), [
        'active', 'configKey', 'displayName', 'eventId', 'expiresAt', 'guestId', 'passLimit', 'schemaVersion'
    ]);
});

test('12. loader de config hace un único GET exacto y valida ownership', async () => {
    const calls = [];
    const loader = new PublicRsvpConfigLoader({ gateway: { readPublicConfig: async (eventId, configKey) => {
        calls.push({ eventId, configKey });
        return publicConfig();
    } } });
    const result = await loader.load(EVENT_ID, CONFIG_KEY);
    assert.equal(result.eventId, EVENT_ID);
    assert.deepEqual(calls, [{ eventId: EVENT_ID, configKey: CONFIG_KEY }]);
});

test('13. configKey malformada no inicializa gateway', async () => {
    let calls = 0;
    const loader = new PublicRsvpConfigLoader({ gatewayFactory: async () => { calls += 1; return {}; } });
    await assert.rejects(loader.load(EVENT_ID, 'short'), /unavailable/);
    assert.equal(calls, 0);
});

test('14. response RAW tiene exactamente seis campos y no duplica token', () => {
    const response = responseDocument();
    assert.deepEqual(Object.keys(response).sort(), [
        'eventId', 'guestId', 'passesConfirmed', 'respondedAt', 'schemaVersion', 'status'
    ]);
    assert.equal('token' in response, false);
});

test('15. assigned-only accepted exige exactamente passLimit', () => {
    assert.deepEqual(assertRsvpResponseSelection({ status: 'accepted', passesConfirmed: 4 }, {
        guestPolicy: 'assigned-only', passLimit: 4
    }), { status: 'accepted', passesConfirmed: 4 });
    for (const value of [0, 1, 3, 5]) {
        assert.throws(() => assertRsvpResponseSelection({ status: 'accepted', passesConfirmed: value }, {
            guestPolicy: 'assigned-only', passLimit: 4
        }));
    }
});

test('16. select-up acepta 1..passLimit y rechaza 0, exceso, float y string', () => {
    for (const value of [1, 4]) {
        assert.doesNotThrow(() => assertRsvpResponseSelection({ status: 'accepted', passesConfirmed: value }, {
            guestPolicy: 'select-up-to-assigned', passLimit: 4
        }));
    }
    for (const value of [0, 5, -1, 1.5, '2']) {
        assert.throws(() => assertRsvpResponseSelection({ status: 'accepted', passesConfirmed: value }, {
            guestPolicy: 'select-up-to-assigned', passLimit: 4
        }));
    }
});

test('17. declined exige siempre cero pases', () => {
    assert.doesNotThrow(() => assertRsvpResponseSelection({ status: 'declined', passesConfirmed: 0 }, {
        guestPolicy: 'assigned-only', passLimit: 4
    }));
    assert.throws(() => assertRsvpResponseSelection({ status: 'declined', passesConfirmed: 1 }, {
        guestPolicy: 'assigned-only', passLimit: 4
    }));
});

test('18. deserialize response rechaza guest, event, schema y extras', () => {
    const options = { expectedEventId: EVENT_ID, expectedGuestId: GUEST_ID, guestPolicy: 'assigned-only', passLimit: 4 };
    assert.throws(() => deserializeRsvpResponseDocument({ ...responseDocument(), extra: true }, options), /shape/);
    assert.throws(() => deserializeRsvpResponseDocument({ ...responseDocument(), eventId: 'EVT-OTHER' }, options), /event-ownership/);
    assert.throws(() => deserializeRsvpResponseDocument({ ...responseDocument(), guestId: 'INV-2' }, options), /guest-ownership/);
});

test('19. response service crea y verifica una respuesta accepted', async () => {
    const gateway = createResponseGateway();
    const service = new RsvpResponseService({ gateway, now: () => NOW_DATE });
    const result = await service.save({
        eventId: EVENT_ID, token: TOKEN, access: accessDocument(), config: publicConfig(),
        status: 'accepted', passesConfirmed: 4
    });
    assert.equal(result.status, 'saved');
    assert.equal(gateway.writes.length, 1);
    assert.equal(result.response.status, 'accepted');
});

test('20. response service actualiza accepted a declined sobre el mismo path', async () => {
    const gateway = createResponseGateway({ initial: responseDocument() });
    const service = new RsvpResponseService({ gateway, now: () => NOW_DATE });
    await service.load({ eventId: EVENT_ID, token: TOKEN, access: accessDocument(), config: publicConfig() });
    const result = await service.save({
        eventId: EVENT_ID, token: TOKEN, access: accessDocument(), config: publicConfig(),
        status: 'declined', passesConfirmed: 0
    });
    assert.equal(result.response.status, 'declined');
    assert.equal(gateway.writes[0].token, TOKEN);
});

test('21. respuesta equivalente retorna unchanged sin write', async () => {
    const existing = responseDocument();
    const gateway = createResponseGateway({ initial: existing });
    const service = new RsvpResponseService({ gateway, now: () => NOW_DATE });
    await service.load({ eventId: EVENT_ID, token: TOKEN, access: accessDocument(), config: publicConfig() });
    const result = await service.save({
        eventId: EVENT_ID, token: TOKEN, access: accessDocument(), config: publicConfig(),
        status: 'accepted', passesConfirmed: 4
    });
    assert.equal(result.status, 'unchanged');
    assert.equal(gateway.writes.length, 0);
    assert.equal(areRsvpResponsesEquivalent(result.response, result.response), true);
});

test('22. doble submit concurrente comparte una sola operación de escritura', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const gateway = createResponseGateway({ pendingWrite: pending });
    const service = new RsvpResponseService({ gateway, now: () => NOW_DATE });
    const input = {
        eventId: EVENT_ID, token: TOKEN, access: accessDocument(), config: publicConfig(),
        status: 'accepted', passesConfirmed: 4
    };
    const first = service.save(input);
    const second = service.save(input);
    assert.equal(gateway.writes.length, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(gateway.writes.length, 1);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.response.respondedAt.toDate().getTime(), b.response.respondedAt.toDate().getTime());
    assert.equal(gateway.writes.length, 1);
});

test('23. fallo de write no produce éxito falso y permite retry', async () => {
    const failing = createResponseGateway({ failWrite: true });
    const service = new RsvpResponseService({ gateway: failing, now: () => NOW_DATE });
    const input = {
        eventId: EVENT_ID, token: TOKEN, access: accessDocument(), config: publicConfig(),
        status: 'accepted', passesConfirmed: 4
    };
    await assert.rejects(service.save(input), /save-failed/);
    const working = createResponseGateway();
    service.gateway = working;
    const result = await service.save(input);
    assert.equal(result.status, 'saved');
    assert.equal(working.writes.length, 1);
});

test('24. method whatsapp bloquea cualquier response write', async () => {
    const gateway = createResponseGateway();
    const service = new RsvpResponseService({ gateway, now: () => NOW_DATE });
    const config = publicConfig({
        method: 'whatsapp',
        whatsapp: { phone: '+525512345678', message: 'Confirmo asistencia' }
    });
    assert.throws(() => service.save({
        eventId: EVENT_ID, token: TOKEN, access: accessDocument(), config,
        status: 'accepted', passesConfirmed: 4
    }), /method-not-internal/);
    assert.equal(gateway.writes.length, 0);
});

test('25. cliente detecta closed, pero el contrato conserva Timestamp para Rules', () => {
    assert.equal(isPublicRsvpClosed(publicConfig(), NOW_DATE), false);
    assert.equal(isPublicRsvpClosed(publicConfig(), CLOSES_DATE), true);
});

test('26. session loader ejecuta access, config y response en orden', async () => {
    const calls = [];
    const loader = new PublicRsvpSessionLoader({
        accessLoader: { load: async () => { calls.push('access'); return accessDocument(); } },
        configLoader: { load: async () => { calls.push('config'); return publicConfig(); } },
        responseService: { load: async () => { calls.push('response'); return null; } },
        now: () => NOW_DATE
    });
    const result = await loader.loadRoute(`?event=${EVENT_ID}&token=${TOKEN}`);
    assert.equal(result.status, 'ready-internal');
    assert.deepEqual(calls, ['access', 'config', 'response']);
});

test('27. session loader restaura existing response', async () => {
    const loader = new PublicRsvpSessionLoader({
        accessLoader: { load: async () => accessDocument() },
        configLoader: { load: async () => publicConfig() },
        responseService: { load: async () => responseDocument() },
        now: () => NOW_DATE
    });
    const result = await loader.loadRoute(`?event=${EVENT_ID}&token=${TOKEN}`);
    assert.equal(result.status, 'existing-response');
    assert.equal(result.response.passesConfirmed, 4);
});

test('28. session loader distingue whatsapp, closed e invalid sin lecturas extra', async () => {
    const accessLoader = { load: async () => accessDocument() };
    const responseService = { load: async () => null };
    const whatsapp = new PublicRsvpSessionLoader({
        accessLoader,
        configLoader: { load: async () => publicConfig({ method: 'whatsapp', whatsapp: { phone: '+525512345678', message: '' } }) },
        responseService,
        now: () => NOW_DATE
    });
    assert.equal((await whatsapp.loadRoute(`?event=${EVENT_ID}&token=${TOKEN}`)).status, 'ready-whatsapp');
    const closed = new PublicRsvpSessionLoader({
        accessLoader,
        configLoader: { load: async () => publicConfig() },
        responseService,
        now: () => CLOSES_DATE
    });
    assert.equal((await closed.loadRoute(`?event=${EVENT_ID}&token=${TOKEN}`)).status, 'closed');
    assert.equal((await closed.loadRoute('?event=bad/id&token=short')).status, 'invalid');
});

test('29. controller no entrega token ni configKey a la vista', async () => {
    let rendered;
    const view = createViewStub({ renderSession: (model) => { rendered = model; } });
    const controller = new RsvpPageController({
        sessionLoader: { loadRoute: async () => ({
            status: 'ready-internal', eventId: EVENT_ID, token: TOKEN,
            access: accessDocument(), config: publicConfig(), response: null, closed: false
        }) },
        responseService: { save: async () => null },
        view
    });
    await controller.start('route');
    assert.equal('token' in rendered, false);
    assert.equal('configKey' in rendered.access, false);
});

test('30. controller conserva la sesión y permite retry después de fallo', async () => {
    let attempts = 0;
    const view = createViewStub();
    const controller = new RsvpPageController({
        sessionLoader: { loadRoute: async () => ({
            status: 'ready-internal', eventId: EVENT_ID, token: TOKEN,
            access: accessDocument(), config: publicConfig(), response: null, closed: false
        }) },
        responseService: { save: async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('fail');
            return { status: 'saved', response: responseDocument() };
        } },
        view
    });
    await controller.start('route');
    assert.equal((await controller.submit({ status: 'accepted', passesConfirmed: 4 })).status, 'error');
    assert.equal((await controller.submit({ status: 'accepted', passesConfirmed: 4 })).status, 'saved');
    assert.equal(attempts, 2);
});

test('31. vista hidrata respuesta y usa textContent frente a payload XSS', async () => {
    const html = await readFile(new URL('../rsvp/index.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html);
    const view = createRsvpView(dom.window.document);
    view.renderSession({
        state: 'existing-response',
        access: { displayName: '<img src=x onerror=alert(1)>', passLimit: 4 },
        config: publicConfig({ title: '<script>alert(1)</script>', message: '<b>mensaje</b>' }),
        response: responseDocument(),
        closed: false
    });
    assert.equal(dom.window.document.querySelector('#rsvp-title').textContent, '<script>alert(1)</script>');
    assert.equal(dom.window.document.querySelector('#rsvp-guest-name').textContent, '<img src=x onerror=alert(1)>');
    assert.equal(dom.window.document.querySelector('#rsvp-title script'), null);
    assert.equal(dom.window.document.querySelector('#rsvp-guest-name img'), null);
    assert.equal(dom.window.document.querySelector('input[value="accepted"]').checked, true);
});

test('32. UI contiene fieldset, legend, labels, aria-live y foco visible', async () => {
    const [html, css] = await Promise.all([
        readFile(new URL('../rsvp/index.html', import.meta.url), 'utf8'),
        readFile(new URL('../rsvp/rsvp.css', import.meta.url), 'utf8')
    ]);
    assert.match(html, /<fieldset/);
    assert.match(html, /<legend>/);
    assert.match(html, /<label class="rsvp-choice">/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /aria-busy="true"/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /min-height:\s*5[02]px/);
    const dom = new JSDOM(html);
    const view = createRsvpView(dom.window.document);
    view.renderSession({
        state: 'ready-internal',
        access: { displayName: 'Andrea', passLimit: 4 },
        config: publicConfig(),
        response: null,
        closed: false
    });
    view.setSaving(true);
    assert.equal(dom.window.document.querySelector('#rsvp-fieldset').disabled, true);
    assert.equal(dom.window.document.querySelector('#rsvp-submit').disabled, true);
    assert.equal(dom.window.document.querySelector('#rsvp-card').getAttribute('aria-busy'), 'true');
    view.showSaveError();
    assert.equal(dom.window.document.querySelector('#rsvp-feedback').getAttribute('data-tone'), 'error');
});

test('33. runtime usa WhatsApp helper canónico y no importa endpoints arbitrarios', async () => {
    const source = await readFile(new URL('../rsvp/rsvp-view.js', import.meta.url), 'utf8');
    assert.match(source, /buildWhatsAppUrl/);
    assert.doesNotMatch(source, /api\.whatsapp|whatsapp\.com\/send/);
});

test('34. runtime no usa storage, cookies, analytics, console o Math.random', async () => {
    const files = [
        '../rsvp/rsvp.js', '../rsvp/rsvp-controller.js', '../rsvp/rsvp-view.js',
        '../rsvp/services/rsvp-access-loader.js', '../rsvp/services/rsvp-public-config-loader.js',
        '../rsvp/services/rsvp-response-service.js', '../rsvp/services/rsvp-session-loader.js'
    ];
    const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
    for (const source of sources) {
        assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|console\.|analytics|Math\.random/);
    }
});

test('35. response runtime sólo referencia rsvpResponses y nunca guest, QR o check-in writes', async () => {
    const source = await readFile(new URL('../rsvp/services/rsvp-response-service.js', import.meta.url), 'utf8');
    assert.match(source, /rsvpResponses/);
    assert.doesNotMatch(source, /invitados|qrToken|qrActivo|checkins|checkinSecuencia|pasesDisponibles|pasesUtilizados/);
});

function createViewStub(overrides = {}) {
    const stub = {
        onSubmit(handler) { this.submitHandler = handler; },
        onRetry(handler) { this.retryHandler = handler; },
        renderLoading() {},
        renderUnavailable() {},
        renderSession() {},
        readSelection: () => ({ status: 'accepted', passesConfirmed: 4 }),
        setSaving() {},
        showSaveResult() {},
        showSaveError() {},
        ...overrides
    };
    return stub;
}
