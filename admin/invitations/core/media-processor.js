import {
    MEDIA_MAX_DECODED_PIXELS,
    getMediaRole,
    sniffMediaMimeType,
    validateMediaSignature
} from './media-schema.js?v=phase89-dress-code-media-20260820';

function mediaError(code, detail = '') {
    const error = new Error(code);
    error.code = code;
    error.detail = detail;
    return error;
}

async function readHeader(file, length = 64) {
    const buffer = await file.slice(0, length).arrayBuffer();
    return new Uint8Array(buffer);
}

function waitForMediaMetadata(element, previewUrl) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            element.removeEventListener('loadedmetadata', handleLoaded);
            element.removeEventListener('error', handleError);
        };
        const handleLoaded = () => {
            cleanup();
            resolve({
                duration: Number.isFinite(element.duration) ? element.duration : 0,
                width: element.videoWidth || 0,
                height: element.videoHeight || 0
            });
        };
        const handleError = () => {
            cleanup();
            reject(mediaError('media/decode-failed'));
        };
        element.addEventListener('loadedmetadata', handleLoaded, { once: true });
        element.addEventListener('error', handleError, { once: true });
        element.preload = 'metadata';
        element.src = previewUrl;
        element.load();
    });
}

async function decodeImage(file, previewUrl, documentRef) {
    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return {
            width: bitmap.width,
            height: bitmap.height,
            draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height),
            close: () => bitmap.close()
        };
    }
    return new Promise((resolve, reject) => {
        const image = documentRef.createElement('img');
        image.onload = () => resolve({
            width: image.naturalWidth,
            height: image.naturalHeight,
            draw: (context, width, height) => context.drawImage(image, 0, 0, width, height),
            close: () => {}
        });
        image.onerror = () => reject(mediaError('media/decode-failed'));
        image.src = previewUrl;
    });
}

function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(mediaError('media/encode-failed')), mimeType, quality);
    });
}

function renameExtension(name, mimeType) {
    const extension = mimeType === 'image/png' ? 'png' : 'webp';
    return `${String(name || 'imagen').replace(/\.[^.]+$/, '')}.${extension}`;
}

async function processImage(file, definition, { documentRef, temporaryUrl, onProgress }) {
    onProgress?.(30);
    const decoded = await decodeImage(file, temporaryUrl, documentRef);
    const pixels = decoded.width * decoded.height;
    if (!decoded.width || !decoded.height || pixels > MEDIA_MAX_DECODED_PIXELS) {
        decoded.close();
        throw mediaError('media/image-dimensions-not-allowed');
    }
    const scale = Math.min(1, definition.maxLongEdge / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = documentRef.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: file.type === 'image/png' });
    if (!context) {
        decoded.close();
        throw mediaError('media/canvas-unavailable');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    decoded.draw(context, width, height);
    decoded.close();
    onProgress?.(65);
    const outputMime = file.type === 'image/png' ? 'image/png' : 'image/webp';
    const blob = await canvasToBlob(canvas, outputMime, outputMime === 'image/webp' ? 0.88 : undefined);
    const output = typeof File === 'function'
        ? new File([blob], renameExtension(file.name, outputMime), { type: outputMime, lastModified: Date.now() })
        : Object.assign(blob, { name: renameExtension(file.name, outputMime), lastModified: Date.now() });
    if (output.size > definition.maxBytes) throw mediaError('media/file-size-not-allowed');
    return { file: output, width, height, duration: 0 };
}

export async function inspectAndProcessMediaFile(file, role, {
    documentRef = globalThis.document,
    urlApi = globalThis.URL,
    onProgress = null
} = {}) {
    const definition = getMediaRole(role);
    if (!definition) throw mediaError('media/unknown-role');
    if (!file || typeof file.arrayBuffer !== 'function') throw mediaError('media/file-required');
    if (file.size <= 0 || file.size > definition.maxBytes) throw mediaError('media/file-size-not-allowed');

    onProgress?.(10);
    const detectedMime = sniffMediaMimeType(await readHeader(file));
    const signature = validateMediaSignature({ declaredMime: file.type, detectedMime, kind: definition.kind });
    if (!signature.ok) throw mediaError(signature.code);

    const temporaryUrl = urlApi.createObjectURL(file);
    try {
        if (definition.kind === 'image') {
            const output = await processImage(file, definition, { documentRef, temporaryUrl, onProgress });
            onProgress?.(100);
            return output;
        }

        const element = documentRef.createElement(definition.kind === 'video' ? 'video' : 'audio');
        const metadata = await waitForMediaMetadata(element, temporaryUrl);
        if (!metadata.duration || metadata.duration > definition.maxDuration) throw mediaError('media/duration-not-allowed');
        if (definition.kind === 'video' && (!metadata.width || !metadata.height)) throw mediaError('media/video-dimensions-unavailable');
        onProgress?.(100);
        return { file, ...metadata };
    } finally {
        urlApi.revokeObjectURL(temporaryUrl);
    }
}

export function friendlyMediaError(error) {
    const messages = {
        'media/file-required': 'Selecciona un archivo válido.',
        'media/file-size-not-allowed': 'El archivo excede el límite permitido para este recurso.',
        'media/mime-not-allowed': 'El formato declarado no está permitido.',
        'media/signature-not-allowed': 'El contenido real del archivo no corresponde a un formato permitido.',
        'media/mime-signature-mismatch': 'La extensión, el MIME y la firma del archivo no coinciden.',
        'media/image-dimensions-not-allowed': 'La imagen es demasiado grande para procesarse de forma segura.',
        'media/decode-failed': 'El navegador no pudo decodificar este archivo.',
        'media/duration-not-allowed': 'La duración del archivo excede el límite permitido.',
        'media/video-dimensions-unavailable': 'No fue posible leer las dimensiones del video.',
        'media/canvas-unavailable': 'El navegador no pudo preparar la imagen.',
        'media/encode-failed': 'No fue posible optimizar la imagen.'
    };
    return messages[error?.code || error?.message] ?? 'No fue posible procesar este archivo.';
}
