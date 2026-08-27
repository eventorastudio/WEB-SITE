import { getPackageById } from './section-registry.js?v=phase4-media-20260813';

export const MEDIA_SCHEMA_VERSION = 1;
export const MEDIA_ASSET_STATUSES = Object.freeze([
    'local',
    'processing',
    'ready',
    'uploading',
    'uploaded',
    'error'
]);

export const MEDIA_ROLE_REGISTRY = Object.freeze({
    cover: Object.freeze({
        role: 'cover',
        label: 'Portada',
        kind: 'image',
        multiple: false,
        requiredCapability: 'personalized-design',
        sectionId: null,
        maxBytes: 20 * 1024 * 1024,
        maxLongEdge: 2400
    }),
    gallery: Object.freeze({
        role: 'gallery',
        label: 'Galería',
        kind: 'image',
        multiple: true,
        requiredCapability: 'gallery',
        sectionId: 'gallery',
        maxBytes: 20 * 1024 * 1024,
        maxLongEdge: 1920,
        technicalMaxItems: 20
    }),
    place: Object.freeze({
        role: 'place', label: 'Imágenes de lugares', kind: 'image', multiple: true,
        requiredCapability: 'maps', sectionId: 'location', maxBytes: 20 * 1024 * 1024,
        maxLongEdge: 1920, technicalMaxItems: 20
    }),
    dressCode: Object.freeze({
        role: 'dressCode',
        label: 'Imagen de referencia de vestimenta',
        kind: 'image',
        multiple: false,
        requiredCapability: 'dress-code',
        sectionId: 'dress-code',
        maxBytes: 20 * 1024 * 1024,
        maxLongEdge: 1920
    }),
    video: Object.freeze({
        role: 'video',
        label: 'Video de bienvenida',
        kind: 'video',
        multiple: false,
        requiredCapability: 'welcome-video',
        sectionId: 'welcome-video',
        maxBytes: 80 * 1024 * 1024,
        maxDuration: 5 * 60
    }),
    videoPoster: Object.freeze({
        role: 'videoPoster',
        label: 'Poster del video',
        kind: 'image',
        multiple: false,
        requiredCapability: 'welcome-video',
        sectionId: 'welcome-video',
        maxBytes: 20 * 1024 * 1024,
        maxLongEdge: 1920
    }),
    music: Object.freeze({
        role: 'music',
        label: 'Música',
        kind: 'audio',
        multiple: false,
        requiredCapability: 'music',
        sectionId: 'music',
        maxBytes: 20 * 1024 * 1024,
        maxDuration: 15 * 60
    })
});

export const MEDIA_MIME_POLICY = Object.freeze({
    image: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
    video: Object.freeze(['video/mp4', 'video/webm']),
    audio: Object.freeze(['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg'])
});

export const MEDIA_MAX_DECODED_PIXELS = 40_000_000;

function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedText(value, maxLength) {
    return String(value ?? '').trim().slice(0, maxLength);
}

export function createEmptyInvitationMedia() {
    return {
        schemaVersion: MEDIA_SCHEMA_VERSION,
        cover: null,
        gallery: [],
        place: [],
        dressCode: null,
        video: null,
        videoPoster: null,
        music: null
    };
}

export function getMediaRole(role) {
    return MEDIA_ROLE_REGISTRY[role] ?? null;
}

export function getMediaRoleAvailability(role, packageId, enabledSections = []) {
    const definition = getMediaRole(role);
    const selectedPackage = getPackageById(packageId);
    if (!definition) return Object.freeze({ known: false, packageAllowed: false, sectionEnabled: false, editable: false });
    const packageAllowed = Boolean(selectedPackage?.capabilities.includes(definition.requiredCapability));
    const sectionEnabled = definition.sectionId == null || enabledSections.includes(definition.sectionId);
    return Object.freeze({
        known: true,
        packageAllowed,
        sectionEnabled,
        editable: packageAllowed && sectionEnabled
    });
}

