import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    RSVP_ACCESS_PASS_LIMIT_MAX,
    RSVP_ACCESS_TOKEN_BITS,
    RSVP_ACCESS_TOKEN_BYTES,
    assertRsvpAccessToken,
    buildRsvpAccessDocument,
    buildRsvpUrl,
    deserializeRsvpAccessDocument,
    generateRsvpAccessToken,
    isRsvpAccessExpired,
    isValidRsvpAccessToken,
    parseRsvpRoute,
    projectGuestForRsvpAccess
} from '../shared/rsvp-access-contract.js';
import { generateGuestQrToken } from '../shared/guest-contract.js';
import { buildQrPayload } from '../shared/qr-code.js';
import { RsvpAccessService } from '../admin/invitations/services/rsvp-access-service.js';
import { PublicRsvpAccessLoader } from '../rsvp/services/rsvp-access-loader.js';

const EVENT_ID = 'EVT-0001';
const GUEST_ID = 'INV-0001';
const UID = 'UID-PHASE53';
const CREATED_AT = new Date('2026-08-16T12:00:00.000Z');
const FUTURE = new Date('2030-01-01T00:00:00.000Z');

function fixedToken(character = 'A') {
    return character.repeat(43);
}

function guest(overrides = {}) {
    return {
        nombre: 'Andrea Téllez',
        pases: 4,
        correo: 'andrea@example.com',
        telefono: '+525512345678',
        mesa: 12,
        notas: 'Dato interno',
        qrToken: 'QR_PRIVATE_VALUE_1234567890',
        qrActivo: true,
        ...overrides
    };
}

function accessDocument(overrides = {}) {
    return buildRsvpAccessDocument({
        eventId: EVENT_ID,
        guestId: GUEST_ID,
        guest: guest(),
        active: true,
        expiresAt: null,
        ...overrides
    });
}

function createGateway({
    initialGuests = { [`${EVENT_ID}/${GUEST_ID}`]: guest() },
    initialAccess = {},
    failCreate = false,
    dropCreates = false,
    failRevoke = false
} = {}) {
    const guests = new Map(Object.entries(initialGuests));
    const access = new Map(Object.entries(initialAccess));
    const operations = [];
    const key = (eventId, token) => `${eventId}/${token}`;
    return {
        guests,
        access,
        operations,
        getCurrentUid: () => UID,
        async readGuest(eventId, guestId) {
            operations.push({ type: 'read-guest', eventId, guestId });
            return guests.get(`${eventId}/${guestId}`) ?? null;
        },
        async readAccess(eventId, token) {
            operations.push({ type: 'read-access', eventId, token });
            return access.get(key(eventId, token)) ?? null;
        },
        async createAccess(eventId, token, document) {
            operations.push({ type: 'create-access', eventId, token, document });
            if (failCreate) throw new Error('unavailable with unsafe details');
            if (access.has(key(eventId, token))) {
                const error = new Error('rsvp-access/token-conflict');
                error.code = 'rsvp-access/token-conflict';
                throw error;
            }
            if (!dropCreates) access.set(key(eventId, token), document);
        },
        async updateAccess(eventId, token, patch) {
            operations.push({ type: 'update-access', eventId, token, patch });
            if (failRevoke && patch.active === false) throw new Error('revoke failed with unsafe details');
            const current = access.get(key(eventId, token));
            if (!current) throw new Error('missing');
            access.set(key(eventId, token), { ...current, ...patch });
        },
        async findAccessByGuest(eventId, guestId) {
            operations.push({ type: 'find-access', eventId, guestId });
            return [...access.entries()]
                .filter(([entryKey, document]) => entryKey.startsWith(`${eventId}/`) && document.guestId === guestId)
                .map(([entryKey, document]) => ({ token: entryKey.slice(eventId.length + 1), document }));
        }
    };
}

