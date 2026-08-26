import { cloneInvitationValue } from './content-schema.js?v=phase61-draft-persistence-20260817';
import {
    assertInvitationPublicKey,
    createInvitationRevisionId,
    deserializeInvitationRevision
} from './invitation-publication-schema.js?v=phase171-demo-mode-20260826';

export const INVITATION_PUBLIC_PROJECTION_SCHEMA_VERSION = 1;
export const INVITATION_PUBLIC_COLLECTION_ID = 'invitacionPublic';

export const PRIVATE_PUBLIC_SECTION_IDS = Object.freeze([
    // Pass selection is an invite-specific control and is not part of the
    // generic public invitation. RSVP is public-safe; access-preview is kept
    // in the projection so the runtime can reveal it only for a valid token.
    'pass-selection'
]);

const PUBLIC_FIELDS = Object.freeze([
    'schemaVersion',
    'contentSchemaVersion',
    'eventId',
    'publicKey',
    'revisionId',
    'revisionNumber',
    'theme',
    'sections',
    'content',
    'locations',
    'itinerary',
    'gifts',
    'accommodations',
    'links',
    'appearance',
    'settings',
    'media'
]);
const SNAPSHOT_FIELDS = Object.freeze([
    'theme',
    'sections',
    'content',
    'locations',
    'itinerary',
    'gifts',
    'accommodations',
    'links',
    'appearance',
    'settings'
]);
const MEDIA_ROLES = Object.freeze(['cover', 'gallery', 'place', 'dressCode', 'video', 'videoPoster', 'music']);
const MEDIA_FIELDS = Object.freeze(['schemaVersion', 'touchedRoles', ...MEDIA_ROLES]);
const LEGACY_MEDIA_FIELDS = Object.freeze(['schemaVersion', 'touchedRoles', 'cover', 'gallery', 'video', 'videoPoster', 'music']);
const MEDIA_ASSET_FIELDS = Object.freeze([
    'id',
    'role',
    'kind',
    'mimeType',
    'downloadUrl',
    'alt',
    'caption',
    'focalPoint',
    'sortOrder'
]);
const ROLE_KIND = Object.freeze({
    cover: 'image',
    gallery: 'image',
    place: 'image',
    dressCode: 'image',
    video: 'video',
    videoPoster: 'image',
    music: 'audio'
});
const SAFE_MEDIA_ID = /^MED-LOCAL-[0-9]{3,}$/;

function fail(code, details = {}) {
    const error = new TypeError(code);
    error.code = code;
    Object.assign(error, details);
    throw error;
}

function exactKeys(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length === fields.length && keys.every((key) => fields.includes(key));
}

function cleanText(value, maxLength) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function safeDownloadUrl(value) {
    const candidate = cleanText(value, 2000);
    if (!candidate) return '';
    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function finiteFocalPoint(value = {}) {
    const x = Number(value.x);
    const y = Number(value.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) fail('publication/invalid-public-media-focal-point');
    return {
        x: Math.min(100, Math.max(0, x)),
        y: Math.min(100, Math.max(0, y))
    };
}

function sanitizeMediaAsset(asset, role, sortOrder = 0) {
    if (!asset) return null;
    const downloadUrl = safeDownloadUrl(asset.downloadUrl);
    if (!downloadUrl) return null;
    const id = String(asset.id ?? '');
    if (!SAFE_MEDIA_ID.test(id) || asset.role !== role || asset.kind !== ROLE_KIND[role]) {
        fail('publication/invalid-public-media-asset', { role, id });
    }
    return {
        id,
        role,
        kind: ROLE_KIND[role],
        mimeType: cleanText(asset.mimeType, 80).toLowerCase(),
        downloadUrl,
        alt: cleanText(asset.alt, 220),
        caption: cleanText(asset.caption, 360),
        focalPoint: finiteFocalPoint(asset.focalPoint),
        sortOrder: Math.max(0, Math.trunc(Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0))
    };
}

function assertCanonicalMediaAsset(asset, role, sortOrder = 0) {
    if (asset == null) return null;
    if (!exactKeys(asset, MEDIA_ASSET_FIELDS)) fail('publication/invalid-public-media-shape');
    const normalized = sanitizeMediaAsset(asset, role, sortOrder);
    if (!normalized || stableStringify(normalized) !== stableStringify(asset)) {
        fail('publication/non-canonical-public-media');
    }
    return normalized;
}

function sanitizePublicMedia(media = {}, touchedRoles = []) {
    const normalizedTouchedRoles = [...new Set((Array.isArray(touchedRoles) ? touchedRoles : [])
        .map((role) => String(role))
        .filter((role) => MEDIA_ROLES.includes(role)))];
    return {
        schemaVersion: 1,
        touchedRoles: normalizedTouchedRoles,
        cover: sanitizeMediaAsset(media.cover, 'cover'),
        gallery: (Array.isArray(media.gallery) ? media.gallery : [])
            .slice(0, 20)
            .map((asset, sortOrder) => sanitizeMediaAsset(asset, 'gallery', sortOrder))
            .filter(Boolean),
        place: (Array.isArray(media.place) ? media.place : [])
            .slice(0, 20)
            .map((asset, sortOrder) => sanitizeMediaAsset(asset, 'place', sortOrder))
            .filter(Boolean),
        dressCode: sanitizeMediaAsset(media.dressCode, 'dressCode'),
        video: sanitizeMediaAsset(media.video, 'video'),
        videoPoster: sanitizeMediaAsset(media.videoPoster, 'videoPoster'),
        music: sanitizeMediaAsset(media.music, 'music')
    };
}

function deserializePublicMedia(media) {
    if ((!exactKeys(media, MEDIA_FIELDS) && !exactKeys(media, LEGACY_MEDIA_FIELDS)) || media.schemaVersion !== 1) {
        fail('publication/invalid-public-media-shape');
    }
    if (!Array.isArray(media.touchedRoles)
        || media.touchedRoles.length > MEDIA_ROLES.length
        || new Set(media.touchedRoles).size !== media.touchedRoles.length
        || media.touchedRoles.some((role) => !MEDIA_ROLES.includes(role))) {
        fail('publication/invalid-public-media-roles');
    }
    if (!Array.isArray(media.gallery) || media.gallery.length > 20) {
        fail('publication/invalid-public-gallery');
    }
    if (!Array.isArray(media.place) || media.place.length > 20) fail('publication/invalid-public-place-media');
    return {
        schemaVersion: 1,
        touchedRoles: [...media.touchedRoles],
        cover: assertCanonicalMediaAsset(media.cover, 'cover'),
        gallery: media.gallery.map((asset, sortOrder) => assertCanonicalMediaAsset(asset, 'gallery', sortOrder)),
        place: media.place.map((asset, sortOrder) => assertCanonicalMediaAsset(asset, 'place', sortOrder)),
        dressCode: assertCanonicalMediaAsset(media.dressCode, 'dressCode'),
        video: assertCanonicalMediaAsset(media.video, 'video'),
        videoPoster: assertCanonicalMediaAsset(media.videoPoster, 'videoPoster'),
        music: assertCanonicalMediaAsset(media.music, 'music')
    };
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableStringify(value) {
    return JSON.stringify(stableValue(value));
}

function publicSections(sections = []) {
    return sections.filter((sectionId) => !PRIVATE_PUBLIC_SECTION_IDS.includes(sectionId));
}

function projectionSnapshot(revision) {
    return Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [
        field,
        field === 'sections' ? publicSections(revision.sections) : revision[field]
    ]));
}

