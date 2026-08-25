import { getAllMediaAssets, getMediaAssetSource, getMediaRoleAvailability } from '../core/media-schema.js?v=phase139-media-index-atomic-rule-fix-20250825';
import { MediaObjectUrlRegistry } from '../core/media-runtime.js?v=phase4-media-20260813';
import { friendlyMediaError, inspectAndProcessMediaFile } from '../core/media-processor.js?v=phase139-media-index-atomic-rule-fix-20250825';
import { invitationMediaService } from '../services/invitation-media-service.js?v=phase139-media-index-atomic-rule-fix-20250825';

const ROLE_COPY = Object.freeze({
    place: Object.freeze({ title: 'Imágenes de lugares', copy: 'Biblioteca reutilizable para sitios y hospedaje. JPEG, PNG o WebP.', accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' }),
    cover: Object.freeze({ title: 'Portada / hero', copy: 'JPEG, PNG o WebP. Se optimiza localmente y conserva un punto focal por invitación.', accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' }),
    gallery: Object.freeze({ title: 'Galería', copy: 'Selección múltiple, orden estable, alt y caption. Límite técnico: 20 imágenes.', accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' }),
    dressCode: Object.freeze({ title: 'Imagen de referencia de vestimenta', copy: 'Outfit o inspiración visual opcional para la sección Dress Code de Aloha.', accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' }),
    video: Object.freeze({ title: 'Video de bienvenida', copy: 'MP4 o WebM, hasta 80 MiB y 5 minutos. Nunca inicia automáticamente.', accept: 'video/mp4,video/webm' }),
    videoPoster: Object.freeze({ title: 'Poster del video', copy: 'Imagen opcional para presentar el video antes de reproducirlo.', accept: '.jpg,.jpeg,image/jpeg,image/png,image/webp' }),
    music: Object.freeze({ title: 'Música', copy: 'MP3, M4A/AAC u OGG, hasta 20 MiB y 15 minutos. Reproducción manual.', accept: 'audio/mpeg,audio/mp4,audio/aac,audio/ogg' })
});

const STATUS_LABELS = Object.freeze({
    local: 'LOCAL',
    processing: 'PROCESANDO',
    ready: 'PENDIENTE DE SUBIR',
    uploading: 'SUBIENDO',
    uploaded: 'EN LA NUBE',
    error: 'ERROR'
});

function roleAssets(media, role) {
    return ['gallery', 'place'].includes(role) ? (media[role] ?? []) : [media[role]].filter(Boolean);
}

function findAsset(media, assetId) {
    return getAllMediaAssets(media ?? {}).find(({ id }) => id === assetId) ?? null;
}

function replaceAsset(media, replacement) {
    const next = structuredClone(media);
    if (['gallery', 'place'].includes(replacement.role)) {
        const index = next[replacement.role].findIndex(({ id }) => id === replacement.id);
        if (index >= 0) next[replacement.role][index] = replacement;
        else next[replacement.role].push(replacement);
    } else {
        next[replacement.role] = replacement;
    }
    return next;
}

function withoutAsset(media, assetId) {
    const next = structuredClone(media);
    next.gallery = (next.gallery ?? []).filter(({ id }) => id !== assetId)
        .map((asset, sortOrder) => ({ ...asset, sortOrder }));
    next.place = (next.place ?? []).filter(({ id }) => id !== assetId)
        .map((asset, sortOrder) => ({ ...asset, sortOrder }));
    for (const role of ['cover', 'dressCode', 'video', 'videoPoster', 'music']) {
        if (next[role]?.id === assetId) next[role] = null;
    }
    return next;
}

function fileLabel(asset) {
    if (!asset) return '';
    const size = asset.size ? `${(asset.size / (1024 * 1024)).toFixed(1)} MiB` : 'tamaño pendiente';
    const dimensions = asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : '';
    const duration = asset.duration ? ` · ${Math.round(asset.duration)} s` : '';
    return `${asset.originalName} · ${size}${dimensions}${duration}`;
}

function buildMediaPreview(asset) {
    const source = getMediaAssetSource(asset);
    const wrap = document.createElement('div');
    wrap.className = 'media-asset-preview';
    if (!source) {
        wrap.textContent = asset.status === 'processing' ? 'Procesando…' : 'Vista no disponible';
        return wrap;
    }
    if (asset.kind === 'image') {
        const image = document.createElement('img');
        image.src = source;
        image.alt = asset.alt || '';
        image.style.objectPosition = `${asset.focalPoint.x}% ${asset.focalPoint.y}%`;
        image.addEventListener('error', () => wrap.classList.add('has-preview-error'), { once: true });
        wrap.append(image);
    } else {
        const media = document.createElement(asset.kind === 'video' ? 'video' : 'audio');
        media.src = source;
        media.controls = true;
        media.preload = 'metadata';
        if (asset.kind === 'video') media.playsInline = true;
        media.addEventListener('error', () => wrap.classList.add('has-preview-error'), { once: true });
        wrap.append(media);
    }
    return wrap;
}

function button(label, action, assetId, className = '') {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `media-action ${className}`.trim();
    node.dataset.mediaAction = action;
    if (assetId) node.dataset.assetId = assetId;
    node.textContent = label;
    return node;
}

function field(label, property, asset, { multiline = false } = {}) {
    const wrapper = document.createElement('label');
    wrapper.className = 'media-field';
    const caption = document.createElement('span');
    caption.textContent = label;
    const control = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) control.type = 'text';
    control.value = asset[property] ?? '';
    control.dataset.mediaField = property;
    control.dataset.assetId = asset.id;
    control.maxLength = property === 'alt' ? 220 : 360;
    wrapper.append(caption, control);
    return wrapper;
}

function createAssetCard(asset, role, index, total, { storageStatus, registry, savingIds }) {
    const isUploading = savingIds.has(asset.id);
    const card = document.createElement('article');
    card.className = 'media-asset-card';
    card.dataset.assetId = asset.id;
    const header = document.createElement('header');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = ['gallery', 'place'].includes(role) ? `Imagen ${index + 1}` : ROLE_COPY[role].title;
    const meta = document.createElement('small');
    meta.textContent = fileLabel(asset);
    copy.append(title, meta);
    const badge = document.createElement('span');
    badge.className = `media-status media-status-${isUploading ? 'uploading' : asset.status}`;
    badge.textContent = STATUS_LABELS[isUploading ? 'uploading' : asset.status] ?? asset.status.toUpperCase();
    header.append(copy, badge);

    const body = document.createElement('div');
    body.className = 'media-asset-body';
    body.append(buildMediaPreview(asset));
    if (isUploading) {
        const progress = document.createElement('div');
        progress.className = 'media-asset-progress';
        const label = document.createElement('span');
        label.textContent = 'Subiendo';
        const meter = document.createElement('progress');
        meter.max = 100;
        meter.value = 0;
        meter.dataset.uploadMeter = asset.id;
        meter.setAttribute('aria-label', 'Subiendo: 0%');
        const value = document.createElement('small');
        value.dataset.uploadValue = asset.id;
        value.textContent = '0%';
        progress.append(label, meter, value);
        body.append(progress);
    }
    if (asset.error) {
        const error = document.createElement('p');
        error.className = 'media-asset-error';
        error.textContent = asset.error;
        body.append(error);
    }
    const fields = document.createElement('div');
    fields.className = 'media-asset-fields';
    if (asset.kind === 'image') fields.append(field('Texto alternativo', 'alt', asset));
    if (['gallery', 'place'].includes(role)) fields.append(field('Caption opcional', 'caption', asset, { multiline: true }));
    if (role === 'cover') {
        const focal = document.createElement('div');
        focal.className = 'media-focal-fields';
        ['x', 'y'].forEach((axis) => {
            const label = document.createElement('label');
            const caption = document.createElement('span');
            caption.textContent = `Foco ${axis.toUpperCase()}`;
            const range = document.createElement('input');
            range.type = 'range';
            range.min = '0';
            range.max = '100';
            range.value = String(asset.focalPoint[axis]);
            range.dataset.mediaFocal = axis;
            range.dataset.assetId = asset.id;
            label.append(caption, range);
            focal.append(label);
        });
        fields.append(focal);
    }
    body.append(fields);

    const actions = document.createElement('footer');
    if (['gallery', 'place'].includes(role)) {
        const up = button('↑', 'up', asset.id, 'media-icon-action');
        const down = button('↓', 'down', asset.id, 'media-icon-action');
        up.disabled = index === 0 || isUploading;
        down.disabled = index === total - 1 || isUploading;
        actions.append(up, down);
    }
    const replacement = document.createElement('label');
    replacement.className = 'media-file-button';
    replacement.textContent = 'Reemplazar';
    const replacementInput = document.createElement('input');
    replacementInput.type = 'file';
    replacementInput.accept = ROLE_COPY[role].accept;
    replacementInput.dataset.mediaFile = role;
    replacementInput.dataset.replaceId = asset.id;
    replacementInput.disabled = isUploading;
    replacement.append(replacementInput);
    actions.append(replacement);
    if (storageStatus.canUpload && registry.get(asset.id)) {
        actions.append(isUploading
            ? button('Cancelar', 'cancel-upload', asset.id)
            : button(asset.status === 'error' ? 'Reintentar' : 'Subir', 'upload', asset.id));
    }
    const remove = button('Eliminar', 'remove', asset.id, 'is-danger');
    remove.disabled = isUploading;
    actions.append(remove);
    body.append(actions);
    card.append(header, body);
    return card;
}

function createRoleSection(role, snapshot, activity, context) {
    const media = snapshot.draft.media;
    const availability = getMediaRoleAvailability(role, snapshot.draft.packageId, snapshot.draft.enabledSections);
    const assets = roleAssets(media, role);
    const section = document.createElement('section');
    section.className = 'media-role-card';
    if (!availability.editable) section.classList.add('is-locked');
    section.dataset.mediaRole = role;
    const header = document.createElement('header');
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = ROLE_COPY[role].title;
    const description = document.createElement('p');
    description.textContent = role === 'place'
        ? `${ROLE_COPY[role].copy} Cada imagen válida se guarda automáticamente.`
        : ROLE_COPY[role].copy;
    copy.append(title, description);
    const state = document.createElement('span');
    state.className = 'media-role-badge';
    state.textContent = !availability.packageAllowed ? 'NO INCLUIDO' : (!availability.sectionEnabled ? 'SECCIÓN INACTIVA' : 'DISPONIBLE');
    header.append(copy, state);
    section.append(header);

    if (!availability.editable) {
        const retained = document.createElement('p');
        retained.className = 'media-retained-note';
        retained.textContent = assets.length
            ? 'El recurso permanece conservado y reaparecerá al restaurar el paquete o la sección.'
            : 'Activa la sección y usa un paquete compatible para configurar este recurso.';
        section.append(retained);
    }

    const controls = document.createElement('div');
    controls.className = 'media-role-controls';
    const chooser = document.createElement('label');
    chooser.className = 'media-file-button is-primary';
    chooser.textContent = ['gallery', 'place'].includes(role) ? 'Agregar imágenes' : (assets.length ? 'Reemplazar archivo' : 'Seleccionar archivo');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ROLE_COPY[role].accept;
    input.multiple = ['gallery', 'place'].includes(role);
    input.disabled = !availability.editable || (['gallery', 'place'].includes(role) && assets.length >= 20) || context.savingIds.size > 0;
    input.dataset.mediaFile = role;
    if (assets.length && !['gallery', 'place'].includes(role)) input.dataset.replaceId = assets[0].id;
    chooser.append(input);
    controls.append(chooser);
    if (['gallery', 'place'].includes(role) && assets.length) {
        const count = document.createElement('small');
        count.textContent = `${assets.length}/20 imágenes`;
        controls.append(count);
    }
    if (activity[role]) {
        const progress = document.createElement('span');
        progress.className = 'media-processing';
        progress.textContent = activity[role];
        controls.append(progress);
    }
    section.append(controls);

    const dropZone = document.createElement('div');
    dropZone.className = 'media-drop-zone';
    dropZone.dataset.mediaDrop = role;
    dropZone.setAttribute('role', 'group');
    dropZone.setAttribute('aria-label', `Soltar archivo para ${ROLE_COPY[role].title}`);
    dropZone.setAttribute('aria-disabled', String(!availability.editable || context.savingIds.size > 0));
    dropZone.textContent = availability.editable
        ? (['gallery', 'place'].includes(role) ? 'Arrastra aquí una o varias imágenes' : 'Arrastra aquí un archivo compatible')
        : 'Carga bloqueada por paquete o sección';
    section.append(dropZone);

    const message = document.createElement('p');
    message.className = 'media-role-message';
    message.dataset.mediaMessage = role;
    message.hidden = true;
    section.append(message);
    const list = document.createElement('div');
    list.className = ['gallery', 'place'].includes(role) ? 'media-gallery-list' : 'media-single-list';
    assets.forEach((asset, index) => list.append(createAssetCard(asset, role, index, assets.length, context)));
    if (!assets.length) {
        const empty = document.createElement('p');
        empty.className = 'media-empty';
        empty.textContent = 'Sin archivo configurado. La plantilla conserva su demo hasta que este rol se guarde explícitamente.';
        list.append(empty);
    }
    section.append(list);
    return section;
}

function metadataFromProcessed(role, sourceFile, processed, previewUrl = '') {
    return {
        role,
        originalName: processed.file.name || sourceFile.name,
        mimeType: processed.file.type || sourceFile.type,
        size: processed.file.size,
        width: processed.width,
        height: processed.height,
        duration: processed.duration,
        alt: sourceFile.name.replace(/\.[^.]+$/, '').slice(0, 220),
        caption: '', previewUrl, storagePath: '', downloadUrl: '',
        status: previewUrl ? 'ready' : 'local', uploadProgress: 0, error: ''
    };
}

function friendlyPersistenceError(error) {
    const code = String(error?.code || error?.message || 'storage/unknown');
    if (code.includes('cancel')) return 'La subida fue cancelada. El preview local se conserva.';
    if (code.includes('unauthenticated')) return 'La sesión expiró antes de guardar la multimedia.';
    if (code.includes('permission-denied') || code.includes('unauthorized')) return 'Firebase rechazó la operación. Revisa claims y Rules.';
    if (code.includes('path-outside') || code.includes('ownership')) return 'El archivo no pertenece a este evento y fue rechazado.';
    if (code.includes('metadata')) return 'Storage terminó, pero Firestore rechazó la metadata. Se intentó eliminar el archivo nuevo.';
    return 'No fue posible guardar este recurso. El preview local permanece disponible para reintentar.';
}

function persistenceDiagnostic(error, asset) {
    return {
        stage: error?.stage || error?.cause?.stage || 'unknown',
        code: error?.firebaseCode || error?.cause?.code || error?.code || 'unknown',
        role: asset?.role || 'unknown',
        extension: String(asset?.originalName ?? '').split('.').pop()?.toLowerCase() || 'unknown',
        mime: asset?.mimeType || 'unknown'
    };
}

function reportPersistenceDiagnostic(error, asset) {
    if (!error) return null;
    const detail = persistenceDiagnostic(error, asset);
    console.error('[Invitation media persistence]', detail);
    return detail;
}

function persistenceMessage(error, asset) {
    const message = friendlyPersistenceError(error);
    if (!globalThis.__INVITATION_DEBUG__) return message;
    const detail = persistenceDiagnostic(error, asset);
    return `${message} (${detail.stage} · ${detail.code})`;
}

function waitForCloudPreview(asset, timeoutMs = 8000) {
    if (!asset?.downloadUrl) return Promise.resolve(false);
    return new Promise((resolve) => {
        const node = document.createElement(asset.kind === 'image' ? 'img' : (asset.kind === 'video' ? 'video' : 'audio'));
        const successEvent = asset.kind === 'image' ? 'load' : 'loadedmetadata';
        const timer = setTimeout(() => finish(false), timeoutMs);
        const finish = (ok) => {
            clearTimeout(timer);
            node.removeAttribute('src');
            node.load?.();
            resolve(ok);
        };
        node.addEventListener(successEvent, () => finish(true), { once: true });
        node.addEventListener('error', () => finish(false), { once: true });
        node.src = asset.downloadUrl;
        if (asset.kind !== 'image') node.load();
    });
}

export function initMediaEditor({ container, state, mediaService = invitationMediaService }) {
    if (!container || !state) return () => {};
    const registry = new MediaObjectUrlRegistry();
    const storageStatus = mediaService.getStatus();
    const activity = {};
    const savingIds = new Set();
    let persistedMedia = structuredClone(state.getSnapshot().draft.media);
    let applyingPersistenceResult = false;
    let disposed = false;

    const render = (snapshot = state.getSnapshot()) => {
        if (disposed) return;
        const scroller = document.getElementById('builder-editor');
        const scrollTop = scroller?.scrollTop ?? 0;
        const fragment = document.createDocumentFragment();
        const notice = document.createElement('aside');
        notice.className = `media-storage-notice ${storageStatus.canUpload ? 'is-enabled' : 'is-pending'}`;
        const noticeCopy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = storageStatus.canUpload ? 'Persistencia multimedia' : 'Preview local segura';
        const description = document.createElement('p');
        description.textContent = storageStatus.message;
        noticeCopy.append(title, description);
        notice.append(noticeCopy);
        if (storageStatus.canUpload) {
            const controls = document.createElement('div');
            controls.className = 'media-save-controls';
            const summary = document.createElement('small');
            summary.dataset.mediaUploadSummary = '';
            const pending = [...registry.entries.keys()].filter((id) => !findAsset(state.getSnapshot().draft.media, id)?.storagePath).length;
            summary.textContent = pending ? `${pending} archivo${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'}` : 'Metadata lista para sincronizar';
            const save = button('Guardar multimedia', 'save-media', '', 'is-primary');
            save.disabled = !snapshot.ui.mediaDirty || savingIds.size > 0;
            controls.append(summary, save);
            notice.append(controls);
        }
        fragment.append(notice);
        ['cover', 'gallery', 'place', ...(snapshot.draft.themeId === 'aloha' ? ['dressCode'] : []), 'video', 'videoPoster', 'music'].forEach((role) => {
            fragment.append(createRoleSection(role, snapshot, activity, { storageStatus, registry, savingIds }));
        });
        container.replaceChildren(fragment);
        if (scroller) scroller.scrollTop = scrollTop;
    };

    const showMessage = (role, message, stateName = 'error') => {
        const target = container.querySelector(`[data-media-message="${role}"]`);
        if (!target) return;
        target.textContent = message;
        target.dataset.state = stateName;
        target.hidden = false;
    };

    const processFile = async (file, role, replaceId = '') => {
        activity[role] = 'Validando archivo…';
        render();
        try {
            const processed = await inspectAndProcessMediaFile(file, role, {
                onProgress: (progress) => {
                    activity[role] = `Procesando… ${Math.round(progress)}%`;
                    const target = container.querySelector(`[data-media-role="${role}"] .media-processing`);
                    if (target) target.textContent = activity[role];
                }
            });
            let assetId = replaceId;
            if (!assetId) {
                const added = state.addMediaAsset(role, metadataFromProcessed(role, file, processed));
                if (!added.ok) throw new Error(added.code);
                assetId = added.entity.id;
            }
            const previewUrl = registry.set(assetId, processed.file);
            const currentAsset = findAsset(state.getSnapshot().draft.media, assetId);
            const metadata = metadataFromProcessed(role, file, processed, previewUrl);
            const update = replaceId
                ? state.replaceMediaAssetWithNewId(assetId, {
                    ...metadata,
                    alt: currentAsset?.alt,
                    caption: currentAsset?.caption,
                    focalPoint: currentAsset?.focalPoint
                })
                : state.replaceMediaAsset(assetId, {
                ...metadata,
                alt: metadata.alt,
                caption: '',
                focalPoint: { x: 50, y: 50 }
            });
            if (!update.ok) throw new Error(update.code);
            assetId = update.entity.id;
            if (replaceId) {
                registry.revoke(replaceId);
                const replacementPreviewUrl = registry.set(assetId, processed.file);
                const previewUpdate = state.replaceMediaAsset(assetId, { previewUrl: replacementPreviewUrl });
                if (!previewUpdate.ok) throw new Error(previewUpdate.code);
            }
            delete activity[role];
            render();
            if (role === 'place' && storageStatus.canUpload) await saveMedia([assetId]);
        } catch (error) {
            delete activity[role];
            render();
            showMessage(role, friendlyMediaError(error));
        }
    };

    const handleFiles = async (role, sourceFiles, replaceId = '') => {
        const files = [...sourceFiles];
        if (!files.length) return;
        if (['gallery', 'place'].includes(role)) {
            if (replaceId) return processFile(files[0], role, replaceId);
            const availableSlots = 20 - (state.getSnapshot().draft.media[role]?.length ?? 0);
            if (files.length > availableSlots) showMessage(role, `Solo se procesarán ${availableSlots} archivos para respetar el límite técnico.`);
            for (const [index, file] of files.slice(0, availableSlots).entries()) {
                activity[role] = `Procesando ${index + 1} de ${Math.min(files.length, availableSlots)}…`;
                render();
                await processFile(file, role);
            }
            return;
        }
        const current = state.getSnapshot().draft.media[role];
        await processFile(files[0], role, replaceId || current?.id || '');
    };

    const saveMedia = async (onlyAssetIds = null) => {
        if (!storageStatus.canUpload || savingIds.size) return;
        const ids = onlyAssetIds ? new Set(onlyAssetIds) : null;
        const files = [...registry.entries]
            .filter(([assetId]) => !ids || ids.has(assetId))
            .map(([assetId, { file }]) => ({ assetId, file }));
        files.forEach(({ assetId }) => savingIds.add(assetId));
        render();
        const before = state.getSnapshot().draft.media;
        try {
            const result = await mediaService.saveMedia({
                eventId: state.getSnapshot().draft.eventId,
                media: before,
                persistedMedia,
                files,
                schemaVersion: state.getSnapshot().draft.schemaVersion,
                concurrency: 3,
                onProgress: ({ assetId, assetProgress, completed, total, state: uploadState }) => {
                    const meter = container.querySelector(`[data-upload-meter="${assetId}"]`);
                    const value = container.querySelector(`[data-upload-value="${assetId}"]`);
                    const summary = container.querySelector('[data-media-upload-summary]');
                    if (meter) {
                        meter.value = assetProgress;
                        meter.setAttribute('aria-label', `Subiendo: ${Math.round(assetProgress)}%`);
                    }
                    if (value) value.textContent = `${Math.round(assetProgress)}%`;
                    if (summary && total) summary.textContent = `${completed} de ${total} subidas${uploadState === 'error' ? ' · revisa errores' : ''}`;
                }
            });
            let runtimeMedia = structuredClone(result.media);
            const transitioned = [];
            for (const assetId of result.uploadedAssetIds) {
                const uploaded = findAsset(runtimeMedia, assetId);
                const cloudReady = await waitForCloudPreview(uploaded);
                if (cloudReady) transitioned.push(assetId);
                else if (uploaded && registry.get(assetId)) {
                    runtimeMedia = replaceAsset(runtimeMedia, {
                        ...uploaded,
                        previewUrl: registry.get(assetId).previewUrl,
                        status: 'error',
                        error: 'El archivo se guardó, pero la vista cloud no pudo cargarse. Se conserva el preview local.'
                    });
                }
            }
            for (const { assetId, code, stage, firebaseCode } of result.uploadErrors) {
                const local = findAsset(before, assetId);
                const error = { code, firebaseCode, stage: stage || result.persistenceStage || 'storage-upload' };
                reportPersistenceDiagnostic(error, local);
                if (local) runtimeMedia = replaceAsset(runtimeMedia, { ...local, status: 'error', error: persistenceMessage(error, local) });
            }
            for (const asset of getAllMediaAssets(before)) {
                if (!asset.storagePath && !result.uploadedAssetIds.includes(asset.id) && !result.uploadErrors.some(({ assetId }) => assetId === asset.id)) {
                    runtimeMedia = replaceAsset(runtimeMedia, asset);
                }
            }
            persistedMedia = structuredClone(result.media);
            applyingPersistenceResult = true;
            try {
                state.hydrateMedia(runtimeMedia, { persisted: true });
            } finally {
                applyingPersistenceResult = false;
            }
            transitioned.forEach((assetId) => registry.revoke(assetId));
            if (getAllMediaAssets(runtimeMedia).some((asset) => !asset.storagePath)) state.markMediaPending();
            if (result.replacementCleanupFailures) {
                const role = findAsset(before, result.uploadedAssetIds[0])?.role ?? 'cover';
                showMessage(role, 'La nueva versión quedó guardada, pero un archivo reemplazado requiere limpieza futura.', 'warning');
            }
            for (const { assetId, code, stage, firebaseCode } of result.uploadErrors) {
                const local = findAsset(before, assetId);
                showMessage(local?.role ?? 'cover', persistenceMessage({ code, firebaseCode, stage: stage || result.persistenceStage || 'storage-upload' }, local));
            }
        } catch (error) {
            for (const assetId of savingIds) {
                const asset = findAsset(state.getSnapshot().draft.media, assetId);
                if (asset) state.updateMediaAsset(assetId, { status: 'error', error: persistenceMessage(error, asset) });
            }
            const role = findAsset(before, [...savingIds][0])?.role ?? 'cover';
            reportPersistenceDiagnostic(error, findAsset(before, [...savingIds][0]));
            render();
            showMessage(role, persistenceMessage(error, findAsset(before, [...savingIds][0])));
        } finally {
            savingIds.clear();
            render();
        }
    };

    const removeAsset = async (assetId) => {
        const snapshot = state.getSnapshot();
        const current = findAsset(snapshot.draft.media, assetId);
        const persisted = findAsset(persistedMedia, assetId);
        if (!current) return;
        if (persisted?.storagePath && storageStatus.canDelete) {
            if (typeof window.confirm === 'function' && !window.confirm('¿Eliminar este archivo de Storage y de la multimedia guardada?')) return;
            try {
                const result = await mediaService.deleteAsset({
                    eventId: snapshot.draft.eventId,
                    asset: persisted,
                    media: snapshot.draft.media,
                    persistedMedia,
                    schemaVersion: snapshot.draft.schemaVersion
                });
                persistedMedia = structuredClone(result.media);
                const removed = state.removeMediaAsset(assetId);
                if (removed.ok) registry.revoke(assetId);
                state.markMediaPersisted();
            } catch (error) {
                if (error.metadataDeleted) {
                    persistedMedia = withoutAsset(persistedMedia, assetId);
                    const removed = state.removeMediaAsset(assetId);
                    if (removed.ok) registry.revoke(assetId);
                    state.markMediaPersisted();
                }
                render();
                showMessage(current.role, error.metadataDeleted
                    ? 'La referencia se eliminó correctamente, pero el archivo quedó huérfano en Storage y requiere limpieza futura.'
                    : friendlyPersistenceError(error));
            }
            return;
        }
        const removed = state.removeMediaAsset(assetId);
        if (removed.ok) registry.revoke(assetId);
    };

    const onChange = (event) => {
        const input = event.target.closest('[data-media-file]');
        if (input) {
            void handleFiles(input.dataset.mediaFile, input.files ?? [], input.dataset.replaceId ?? '');
            return;
        }
        const mediaField = event.target.closest('[data-media-field]');
        if (mediaField) state.updateMediaAsset(mediaField.dataset.assetId, { [mediaField.dataset.mediaField]: mediaField.value });
        const focal = event.target.closest('[data-media-focal]');
        if (focal) state.updateMediaAsset(focal.dataset.assetId, { focalPoint: { [focal.dataset.mediaFocal]: Number(focal.value) } });
    };

    const onClick = (event) => {
        const action = event.target.closest('[data-media-action]');
        if (!action || action.disabled) return;
        const assetId = action.dataset.assetId;
        if (action.dataset.mediaAction === 'remove') void removeAsset(assetId);
        if (action.dataset.mediaAction === 'up' || action.dataset.mediaAction === 'down') state.moveGalleryAsset(assetId, action.dataset.mediaAction);
        if (action.dataset.mediaAction === 'upload') void saveMedia([assetId]);
        if (action.dataset.mediaAction === 'save-media') void saveMedia();
        if (action.dataset.mediaAction === 'cancel-upload') mediaService.cancelUpload(assetId);
    };

    const onDragOver = (event) => {
        const zone = event.target.closest('[data-media-drop]');
        if (!zone || zone.getAttribute('aria-disabled') === 'true') return;
        event.preventDefault();
        zone.classList.add('is-dragover');
    };
    const onDragLeave = (event) => event.target.closest('[data-media-drop]')?.classList.remove('is-dragover');
    const onDrop = (event) => {
        const zone = event.target.closest('[data-media-drop]');
        if (!zone || zone.getAttribute('aria-disabled') === 'true') return;
        event.preventDefault();
        zone.classList.remove('is-dragover');
        void handleFiles(zone.dataset.mediaDrop, event.dataTransfer?.files ?? []);
    };
    const onBeforeUnload = (event) => {
        const media = state.getSnapshot().draft.media;
        const hasLocalPending = [...registry.entries.keys()].some((assetId) => !findAsset(media, assetId)?.storagePath);
        if (!hasLocalPending) return;
        event.preventDefault();
        event.returnValue = '';
    };

    container.addEventListener('change', onChange);
    container.addEventListener('click', onClick);
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('dragleave', onDragLeave);
    container.addEventListener('drop', onDrop);
    window.addEventListener('beforeunload', onBeforeUnload);
    render();
    const unsubscribe = state.subscribe(({ snapshot, reason }) => {
        if (reason === 'initialized' || (reason === 'media-hydrated' && !applyingPersistenceResult)) {
            persistedMedia = structuredClone(snapshot.draft.media);
        }
        if (['initialized', 'package-changed', 'sections-changed', 'media-changed', 'media-hydrated', 'media-persisted', 'media-pending'].includes(reason)) render(snapshot);
    }, { source: 'media-editor' });
    return () => {
        disposed = true;
        unsubscribe();
        container.removeEventListener('change', onChange);
        container.removeEventListener('click', onClick);
        container.removeEventListener('dragover', onDragOver);
        container.removeEventListener('dragleave', onDragLeave);
        container.removeEventListener('drop', onDrop);
        window.removeEventListener('beforeunload', onBeforeUnload);
        registry.revokeAll();
    };
}