test('1. el contrato fija 256 bits y supera el mínimo de 192', () => {
    assert.equal(RSVP_ACCESS_TOKEN_BYTES, 32);
    assert.equal(RSVP_ACCESS_TOKEN_BITS, 256);
    assert.ok(RSVP_ACCESS_TOKEN_BITS >= 192);
});

test('2. generate usa getRandomValues sobre exactamente 32 bytes', () => {
    let received = null;
    const token = generateRsvpAccessToken({
        cryptoApi: {
            getRandomValues(bytes) {
                received = bytes;
                bytes.fill(7);
                return bytes;
            }
        }
    });
    assert.equal(received instanceof Uint8Array, true);
    assert.equal(received.byteLength, 32);
    assert.equal(token.length, 43);
});

test('3. el token generado es base64url sin padding', () => {
    const token = generateRsvpAccessToken();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(token, /[+/=]/);
});

test('4. una muestra de tokens criptográficos no colisiona', () => {
    const tokens = new Set(Array.from({ length: 128 }, () => generateRsvpAccessToken()));
    assert.equal(tokens.size, 128);
});

test('5. los módulos RSVP Access no usan Math.random', async () => {
    const sources = await Promise.all([
        readFile(new URL('../shared/rsvp-access-contract.js', import.meta.url), 'utf8'),
        readFile(new URL('../admin/invitations/services/rsvp-access-service.js', import.meta.url), 'utf8'),
        readFile(new URL('../rsvp/services/rsvp-access-loader.js', import.meta.url), 'utf8')
    ]);
    sources.forEach((source) => assert.doesNotMatch(source, /Math\.random/));
});

test('6. tokens malformados se rechazan localmente', () => {
    for (const value of ['', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '=', 'A'.repeat(42) + '/']) {
        assert.equal(isValidRsvpAccessToken(value), false);
        assert.throws(() => assertRsvpAccessToken(value), /invalid-token/);
    }
});

test('7. ausencia de Web Crypto falla cerrado', () => {
    assert.throws(() => generateRsvpAccessToken({ cryptoApi: null }), /secure-random-unavailable/);
});

test('8. la proyección toma nombre y pases del contrato canónico real', () => {
    assert.deepEqual(projectGuestForRsvpAccess(guest(), { eventId: EVENT_ID, guestId: GUEST_ID }), {
        eventId: EVENT_ID,
        guestId: GUEST_ID,
        displayName: 'Andrea Téllez',
        passLimit: 4
    });
});

test('9. la proyección excluye datos administrativos y secretos del invitado', () => {
    const projection = projectGuestForRsvpAccess(guest(), { eventId: EVENT_ID, guestId: GUEST_ID });
    assert.deepEqual(Object.keys(projection).sort(), ['displayName', 'eventId', 'guestId', 'passLimit']);
    for (const field of ['correo', 'telefono', 'mesa', 'notas', 'qrToken', 'qrActivo']) {
        assert.equal(field in projection, false);
    }
});

test('10. passLimit exige enteros en el mismo rango 1–999 del invitado', () => {
    assert.equal(RSVP_ACCESS_PASS_LIMIT_MAX, 999);
    for (const pases of [0, 1.5, 1000, '4']) {
        assert.throws(() => projectGuestForRsvpAccess(guest({ pases }), { eventId: EVENT_ID, guestId: GUEST_ID }), /invalid-pass-limit/);
    }
});

test('11. el documento público raw tiene el esquema mínimo exacto y versionado', () => {
    assert.deepEqual(Object.keys(accessDocument()).sort(), [
        'active', 'displayName', 'eventId', 'expiresAt', 'guestId', 'passLimit', 'schemaVersion'
    ]);
    assert.equal(accessDocument().schemaVersion, 1);
});

test('12. el documento Access raw no contiene UIDs, auditoría ni datos sensibles del invitado', () => {
    const document = accessDocument();
    for (const field of [
        'createdAt', 'createdBy', 'updatedAt', 'updatedBy',
        'qrToken', 'correo', 'email', 'telefono', 'phone', 'mesa', 'notas',
        'direccion', 'checkin', 'pasesDisponibles', 'pasesConfirmados',
        'checkinSecuencia', 'qrActivo'
    ]) {
        assert.equal(field in document, false);
    }
});

