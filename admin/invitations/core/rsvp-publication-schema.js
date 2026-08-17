import {
    assertRsvpAccessEventId,
    assertRsvpConfigKey
} from '../../../shared/rsvp-access-contract.js?v=phase54-public-rsvp-20260817';
import {
    serializePublicRsvpConfig
} from '../../../rsvp/core/rsvp-public-config-contract.js?v=phase54-public-rsvp-20260817';
import { deserializeRsvpConfig } from './rsvp-persistence-schema.js?v=phase54-public-rsvp-20260817';

export const RSVP_PUBLICATION_DOCUMENT_ID = 'rsvpPublication';
export const RSVP_PUBLICATION_SCHEMA_VERSION = 1;

const PUBLICATION_FIELDS = Object.freeze([
    'configKey',
    'createdAt',
    'createdBy',
    'eventId',
    'schemaVersion',
    'updatedAt',
    'updatedBy'
]);
const SAFE_UID = /^.{1,128}$/;

export class RsvpPublicationContractError extends Error {
    constructor(code) {
        super(code);
        this.name = 'RsvpPublicationContractError';
        this.code = code;
    }
}

export function serializeRsvpPublicationMetadata({
    eventId,
    configKey,
    createdAt,
    createdBy,
    updatedAt,
    updatedBy
} = {}) {
    const safeEventId = assertRsvpAccessEventId(eventId);
    const safeConfigKey = assertRsvpConfigKey(configKey);
    if (createdAt == null || updatedAt == null) {
        throw new RsvpPublicationContractError('rsvp-publication/timestamps-required');
    }
    const safeCreatedBy = assertUid(createdBy, 'rsvp-publication/created-by-required');
    const safeUpdatedBy = assertUid(updatedBy, 'rsvp-publication/updated-by-required');
    return {
        schemaVersion: RSVP_PUBLICATION_SCHEMA_VERSION,
        eventId: safeEventId,
        configKey: safeConfigKey,
        createdAt,
        createdBy: safeCreatedBy,
        updatedAt,
        updatedBy: safeUpdatedBy
    };
}

export function deserializeRsvpPublicationMetadata(document, { expectedEventId } = {}) {
    if (!hasExactKeys(document, PUBLICATION_FIELDS)) {
        throw new RsvpPublicationContractError('rsvp-publication/invalid-document-shape');
    }
    if (document.schemaVersion !== RSVP_PUBLICATION_SCHEMA_VERSION) {
        throw new RsvpPublicationContractError('rsvp-publication/unsupported-schema');
    }
    const metadata = serializeRsvpPublicationMetadata(document);
    if (expectedEventId != null && metadata.eventId !== assertRsvpAccessEventId(expectedEventId)) {
        throw new RsvpPublicationContractError('rsvp-publication/event-ownership-mismatch');
    }
    assertTimestamp(metadata.createdAt, 'rsvp-publication/invalid-created-at');
    assertTimestamp(metadata.updatedAt, 'rsvp-publication/invalid-updated-at');
    return Object.freeze(metadata);
}

export function createPublicRsvpProjection(privateDocument, { expectedEventId } = {}) {
    const persisted = deserializeRsvpConfig(privateDocument, expectedEventId);
    return serializePublicRsvpConfig({
        eventId: persisted.eventId,
        enabled: persisted.rsvp.enabled,
        title: persisted.rsvp.title,
        message: persisted.rsvp.message,
        buttonLabel: persisted.rsvp.buttonLabel,
        method: persisted.rsvp.method,
        guestPolicy: persisted.rsvp.guestPolicy,
        responses: persisted.rsvp.responses,
        whatsapp: persisted.rsvp.method === 'whatsapp'
            ? persisted.rsvp.whatsapp
            : { phone: '', message: '' },
        deadlineTimeZone: persisted.rsvp.deadlineTimeZone,
        responseClosesAt: persisted.responseClosesAt
    }, { expectedEventId: persisted.eventId });
}

function assertUid(value, code) {
    const uid = String(value ?? '');
    if (!SAFE_UID.test(uid)) throw new RsvpPublicationContractError(code);
    return uid;
}

function assertTimestamp(value, code) {
    if (!value || typeof value.toDate !== 'function') throw new RsvpPublicationContractError(code);
    try {
        const date = value.toDate();
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error(code);
    } catch {
        throw new RsvpPublicationContractError(code);
    }
}

function hasExactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && expected.every((field, index) => field === keys[index]);
}
