export const RSVP_ACCESS_SCHEMA_VERSION = 2;
export const RSVP_ACCESS_TOKEN_BYTES = 32;
export const RSVP_ACCESS_TOKEN_BITS = RSVP_ACCESS_TOKEN_BYTES * 8;
export const RSVP_ACCESS_TOKEN_LENGTH = 43;
export const RSVP_CONFIG_KEY_BYTES = 32;
export const RSVP_CONFIG_KEY_BITS = RSVP_CONFIG_KEY_BYTES * 8;
export const RSVP_CONFIG_KEY_LENGTH = 43;
export const RSVP_ACCESS_DEFAULT_URL = 'https://eventorastudio.com/rsvp/';
export const RSVP_ACCESS_PASS_LIMIT_MAX = 999;

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,150}$/;
const GUEST_ID_PATTERN = /^[^/]{1,1500}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ACCESS_DOCUMENT_FIELDS = Object.freeze([
    'active',
    'configKey',
    'displayName',
    'eventId',
    'expiresAt',
    'guestId',
    'passLimit',
    'schemaVersion'
]);

export class RsvpAccessContractError extends Error {
    constructor(code) {
        super(code);
        this.name = 'RsvpAccessContractError';
        this.code = code;
    }
}

export function assertRsvpAccessEventId(value) {
    const eventId = String(value ?? '').trim();
    if (!EVENT_ID_PATTERN.test(eventId)) throw new RsvpAccessContractError('rsvp-access/invalid-event-id');
    return eventId;
}

export function assertRsvpAccessGuestId(value) {
    const guestId = String(value ?? '').trim();
    if (!GUEST_ID_PATTERN.test(guestId)) throw new RsvpAccessContractError('rsvp-access/invalid-guest-id');
    return guestId;
}