test('13. deserialize rechaza campos desconocidos', () => {
    assert.throws(() => deserializeRsvpAccessDocument({ ...accessDocument(), extra: true }, { expectedEventId: EVENT_ID }), /invalid-document-shape/);
});

test('14. deserialize rechaza ownership cross-event y cross-guest', () => {
    assert.throws(() => deserializeRsvpAccessDocument(accessDocument(), { expectedEventId: 'EVT-0002' }), /event-ownership-mismatch/);
    assert.throws(() => deserializeRsvpAccessDocument(accessDocument(), { expectedEventId: EVENT_ID, expectedGuestId: 'INV-0002' }), /guest-ownership-mismatch/);
});

test('15. expiración nullable y comparación temporal son deterministas', () => {
    assert.equal(isRsvpAccessExpired(null, CREATED_AT), false);
    assert.equal(isRsvpAccessExpired(new Date('2026-08-16T12:00:01Z'), CREATED_AT), false);
    assert.equal(isRsvpAccessExpired(CREATED_AT, CREATED_AT), true);
});

test('16. buildRsvpUrl produce la ruta pública canónica', () => {
    const url = new URL(buildRsvpUrl(EVENT_ID, fixedToken('B')));
    assert.equal(url.origin, 'https://eventorastudio.com');
    assert.equal(url.pathname, '/rsvp/');
    assert.equal(url.searchParams.get('event'), EVENT_ID);
    assert.equal(url.searchParams.get('token'), fixedToken('B'));
});

test('17. buildRsvpUrl soporta una base estática de GitHub Pages', () => {
    const url = buildRsvpUrl(EVENT_ID, fixedToken('C'), { baseUrl: 'https://example.github.io/EventoraStudio/rsvp/' });
    assert.equal(new URL(url).pathname, '/EventoraStudio/rsvp/');
});

test('18. parseRsvpRoute acepta search y URL completa', () => {
    const search = `?event=${EVENT_ID}&token=${fixedToken('D')}`;
    assert.deepEqual(parseRsvpRoute(search), { valid: true, eventId: EVENT_ID, token: fixedToken('D'), code: null });
    assert.equal(parseRsvpRoute(`https://eventorastudio.com/rsvp/${search}`).valid, true);
});

test('19. parseRsvpRoute rechaza campos faltantes, duplicados o malformados', () => {
    for (const route of [
        '',
        `?event=${EVENT_ID}`,
        `?token=${fixedToken('E')}`,
        `?event=${EVENT_ID}&event=EVT-2&token=${fixedToken('E')}`,
        `?event=../EVT&token=${fixedToken('E')}`,
        `?event=${EVENT_ID}&token=short`
    ]) {
        assert.deepEqual(parseRsvpRoute(route), { valid: false, eventId: null, token: null, code: 'rsvp-access/invalid-route' });
    }
});

test('20. creación persiste sólo la proyección Access y deja intacto al invitado', async () => {
    const sourceGuest = guest();
    const gateway = createGateway({ initialGuests: { [`${EVENT_ID}/${GUEST_ID}`]: sourceGuest } });
    const service = new RsvpAccessService({ gateway, tokenFactory: () => fixedToken('F') });
    const result = await service.create({ eventId: EVENT_ID, guestId: GUEST_ID });
    assert.equal(result.token, fixedToken('F'));
    assert.equal(gateway.operations.filter((item) => item.type === 'create-access').length, 1);
    assert.equal('rsvpToken' in sourceGuest, false);
    assert.equal(sourceGuest.qrToken, 'QR_PRIVATE_VALUE_1234567890');
    assert.equal('qrToken' in result.access, false);
});

test('21. token RSVP y qrToken son dominios criptográficos independientes', async () => {
    const rsvpToken = generateRsvpAccessToken();
    const qrToken = generateGuestQrToken();
    assert.notEqual(rsvpToken, qrToken);
    assert.equal(buildQrPayload({ qrToken }), qrToken);
});

