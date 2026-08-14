const SAFE_EVENT_ID = /^[A-Z0-9][A-Z0-9_-]{2,79}$/;
const SAFE_MEDIA_ID = /^MED-LOCAL-\d{3,}$/;
const SAFE_ROLE = /^(?:cover|gallery|video|videoPoster|music)$/;

export const INVITATION_MEDIA_STORAGE_STATUS = Object.freeze({
    mode: 'blocked',
    canUpload: false,
    canDelete: false,
    code: 'storage/not-integrated',
    message: 'Preview local activa. Storage requiere inicialización, Rules revisadas y validación de App Check antes de habilitar uploads.'
});

const MIME_EXTENSIONS = Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg'
});

export function getInvitationMediaStorageStatus() {
    return INVITATION_MEDIA_STORAGE_STATUS;
}

export function buildInvitationMediaStoragePath({ eventId, assetId, role, mimeType }) {
    if (!SAFE_EVENT_ID.test(String(eventId ?? ''))) throw new TypeError('storage/invalid-event-id');
    if (!SAFE_MEDIA_ID.test(String(assetId ?? ''))) throw new TypeError('storage/invalid-media-id');
    if (!SAFE_ROLE.test(String(role ?? ''))) throw new TypeError('storage/invalid-media-role');
    const extension = MIME_EXTENSIONS[mimeType];
    if (!extension) throw new TypeError('storage/unsupported-media-mime');
    return `eventos/${eventId}/invitacion/media/${role}/${assetId}.${extension}`;
}

export function assertOwnedInvitationMediaPath(path, eventId) {
    const safePrefix = `eventos/${eventId}/invitacion/media/`;
    if (!SAFE_EVENT_ID.test(String(eventId ?? '')) || !String(path ?? '').startsWith(safePrefix)) {
        throw new TypeError('storage/path-outside-event-scope');
    }
    return true;
}

export function startInvitationMediaUpload() {
    const error = new Error(INVITATION_MEDIA_STORAGE_STATUS.code);
    error.code = INVITATION_MEDIA_STORAGE_STATUS.code;
    error.retryable = false;
    throw error;
}

export function deleteInvitationMediaObject() {
    const error = new Error(INVITATION_MEDIA_STORAGE_STATUS.code);
    error.code = INVITATION_MEDIA_STORAGE_STATUS.code;
    throw error;
}
