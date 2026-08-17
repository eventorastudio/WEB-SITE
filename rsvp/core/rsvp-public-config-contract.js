import { assertRsvpAccessEventId } from '../../shared/rsvp-access-contract.js?v=phase54-public-rsvp-20260817';
import { normalizeWhatsAppPhone } from '../../admin/invitations/core/safe-url.js?v=phase54-public-rsvp-20260817';
import { isValidIanaTimeZone } from '../../admin/invitations/core/rsvp-time.js?v=phase54-public-rsvp-20260817';

export const RSVP_PUBLIC_CONFIG_SCHEMA_VERSION = 1;

const PUBLIC_CONFIG_FIELDS = Object.freeze([
    'buttonLabel',
    'deadlineTimeZone',
    'enabled',
    'eventId',
    'guestPolicy',
    'message',
    'method',
    'responseClosesAt',
    'responses',
    'schemaVersion',
    'title',
    'whatsapp'
]);
const RESPONSE_FIELDS = Object.freeze(['acceptedLabel', 'confirmationMessage', 'declinedLabel']);
const WHATSAPP_FIELDS = Object.freeze(['message', 'phone']);
const METHODS = Object.freeze(['internal', 'whatsapp']);
const GUEST_POLICIES = Object.freeze(['assigned-only', 'select-up-to-assigned']);

export class RsvpPublicConfigContractError extends Error {
    constructor(code) {
        super(code);
        this.name = 'RsvpPublicConfigContractError';
        this.code = code;
    }
}

export function serializePublicRsvpConfig(source = {}, { expectedEventId } = {}) {
    const eventId = assertExpectedEventId(source.eventId, expectedEventId);
    assertBoolean(source.enabled, 'rsvp-public/invalid-enabled');
    const title = assertText(source.title, 120, 'rsvp-public/invalid-title');
    const message = assertText(source.message, 500, 'rsvp-public/invalid-message');
    const buttonLabel = assertText(source.buttonLabel, 80, 'rsvp-public/invalid-button-label');
    const method = assertEnum(source.method, METHODS, 'rsvp-public/invalid-method');
    const guestPolicy = assertEnum(source.guestPolicy, GUEST_POLICIES, 'rsvp-public/invalid-guest-policy');
    const responses = assertResponses(source.responses);
    const whatsapp = assertWhatsapp(source.whatsapp, method);
    const responseClosesAt = assertOptionalTimestamp(source.responseClosesAt);
    const deadlineTimeZone = assertDeadlineTimeZone(source.deadlineTimeZone, responseClosesAt);
    return {
        schemaVersion: RSVP_PUBLIC_CONFIG_SCHEMA_VERSION,
        eventId,
        enabled: source.enabled,
        title,
        message,
        buttonLabel,
        method,
        guestPolicy,
        responses,
        whatsapp,
        deadlineTimeZone,
        responseClosesAt
    };
}

export function deserializePublicRsvpConfig(document, { expectedEventId } = {}) {
    if (!hasExactKeys(document, PUBLIC_CONFIG_FIELDS)) {
        throw new RsvpPublicConfigContractError('rsvp-public/invalid-document-shape');
    }
    if (document.schemaVersion !== RSVP_PUBLIC_CONFIG_SCHEMA_VERSION) {
        throw new RsvpPublicConfigContractError('rsvp-public/unsupported-schema');
    }
    return Object.freeze(serializePublicRsvpConfig(document, { expectedEventId }));
}

export function isPublicRsvpClosed(config, now = new Date()) {
    const closesAt = config?.responseClosesAt;
    if (closesAt == null) return false;
    const closesAtDate = timestampToDate(closesAt);
    const nowDate = timestampToDate(now);
    if (!closesAtDate || !nowDate) {
        throw new RsvpPublicConfigContractError('rsvp-public/invalid-response-closes-at');
    }
    return nowDate.getTime() >= closesAtDate.getTime();
}

export function timestampToDate(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
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

function assertExpectedEventId(value, expectedEventId) {
    const eventId = assertRsvpAccessEventId(value);
    if (expectedEventId != null && eventId !== assertRsvpAccessEventId(expectedEventId)) {
        throw new RsvpPublicConfigContractError('rsvp-public/event-ownership-mismatch');
    }
    return eventId;
}

function assertDeadlineTimeZone(value, responseClosesAt) {
    const zone = assertText(value, 100, 'rsvp-public/invalid-time-zone');
    if (responseClosesAt == null) {
        if (zone !== '') throw new RsvpPublicConfigContractError('rsvp-public/unexpected-time-zone');
        return zone;
    }
    if (!isValidIanaTimeZone(zone)) throw new RsvpPublicConfigContractError('rsvp-public/invalid-time-zone');
    return zone;
}

function assertResponses(value) {
    if (!hasExactKeys(value, RESPONSE_FIELDS)) {
        throw new RsvpPublicConfigContractError('rsvp-public/invalid-responses');
    }
    return {
        acceptedLabel: assertText(value.acceptedLabel, 120, 'rsvp-public/invalid-accepted-label'),
        declinedLabel: assertText(value.declinedLabel, 120, 'rsvp-public/invalid-declined-label'),
        confirmationMessage: assertText(value.confirmationMessage, 500, 'rsvp-public/invalid-confirmation-message')
    };
}

function assertWhatsapp(value, method) {
    if (!hasExactKeys(value, WHATSAPP_FIELDS)) {
        throw new RsvpPublicConfigContractError('rsvp-public/invalid-whatsapp');
    }
    const phone = assertText(value.phone, 32, 'rsvp-public/invalid-whatsapp-phone');
    const message = assertText(value.message, 1000, 'rsvp-public/invalid-whatsapp-message');
    if (method === 'whatsapp' && !normalizeWhatsAppPhone(phone)) {
        throw new RsvpPublicConfigContractError('rsvp-public/invalid-whatsapp-phone');
    }
    return { phone, message };
}

function assertOptionalTimestamp(value) {
    if (value === null) return null;
    if (!timestampToDate(value)) {
        throw new RsvpPublicConfigContractError('rsvp-public/invalid-response-closes-at');
    }
    return value;
}

function assertText(value, maxLength, code) {
    if (typeof value !== 'string' || value.length > maxLength) {
        throw new RsvpPublicConfigContractError(code);
    }
    return value;
}

function assertBoolean(value, code) {
    if (typeof value !== 'boolean') throw new RsvpPublicConfigContractError(code);
}

function assertEnum(value, allowed, code) {
    if (!allowed.includes(value)) throw new RsvpPublicConfigContractError(code);
    return value;
}

function hasExactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && expected.every((field, index) => field === keys[index]);
}