test('22. una colisión de ID reintenta sin sobrescribir', async () => {
    const occupied = fixedToken('G');
    const replacement = fixedToken('H');
    const gateway = createGateway({ initialAccess: { [`${EVENT_ID}/${occupied}`]: accessDocument() } });
    const queue = [occupied, replacement];
    const service = new RsvpAccessService({ gateway, tokenFactory: () => queue.shift() });
    const result = await service.create({ eventId: EVENT_ID, guestId: GUEST_ID });
    assert.equal(result.token, replacement);
    assert.deepEqual(gateway.access.get(`${EVENT_ID}/${occupied}`), accessDocument());
});

test('23. creación verifica la escritura antes de devolver la URL', async () => {
    const gateway = createGateway({ dropCreates: true });
    const service = new RsvpAccessService({ gateway, tokenFactory: () => fixedToken('I') });
    await assert.rejects(service.create({ eventId: EVENT_ID, guestId: GUEST_ID }), /verification-failed/);
});

test('24. invitado inexistente no crea proyección', async () => {
    const gateway = createGateway({ initialGuests: {} });
    const service = new RsvpAccessService({ gateway, tokenFactory: () => fixedToken('J') });
    await assert.rejects(service.create({ eventId: EVENT_ID, guestId: GUEST_ID }), /guest-not-found/);
    assert.equal(gateway.operations.some((item) => item.type === 'create-access'), false);
});

test('25. lectura interna rechaza un documento de otro evento', async () => {
    const token = fixedToken('K');
    const document = accessDocument({ eventId: 'EVT-0002' });
    const gateway = createGateway({ initialAccess: { [`${EVENT_ID}/${token}`]: document } });
    await assert.rejects(new RsvpAccessService({ gateway }).readInternal(EVENT_ID, token), /event-ownership-mismatch/);
});

test('26. rotación ejecuta crear, verificar y sólo entonces revocar', async () => {
    const oldToken = fixedToken('L');
    const newToken = fixedToken('M');
    const gateway = createGateway({ initialAccess: { [`${EVENT_ID}/${oldToken}`]: accessDocument() } });
    const service = new RsvpAccessService({ gateway, tokenFactory: () => newToken });
    const result = await service.rotate({ eventId: EVENT_ID, guestId: GUEST_ID, currentToken: oldToken });
    const createIndex = gateway.operations.findIndex((item) => item.type === 'create-access' && item.token === newToken);
    const verifyIndex = gateway.operations.findIndex((item, index) => index > createIndex && item.type === 'read-access' && item.token === newToken);
    const revokeIndex = gateway.operations.findIndex((item) => item.type === 'update-access' && item.token === oldToken && item.patch.active === false);
    assert.ok(createIndex >= 0 && verifyIndex > createIndex && revokeIndex > verifyIndex);
    assert.equal(result.previousRevoked, true);
    assert.equal(gateway.access.get(`${EVENT_ID}/${oldToken}`).active, false);
    assert.equal(gateway.access.get(`${EVENT_ID}/${newToken}`).active, true);
});

test('27. fallo al crear reemplazo conserva activo el acceso anterior', async () => {
    const oldToken = fixedToken('N');
    const gateway = createGateway({ initialAccess: { [`${EVENT_ID}/${oldToken}`]: accessDocument() }, failCreate: true });
    const service = new RsvpAccessService({ gateway, tokenFactory: () => fixedToken('O') });
    await assert.rejects(service.rotate({ eventId: EVENT_ID, guestId: GUEST_ID, currentToken: oldToken }), /create-failed/);
    assert.equal(gateway.access.get(`${EVENT_ID}/${oldToken}`).active, true);
    assert.equal(gateway.operations.some((item) => item.type === 'update-access'), false);
});