export function serializePublicInvitationProjection(revision, {
    eventId,
    publicKey,
    revisionId,
    media = {},
    touchedMediaRoles = []
} = {}) {
    const normalizedRevision = deserializeInvitationRevision({
        ...revision,
        publishedAt: new Date(0),
        publishedBy: 'public-projection'
    }, eventId, {
        expectedRevisionId: revisionId
    });
    return {
        schemaVersion: INVITATION_PUBLIC_PROJECTION_SCHEMA_VERSION,
        contentSchemaVersion: normalizedRevision.contentSchemaVersion,
        eventId: normalizedRevision.eventId,
        publicKey: assertInvitationPublicKey(publicKey),
        revisionId: createInvitationRevisionId(normalizedRevision.revisionNumber),
        revisionNumber: normalizedRevision.revisionNumber,
        ...projectionSnapshot(normalizedRevision),
        media: sanitizePublicMedia(media, touchedMediaRoles)
    };
}

export function deserializePublicInvitationProjection(document, {
    expectedEventId,
    expectedPublicKey
} = {}) {
    if (!exactKeys(document, PUBLIC_FIELDS)) fail('publication/invalid-public-projection-shape');
    if (document.schemaVersion !== INVITATION_PUBLIC_PROJECTION_SCHEMA_VERSION) {
        fail('publication/unsupported-public-projection-schema');
    }
    const publicKey = assertInvitationPublicKey(expectedPublicKey);
    if (document.eventId !== expectedEventId || document.publicKey !== publicKey) {
        fail('publication/public-projection-ownership-mismatch');
    }
    if (createInvitationRevisionId(document.revisionNumber) !== document.revisionId) {
        fail('publication/public-projection-revision-mismatch');
    }
    const normalizedRevision = deserializeInvitationRevision({
        schemaVersion: 1,
        contentSchemaVersion: document.contentSchemaVersion,
        eventId: document.eventId,
        revisionNumber: document.revisionNumber,
        ...Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, document[field]])),
        publishedAt: new Date(0),
        publishedBy: 'public-projection'
    }, expectedEventId, {
        expectedRevisionId: document.revisionId,
        expectedRevisionNumber: document.revisionNumber
    });
    const normalized = {
        schemaVersion: INVITATION_PUBLIC_PROJECTION_SCHEMA_VERSION,
        contentSchemaVersion: normalizedRevision.contentSchemaVersion,
        eventId: normalizedRevision.eventId,
        publicKey,
        revisionId: document.revisionId,
        revisionNumber: normalizedRevision.revisionNumber,
        ...projectionSnapshot(normalizedRevision),
        media: deserializePublicMedia(document.media)
    };
    if (stableStringify(normalized) !== stableStringify(document)) {
        fail('publication/non-canonical-public-projection');
    }
    return Object.freeze(cloneInvitationValue(normalized));
}

export function createPublicInvitationProjectionFingerprint(document, options) {
    return stableStringify(deserializePublicInvitationProjection(document, options));
}
