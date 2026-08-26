import {
    INVITATION_CONTENT_SCHEMA_VERSION,
    cloneInvitationValue,
    createInvitationContent
} from './content-schema.js?v=phase171-demo-mode-20260826';
import { getInvitationFormat } from './section-registry.js?v=phase126-accommodation-icons-place-library-20260824';
import { normalizeDeviceAvailability } from './device-availability.js?v=phase168-device-availability-20260825';

export const CURRENT_DRAFT_SCHEMA_VERSION = 2;

function migrationError(code) {
    const error = new TypeError(code);
    error.code = code;
    throw error;
}

function migrateLocationMediaRefs(document) {
    if (!Array.isArray(document.locations)) return document;
    document.locations = document.locations.map((location) => {
        if (!location || typeof location !== 'object' || Array.isArray(location)) return location;
        const hasCurrent = Object.hasOwn(location, 'imageMediaId');
        const hasLegacy = Object.hasOwn(location, 'imageId');
        if (hasCurrent && hasLegacy && location.imageMediaId !== location.imageId) {
            migrationError('draft/conflicting-location-image-media-ids');
        }
        if (hasCurrent && location.imageMediaId === '') {
            const migrated = { ...location };
            delete migrated.imageMediaId;
            if (hasLegacy) delete migrated.imageId;
            return migrated;
        }
        if (!hasLegacy) return location;
        const migrated = { ...location };
        if (migrated.imageId === '') {
            delete migrated.imageId;
            if (hasCurrent) delete migrated.imageMediaId;
            return migrated;
        }
        if (!hasCurrent) migrated.imageMediaId = migrated.imageId;
        delete migrated.imageId;
        return migrated;
    });
    return document;
}

function migrateOpening(content) {
    if (!content || typeof content !== 'object' || Array.isArray(content)) return content;
    if (Object.hasOwn(content.welcome ?? {}, 'opening')) return content;
    const defaults = createInvitationContent({
        tipoEvento: content.identity?.eventType,
        fecha: content.schedule?.date
    }).welcome.opening;
    content.welcome = {
        ...(content.welcome ?? {}),
        opening: defaults
    };
    return content;
}

function migrateContentV1ToV2(document) {
    document.contentSchemaVersion = 2;
    return document;
}

function migrateContentV2ToV3(document) {
    document.contentSchemaVersion = 3;
    return document;
}

function migrateContentV3ToV4(document) {
    const defaults = createInvitationContent();
    document.content = document.content && typeof document.content === 'object' ? document.content : {};
    document.content.access = { ...defaults.access, ...(document.content.access ?? {}) };
    migrateOpening(document.content);
    document.contentSchemaVersion = 4;
    return document;
}

function migrateCurrentOptionalContentDefaults(document) {
    const defaults = createInvitationContent();
    document.content = document.content && typeof document.content === 'object' ? document.content : {};
    document.content.access = { ...defaults.access, ...(document.content.access ?? {}) };
    migrateOpening(document.content);
    return document;
}

const CONTENT_MIGRATIONS = Object.freeze({
    1: migrateContentV1ToV2,
    2: migrateContentV2ToV3,
    3: migrateContentV3ToV4
});

function migrateDraftV1ToV2(document) {
    if (!Object.hasOwn(document, 'accommodations')) document.accommodations = [];
    document.schemaVersion = CURRENT_DRAFT_SCHEMA_VERSION;
    return document;
}

export function migrateInvitationDraftToCurrentSchema(rawDraft) {
    const migrated = cloneInvitationValue(rawDraft);
    if (!migrated || typeof migrated !== 'object' || Array.isArray(migrated)) {
        migrationError('draft/invalid-document-shape');
    }
    if (migrated.schemaVersion !== 1 && migrated.schemaVersion !== CURRENT_DRAFT_SCHEMA_VERSION) {
        migrationError(migrated.schemaVersion > CURRENT_DRAFT_SCHEMA_VERSION
            ? 'draft/unsupported-future-schema'
            : 'draft/unsupported-schema');
    }
    if (!Number.isInteger(migrated.contentSchemaVersion)
        || migrated.contentSchemaVersion < 1
        || migrated.contentSchemaVersion > INVITATION_CONTENT_SCHEMA_VERSION) {
        migrationError(migrated.contentSchemaVersion > INVITATION_CONTENT_SCHEMA_VERSION
            ? 'draft/unsupported-future-content-schema'
            : 'draft/unsupported-content-schema');
    }
    if (migrated.schemaVersion === 1) migrateDraftV1ToV2(migrated);
    migrateLocationMediaRefs(migrated);
    while (migrated.contentSchemaVersion < INVITATION_CONTENT_SCHEMA_VERSION) {
        const migration = CONTENT_MIGRATIONS[migrated.contentSchemaVersion];
        if (!migration) migrationError('draft/missing-content-migration');
        migration(migrated);
    }
    migrateCurrentOptionalContentDefaults(migrated);
    if (migrated.theme === '') migrated.theme = null;
    if (migrated.settings && !Object.hasOwn(migrated.settings, 'format')) {
        migrated.settings.format = getInvitationFormat().id;
    }
    if (migrated.settings) {
        migrated.settings.deviceAvailability = normalizeDeviceAvailability(migrated.settings.deviceAvailability);
        if (!Object.hasOwn(migrated.settings, 'demoMode')) migrated.settings.demoMode = false;
    }
    return migrated;
}