test('28. fallo de verificación conserva activo el acceso anterior', async () => {
    const oldToken = fixedToken('P');
    const gateway = createGateway({ initialAccess: { [`${EVENT_ID}/${oldToken}`]: accessDocument() }, dropCreates: true });
    const service = new RsvpAccessService({ gateway, tokenFactory: () => fixedToken('Q') });
    await assert.rejects(service.rotate({ eventId: EVENT_ID, guestId: GUEST_ID, currentToken: oldToken }), /verification-failed/);
    assert.equal(gateway.access.get(`${EVENT_ID}/${oldToken}`).active, true);
});

test('29. fallo al revocar nunca deja al invitado sin acceso', async () => {
    const oldToken = fixedToken('R');
    const newToken = fixedToken('S');
    const gateway = createGateway({ initialAccess: { [`${EVENT_ID}/${oldToken}`]: accessDocument() }, failRevoke: true });
    const service = new RsvpAccessService({ gateway, tokenFactory: () => newToken });
    await assert.rejects(service.rotate({ eventId: EVENT_ID, guestId: GUEST_ID, currentToken: oldToken }), /rotation-revoke-failed/);
    assert.equal(gateway.access.get(`${EVENT_ID}/${oldToken}`).active, true);
    assert.equal(gateway.access.get(`${EVENT_ID}/${newToken}`).active, true);
});

test('30. revoke usa active:false y nunca delete', async () => {
    const token = fixedToken('T');
    const gateway = createGateway({ initialAccess: { [`${EVENT_ID}/${token}`]: accessDocument() } });
    const result = await new RsvpAccessService({ gateway }).revoke({ eventId: EVENT_ID, token });
    assert.equal(result.changed, true);
    assert.equal(result.access.active, false);
    assert.equal(gateway.operations.some((item) => item.type === 'delete-access'), false);
});

test('31. sync actualiza nombre y pases preservando identidad, estado y expiración', async () => {
    const token = fixedToken('U');
    const original = accessDocument({ expiresAt: FUTURE });
    const gateway = createGateway({
        initialGuests: { [`${EVENT_ID}/${GUEST_ID}`]: guest({ nombre: 'Nombre nuevo', pases: 7 }) },
        initialAccess: { [`${EVENT_ID}/${token}`]: original }
    });
    const synced = await new RsvpAccessService({ gateway }).sync({ eventId: EVENT_ID, token });
    assert.equal(synced.displayName, 'Nombre nuevo');
    assert.equal(synced.passLimit, 7);
    assert.equal(synced.guestId, GUEST_ID);
    assert.equal(synced.active, true);
    assert.equal(synced.expiresAt, FUTURE);
    assert.deepEqual(Object.keys(synced).sort(), [
        'active', 'displayName', 'eventId', 'expiresAt', 'guestId', 'passLimit', 'schemaVersion'
    ]);
});

test('32. syncGuest localiza internamente por guestId sin listener permanente', async () => {
    const first = fixedToken('V');
    const second = fixedToken('W');
    const gateway = createGateway({ initialAccess: {
        [`${EVENT_ID}/${first}`]: accessDocument(),
        [`${EVENT_ID}/${second}`]: accessDocument({ active: false })
    } });
    const synced = await new RsvpAccessService({ gateway }).syncGuest({ eventId: EVENT_ID, guestId: GUEST_ID });
    assert.equal(synced.length, 2);
    assert.equal(gateway.operations.filter((item) => item.type === 'find-access').length, 1);
    assert.equal(gateway.operations.some((item) => item.type === 'subscribe-access'), false);
});

test('33. loader público hace un único get exacto y devuelve sólo el mínimo público', async () => {
    const calls = [];
    const loader = new PublicRsvpAccessLoader({ gateway: {
        async readPublicAccess(eventId, token) {
            calls.push({ eventId, token });
            return accessDocument({ expiresAt: FUTURE });
        }
    }, now: () => CREATED_AT });
    const result = await loader.loadRoute(`?event=${EVENT_ID}&token=${fixedToken('X')}`);
    assert.equal(result.status, 'ready');
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(result.access).sort(), ['active', 'displayName', 'eventId', 'expiresAt', 'guestId', 'passLimit', 'schemaVersion']);
    assert.equal('token' in result.access, false);
});