export function createMediaAsset(id, seed = {}) {
    const definition = getMediaRole(seed.role);
    if (!definition) throw new TypeError(`builder/unknown-media-role:${String(seed.role)}`);
    const status = MEDIA_ASSET_STATUSES.includes(seed.status) ? seed.status : 'local';
    const focalX = Math.min(100, Math.max(0, finiteNumber(seed.focalPoint?.x, 50)));
    const focalY = Math.min(100, Math.max(0, finiteNumber(seed.focalPoint?.y, 50)));
    return {
        id,
        role: definition.role,
        kind: definition.kind,
        originalName: boundedText(seed.originalName, 180),
        mimeType: boundedText(seed.mimeType, 80).toLowerCase(),
        size: Math.max(0, finiteNumber(seed.size)),
        width: Math.max(0, finiteNumber(seed.width)),
        height: Math.max(0, finiteNumber(seed.height)),
        duration: Math.max(0, finiteNumber(seed.duration)),
        alt: boundedText(seed.alt, 220),
        caption: boundedText(seed.caption, 360),
        storagePath: boundedText(seed.storagePath, 500),
        downloadUrl: boundedText(seed.downloadUrl, 2000),
        previewUrl: boundedText(seed.previewUrl, 2000),
        status,
        uploadProgress: Math.min(100, Math.max(0, finiteNumber(seed.uploadProgress))),
        error: boundedText(seed.error, 300),
        focalPoint: { x: focalX, y: focalY },
        sortOrder: Math.max(0, Math.trunc(finiteNumber(seed.sortOrder))),
        ...(seed.sharedDemoAssetId !== undefined ? { sharedDemoAssetId: boundedText(seed.sharedDemoAssetId, 80) } : {}),
        ...(seed.createdAt !== undefined ? { createdAt: seed.createdAt } : {}),
        ...(seed.updatedAt !== undefined ? { updatedAt: seed.updatedAt } : {}),
        ...(seed.updatedBy !== undefined ? { updatedBy: seed.updatedBy } : {})
    };
}

export function getAllMediaAssets(media = {}) {
    return [
        media.cover,
        ...(Array.isArray(media.gallery) ? media.gallery : []),
        ...(Array.isArray(media.place) ? media.place : []),
        media.dressCode,
        media.video,
        media.videoPoster,
        media.music
    ].filter(Boolean);
}

export function getMediaAssetSource(asset) {
    if (!asset) return '';
    return String(asset.previewUrl || asset.downloadUrl || '').trim();
}

export function isMediaRoleTouched(draft, role) {
    return Array.isArray(draft?.meta?.touchedMediaRoles) && draft.meta.touchedMediaRoles.includes(role);
}

export function validateMediaAsset(asset, role, errors, path) {
    const definition = getMediaRole(role);
    if (!definition || !asset) return;
    if (!/^MED-LOCAL-\d{3,}$/.test(asset.id ?? '')) errors[`${path}.id`] = 'El recurso no tiene un ID local válido.';
    if (asset.role !== role) errors[`${path}.role`] = 'El rol del recurso no coincide con su ubicación.';
    if (asset.kind !== definition.kind) errors[`${path}.kind`] = 'El tipo del recurso no coincide con su rol.';
    if (!MEDIA_MIME_POLICY[definition.kind].includes(asset.mimeType)) errors[`${path}.mimeType`] = 'El formato del archivo no está permitido.';
    if (asset.size <= 0 || asset.size > definition.maxBytes) errors[`${path}.size`] = 'El tamaño del archivo no está permitido.';
    if (!MEDIA_ASSET_STATUSES.includes(asset.status)) errors[`${path}.status`] = 'El estado del recurso no es válido.';
    if (definition.kind === 'image') {
        if (asset.width <= 0 || asset.height <= 0) errors[`${path}.dimensions`] = 'No fue posible validar las dimensiones de la imagen.';
        if (asset.width * asset.height > MEDIA_MAX_DECODED_PIXELS) errors[`${path}.dimensions`] = 'La imagen excede el límite de píxeles decodificados.';
    }
    if (definition.maxDuration && (asset.duration <= 0 || asset.duration > definition.maxDuration)) {
        errors[`${path}.duration`] = 'La duración del archivo no está permitida.';
    }
}

export function sniffMediaMimeType(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
    const ascii = (start, length) => String.fromCharCode(...data.slice(start, start + length));
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
    if (data.length >= 8 && data[0] === 0x89 && ascii(1, 3) === 'PNG' && data[4] === 0x0d && data[5] === 0x0a) return 'image/png';
    if (data.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
    if (data.length >= 12 && ascii(4, 4) === 'ftyp') {
        const brand = ascii(8, 4).toLowerCase();
        return ['m4a ', 'm4b ', 'm4p '].includes(brand) ? 'audio/mp4' : 'video/mp4';
    }
    if (data.length >= 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return 'video/webm';
    if (data.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
    if (data.length >= 3 && ascii(0, 3) === 'ID3') return 'audio/mpeg';
    if (data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0) {
        return (data[1] & 0x16) === 0x10 ? 'audio/aac' : 'audio/mpeg';
    }
    return '';
}

export function validateMediaSignature({ declaredMime, detectedMime, kind }) {
    const normalizedDeclared = String(declaredMime ?? '').toLowerCase();
    const allowed = MEDIA_MIME_POLICY[kind] ?? [];
    if (!allowed.includes(normalizedDeclared)) return { ok: false, code: 'media/mime-not-allowed' };
    if (!detectedMime || !allowed.includes(detectedMime)) return { ok: false, code: 'media/signature-not-allowed' };
    if (normalizedDeclared === detectedMime) return { ok: true };
    const compatibleMp4 = kind === 'audio' && normalizedDeclared === 'audio/aac' && detectedMime === 'audio/mpeg';
    return compatibleMp4 ? { ok: true } : { ok: false, code: 'media/mime-signature-mismatch' };
}
