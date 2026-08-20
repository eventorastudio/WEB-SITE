import { getMediaAssetSource, isMediaRoleTouched } from './media-schema.js?v=phase4-media-20260813';
import { applyAlohaGalleryBinding } from './aloha-template-bindings.js?v=phase86-aloha-a2-20260820';

function safeQuery(root, selector) {
    if (!root || !selector) return null;
    try { return root.querySelector(selector); } catch { return null; }
}

function safeMediaSource(asset) {
    const value = getMediaAssetSource(asset);
    if (!value) return '';
    try {
        const parsed = new URL(value, globalThis.location?.href ?? 'https://eventorastudio.invalid/');
        return ['blob:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
        return '';
    }
}

function mediaMode(draft, role, assets) {
    if (!isMediaRoleTouched(draft, role)) return 'untouched';
    return assets.some((asset) => safeMediaSource(asset)) ? 'configured' : 'cleared';
}

function resetGenerated(root, role) {
    root?.querySelectorAll?.(`[data-builder-phase4="${role}"]`).forEach((node) => node.remove());
    root?.querySelectorAll?.(`[data-builder-media-demo="${role}"]`).forEach((node) => {
        node.hidden = false;
        delete node.dataset.builderMediaDemo;
    });
}

function hideDemoImages(root, role) {
    [...(root?.querySelectorAll?.('img,picture') ?? [])].forEach((node) => {
        if (node.closest('[data-builder-phase4]')) return;
        const frame = node.closest('figure,picture') ?? node;
        frame.hidden = true;
        frame.dataset.builderMediaDemo = role;
    });
}

function applyCover(documentRoot, adapter, draft) {
    const image = safeQuery(documentRoot, adapter.media?.cover);
    if (!image) return;
    const asset = draft.media?.cover;
    const mode = mediaMode(draft, 'cover', [asset].filter(Boolean));
    image.dataset.builderMediaState = mode;
    if (mode === 'untouched') return;
    if (mode === 'cleared') {
        image.hidden = true;
        image.removeAttribute('src');
        image.removeAttribute('srcset');
        return;
    }
    const source = safeMediaSource(asset);
    image.hidden = false;
    image.src = source;
    image.removeAttribute('srcset');
    image.alt = asset.alt || '';
    image.loading = 'eager';
    image.fetchPriority = 'high';
    image.style.objectPosition = `${asset.focalPoint?.x ?? 50}% ${asset.focalPoint?.y ?? 50}%`;
}

function applyGallery(documentRoot, adapter, draft) {
    const root = safeQuery(documentRoot, adapter.media?.gallery ?? '[data-prestige-feature~="gallery"]');
    if (!root) return;
    resetGenerated(root, 'gallery');
    const assets = Array.isArray(draft.media?.gallery) ? draft.media.gallery : [];
    const mode = mediaMode(draft, 'gallery', assets);
    root.dataset.builderMediaState = mode;
    if (mode === 'untouched') return;
    hideDemoImages(root, 'gallery');
    if (mode === 'cleared') return;
    const grid = root.ownerDocument.createElement('div');
    grid.className = `builder-phase4-gallery builder-phase4-gallery-${adapter.media?.variant ?? adapter.themeId}`;
    grid.dataset.builderPhase4 = 'gallery';
    [...assets].sort((a, b) => a.sortOrder - b.sortOrder).forEach((asset) => {
        const source = safeMediaSource(asset);
        if (!source) return;
        const figure = root.ownerDocument.createElement('figure');
        figure.className = 'builder-phase4-gallery-item';
        figure.dataset.mediaId = asset.id;
        const image = root.ownerDocument.createElement('img');
        image.src = source;
        image.alt = asset.alt || '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.style.objectPosition = `${asset.focalPoint?.x ?? 50}% ${asset.focalPoint?.y ?? 50}%`;
        figure.append(image);
        if (asset.caption) {
            const caption = root.ownerDocument.createElement('figcaption');
            caption.textContent = asset.caption;
            figure.append(caption);
        }
        grid.append(figure);
    });
    root.append(grid);
}

function applyVideo(documentRoot, adapter, draft) {
    const root = safeQuery(documentRoot, adapter.media?.video ?? '[data-prestige-feature~="welcome-video"]');
    if (!root) return;
    resetGenerated(root, 'video');
    const asset = draft.media?.video;
    const mode = mediaMode(draft, 'video', [asset].filter(Boolean));
    root.dataset.builderMediaState = mode;
    if (mode === 'untouched') return;
    hideDemoImages(root, 'video');
    root.querySelectorAll('[data-demo-action="video-preview"]').forEach((node) => {
        node.hidden = true;
        node.dataset.builderMediaDemo = 'video';
    });
    if (mode === 'cleared') return;
    const source = safeMediaSource(asset);
    if (!source) return;
    const wrap = root.ownerDocument.createElement('div');
    wrap.className = `builder-phase4-video builder-phase4-video-${adapter.media?.variant ?? adapter.themeId}`;
    wrap.dataset.builderPhase4 = 'video';
    const video = root.ownerDocument.createElement('video');
    video.src = source;
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.autoplay = false;
    video.removeAttribute('autoplay');
    const poster = safeMediaSource(draft.media?.videoPoster);
    if (poster) video.poster = poster;
    wrap.append(video);
    root.append(wrap);
}

function applyMusic(documentRoot, adapter, draft) {
    const root = safeQuery(documentRoot, adapter.media?.music ?? '[data-prestige-feature~="music"]');
    if (!root) return;
    resetGenerated(root, 'music');
    const asset = draft.media?.music;
    const mode = mediaMode(draft, 'music', [asset].filter(Boolean));
    root.dataset.builderMediaState = mode;
    if (mode !== 'configured') return;
    const source = safeMediaSource(asset);
    if (!source) return;
    const wrap = root.ownerDocument.createElement('div');
    wrap.className = `builder-phase4-music builder-phase4-music-${adapter.media?.variant ?? adapter.themeId}`;
    wrap.dataset.builderPhase4 = 'music';
    const audio = root.ownerDocument.createElement('audio');
    audio.src = source;
    audio.controls = true;
    audio.preload = 'metadata';
    audio.autoplay = false;
    audio.removeAttribute('autoplay');
    wrap.append(audio);
    root.append(wrap);
}

export function applyPhase4MediaBindings(documentRoot, adapter, draft = {}) {
    if (!documentRoot || !adapter || !draft.media) return { applied: false };
    applyCover(documentRoot, adapter, draft);
    if (adapter.media?.variant === 'aloha') applyAlohaGalleryBinding(documentRoot, draft);
    else applyGallery(documentRoot, adapter, draft);
    applyVideo(documentRoot, adapter, draft);
    applyMusic(documentRoot, adapter, draft);
    return { applied: true };
}