test('34. ruta inválida no inicializa Firebase ni realiza lectura', async () => {
    let factoryCalls = 0;
    const loader = new PublicRsvpAccessLoader({ gatewayFactory: async () => {
        factoryCalls += 1;
        return { readPublicAccess: async () => accessDocument() };
    } });
    const result = await loader.loadRoute('?event=bad/id&token=short');
    assert.equal(result.status, 'unavailable');
    assert.equal(factoryCalls, 0);
});

test('35. loader público no importa primitivas de query o list', async () => {
    const source = await readFile(new URL('../rsvp/services/rsvp-access-loader.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(?:collection|getDocs|query|where|onSnapshot)\b/);
    assert.match(source, /firestoreApi\.getDoc\(/);
});

test('36. revocado, expirado y documento ausente producen el mismo estado público', async () => {
    for (const document of [
        accessDocument({ active: false }),
        accessDocument({ expiresAt: new Date('2020-01-01T00:00:00Z') }),
        null
    ]) {
        const loader = new PublicRsvpAccessLoader({ gateway: { readPublicAccess: async () => document }, now: () => CREATED_AT });
        const result = await loader.loadRoute(`?event=${EVENT_ID}&token=${fixedToken('Y')}`);
        assert.deepEqual(result, { status: 'unavailable', access: null, code: 'rsvp-access/unavailable' });
    }
});

test('37. los errores públicos no reflejan el secreto ni la causa de Firebase', async () => {
    const secret = fixedToken('Z');
    const loader = new PublicRsvpAccessLoader({ gateway: {
        readPublicAccess: async () => { throw new Error(`permission denied at ${secret}`); }
    } });
    await assert.rejects(loader.load(EVENT_ID, secret), (error) => {
        assert.equal(error.code, 'rsvp-access/unavailable');
        assert.doesNotMatch(`${error.message}${error.stack}`, new RegExp(secret));
        return true;
    });
});

test('38. la página pública usa textContent y no persiste ni imprime secretos', async () => {
    const [script, html] = await Promise.all([
        readFile(new URL('../rsvp/rsvp.js', import.meta.url), 'utf8'),
        readFile(new URL('../rsvp/index.html', import.meta.url), 'utf8')
    ]);
    assert.match(script, /guestName\.textContent/);
    assert.doesNotMatch(script, /innerHTML|localStorage|sessionStorage|document\.cookie|console\.|dataset\./);
    assert.doesNotMatch(html, /data-token|name=["']token|value=["'][A-Za-z0-9_-]{43}/);
});

test('39. Access no importa generadores QR ni usa qrToken', async () => {
    const sources = await Promise.all([
        readFile(new URL('../shared/rsvp-access-contract.js', import.meta.url), 'utf8'),
        readFile(new URL('../admin/invitations/services/rsvp-access-service.js', import.meta.url), 'utf8'),
        readFile(new URL('../rsvp/services/rsvp-access-loader.js', import.meta.url), 'utf8')
    ]);
    sources.forEach((source) => {
        assert.doesNotMatch(source, /qrToken|qr-renderer|qr-code|qrcode-generator|guest-contract/);
    });
});

test('40. QR Manager y su payload no dependen de RSVP Access', async () => {
    const [manager, payload] = await Promise.all([
        readFile(new URL('../admin/modules/qr/qr-manager.js', import.meta.url), 'utf8'),
        readFile(new URL('../shared/qr-code.js', import.meta.url), 'utf8')
    ]);
    assert.doesNotMatch(manager, /rsvpAccess|rsvp-access/);
    assert.doesNotMatch(payload, /rsvpAccess|rsvp-access/);
    const qrToken = generateGuestQrToken();
    assert.equal(buildQrPayload({ qrToken }), qrToken);
});