export function isValidRsvpAccessToken(value) {
    return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

export function assertRsvpAccessToken(value) {
    if (!isValidRsvpAccessToken(value)) throw new RsvpAccessContractError('rsvp-access/invalid-token');
    return value;
}

export function generateRsvpAccessToken({ cryptoApi = globalThis.crypto } = {}) {
    return generateCapability(RSVP_ACCESS_TOKEN_BYTES, cryptoApi);
}

export function isValidRsvpConfigKey(value) {
    return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

export function assertRsvpConfigKey(value) {
    if (!isValidRsvpConfigKey(value)) throw new RsvpAccessContractError('rsvp-access/invalid-config-key');
    return value;
}

export function generateRsvpConfigKey({ cryptoApi = globalThis.crypto } = {}) {
    return generateCapability(RSVP_CONFIG_KEY_BYTES, cryptoApi);
}

function generateCapability(byteLength, cryptoApi) {
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
        throw new RsvpAccessContractError('rsvp-access/secure-random-unavailable');
    }
    const bytes = new Uint8Array(byteLength);
    cryptoApi.getRandomValues(bytes);
    return encodeBase64Url(bytes);
}

export function projectGuestForRsvpAccess(guest, { eventId, guestId } = {}) {
    const source = isRecord(guest) ? guest : {};
    const displayName = normalizeText(source.nombre);
    const passLimit = source.pases;
    if (!displayName || displayName.length > 160) {
        throw new RsvpAccessContractError('rsvp-access/invalid-display-name');
    }
    if (!Number.isInteger(passLimit) || passLimit < 1 || passLimit > RSVP_ACCESS_PASS_LIMIT_MAX) {
        throw new RsvpAccessContractError('rsvp-access/invalid-pass-limit');
    }
    return Object.freeze({
        eventId: assertRsvpAccessEventId(eventId),
        guestId: assertRsvpAccessGuestId(guestId),
        displayName,
        passLimit
    });
}

export function buildRsvpAccessDocument({
    eventId,
    guestId,
    guest,
    configKey,
    active = true,
    expiresAt = null
} = {}) {
    const projection = projectGuestForRsvpAccess(guest, { eventId, guestId });
    if (typeof active !== 'boolean') throw new RsvpAccessContractError('rsvp-access/invalid-active');
    assertOptionalTimestamp(expiresAt, 'rsvp-access/invalid-expiration');
    return {
        schemaVersion: RSVP_ACCESS_SCHEMA_VERSION,
        eventId: projection.eventId,
        guestId: projection.guestId,
        configKey: assertRsvpConfigKey(configKey),
        displayName: projection.displayName,
        passLimit: projection.passLimit,
        active,
        expiresAt
    };
}

export function deserializeRsvpAccessDocument(document, {
    expectedEventId,
    expectedGuestId = null
} = {}) {
    if (!hasExactKeys(document, ACCESS_DOCUMENT_FIELDS)) {
        throw new RsvpAccessContractError('rsvp-access/invalid-document-shape');
    }
    if (document.schemaVersion !== RSVP_ACCESS_SCHEMA_VERSION) {
        throw new RsvpAccessContractError('rsvp-access/unsupported-schema');
    }
    const eventId = assertRsvpAccessEventId(document.eventId);
    if (expectedEventId != null && eventId !== assertRsvpAccessEventId(expectedEventId)) {
        throw new RsvpAccessContractError('rsvp-access/event-ownership-mismatch');
    }
    const guestId = assertRsvpAccessGuestId(document.guestId);
    if (expectedGuestId != null && guestId !== assertRsvpAccessGuestId(expectedGuestId)) {
        throw new RsvpAccessContractError('rsvp-access/guest-ownership-mismatch');
    }
    const projection = projectGuestForRsvpAccess(
        { nombre: document.displayName, pases: document.passLimit },
        { eventId, guestId }
    );
    const configKey = assertRsvpConfigKey(document.configKey);
    if (typeof document.active !== 'boolean') throw new RsvpAccessContractError('rsvp-access/invalid-active');
    assertOptionalTimestamp(document.expiresAt, 'rsvp-access/invalid-expiration');
    return Object.freeze({
        schemaVersion: RSVP_ACCESS_SCHEMA_VERSION,
        ...projection,
        configKey,
        active: document.active,
        expiresAt: document.expiresAt
    });
}

export function toPublicRsvpAccess(document, { expectedEventId } = {}) {
    const access = deserializeRsvpAccessDocument(document, { expectedEventId });
    return Object.freeze({
        schemaVersion: access.schemaVersion,
        eventId: access.eventId,
        guestId: access.guestId,
        configKey: access.configKey,
        displayName: access.displayName,
        passLimit: access.passLimit,
        active: access.active,
        expiresAt: access.expiresAt
    });
}

export function isRsvpAccessExpired(expiresAt, now = new Date()) {
    if (expiresAt == null) return false;
    const expiresAtDate = toDate(expiresAt);
    const nowDate = toDate(now);
    if (!expiresAtDate || !nowDate) throw new RsvpAccessContractError('rsvp-access/invalid-expiration');
    return nowDate.getTime() >= expiresAtDate.getTime();
}

export function buildRsvpUrl(eventId, token, { baseUrl = RSVP_ACCESS_DEFAULT_URL } = {}) {
    const safeEventId = assertRsvpAccessEventId(eventId);
    const safeToken = assertRsvpAccessToken(token);
    let url;
    try {
        url = new URL(baseUrl);
    } catch {
        throw new RsvpAccessContractError('rsvp-access/invalid-base-url');
    }
    if (!['https:', 'http:'].includes(url.protocol)) {
        throw new RsvpAccessContractError('rsvp-access/invalid-base-url');
    }
    url.hash = '';
    url.search = '';
    url.searchParams.set('event', safeEventId);
    url.searchParams.set('token', safeToken);
    return url.toString();
}

export function parseRsvpRoute(input = '') {
    let params;
    try {
        params = readRouteParams(input);
    } catch {
        return invalidRoute();
    }
    const eventValues = params.getAll('event');
    const tokenValues = params.getAll('token');
    if (eventValues.length !== 1 || tokenValues.length !== 1) return invalidRoute();
    try {
        return Object.freeze({
            valid: true,
            eventId: assertRsvpAccessEventId(eventValues[0]),
            token: assertRsvpAccessToken(tokenValues[0]),
            code: null
        });
    } catch {
        return invalidRoute();
    }
}

function encodeBase64Url(bytes) {
    let result = '';
    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index];
        const hasSecond = index + 1 < bytes.length;
        const hasThird = index + 2 < bytes.length;
        const second = hasSecond ? bytes[index + 1] : 0;
        const third = hasThird ? bytes[index + 2] : 0;
        const value = (first << 16) | (second << 8) | third;
        result += BASE64URL_ALPHABET[(value >>> 18) & 63];
        result += BASE64URL_ALPHABET[(value >>> 12) & 63];
        if (hasSecond) result += BASE64URL_ALPHABET[(value >>> 6) & 63];
        if (hasThird) result += BASE64URL_ALPHABET[value & 63];
    }
    return result;
}

function invalidRoute() {
    return Object.freeze({
        valid: false,
        eventId: null,
        token: null,
        code: 'rsvp-access/invalid-route'
    });
}

function readRouteParams(input) {
    if (input instanceof URL) return input.searchParams;
    const value = String(input ?? '');
    if (/^https?:\/\//i.test(value)) return new URL(value).searchParams;
    return new URLSearchParams(value.startsWith('?') ? value.slice(1) : value);
}

function assertOptionalTimestamp(value, code) {
    if (value != null && !toDate(value)) {
        throw new RsvpAccessContractError(code);
    }
}

function toDate(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (value && typeof value.toDate === 'function') {
        try {
            const date = value.toDate();
            return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
        } catch {
            return null;
        }
    }
    return null;
}

function hasExactKeys(value, expected) {
    if (!isRecord(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && expected.every((field, index) => field === keys[index]);
}

function isRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}
