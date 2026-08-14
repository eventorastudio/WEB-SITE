import { getMediaRoleAvailability, getMediaAssetSource } from '../core/media-schema.js?v=phase4-media-20260813';
import { MediaObjectUrlRegistry } from '../core/media-runtime.js?v=phase4-media-20260813';
import { friendlyMediaError, inspectAndProcessMediaFile } from '../core/media-processor.js?v=phase4-media-20260813';
import { getInvitationMediaStorageStatus } from '../services/invitation-media-service.js?v=phase4-media-20260813';

const ROLE_COPY = Object.freeze({
    cover: Object.freeze({ title: 'Portada / hero', copy: 'JPEG, PNG o WebP. Se optimiza localmente y conserva un punto focal por invitación.', accept: 'image/jpeg,image/png,image/webp' }),
    gallery: Object.freeze({ title: 'Galería', copy: 'Selección múltiple, orden estable, alt y caption. Límite técnico: 20 imágenes.', accept: 'image/jpeg,image/png,image/webp' }),
    video: Object.freeze({ title: 'Video de bienvenida', copy: 'MP4 o WebM, hasta 80 MiB y 5 minutos. Nunca inicia automáticamente.', accept: 'video/mp4,video/webm' }),
    videoPoster: Object.freeze({ title: 'Poster del video', copy: 'Imagen opcional para presentar el video antes de reproducirlo.', accept: 'image/jpeg,image/png,image/webp' }),
    music: Object.freeze({ title: 'Música', copy: 'MP3, M4A/AAC u OGG, hasta 20 MiB y 15 minutos. Reproducción manual.', accept: 'audio/mpeg,audio/mp4,audio/aac,audio/ogg' })
});

function roleAssets(media, role) {
    return role === 'gallery' ? (media.gallery ?? []) : [media[role]].filter(Boolean);
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
        wrap.textContent = asset.status === 'processing' ? 'Procesando…' : 'Vista local no disponible';
        return wrap;
    }
    if (asset.kind === 'image') {
        const image = document.createElement('img');
        image.src = source;
        image.alt = asset.alt || '';
        image.style.objectPosition = `${asset.focalPoint.x}% ${asset.focalPoint.y}%`;
        wrap.append(image);
    } else {
        const media = document.createElement(asset.kind === 'video' ? 'video' : 'audio');
        media.src = source;
        media.controls = true;
        media.preload = 'metadata';
        if (asset.kind === 'video') media.playsInline = true;
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

function createAssetCard(asset, role, index, total, storageStatus) {
    const card = document.createElement('article');
    card.className = 'media-asset-card';
    card.dataset.assetId = asset.id;
    const header = document.createElement('header');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = role === 'gallery' ? `Imagen ${index + 1}` : ROLE_COPY[role].title;
    const meta = document.createElement('small');
    meta.textContent = fileLabel(asset);
    copy.append(title, meta);
    const badge = document.createElement('span');
    badge.className = `media-status media-status-${asset.status}`;
    badge.textContent = asset.status === 'ready' ? 'LISTO LOCAL' : asset.status.toUpperCase();
    header.append(copy, badge);

    const body = document.createElement('div');
    body.className = 'media-asset-body';
    body.append(buildMediaPreview(asset));
    if (['processing', 'uploading'].includes(asset.status)) {
        const progress = document.createElement('div');
        progress.className = 'media-asset-progress';
        const label = document.createElement('span');
        label.textContent = asset.status === 'uploading' ? 'Subiendo' : 'Procesando';
        const meter = document.createElement('progress');
        meter.max = 100;
        meter.value = asset.uploadProgress;
        meter.setAttribute('aria-label', `${label.textContent}: ${Math.round(asset.uploadProgress)}%`);
        const value = document.createElement('small');
        value.textContent = `${Math.round(asset.uploadProgress)}%`;
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
    if (role === 'gallery') fields.append(field('Caption opcional', 'caption', asset, { multiline: true }));
    if (role === 'cover') {
        const focal = document.createElement('div');
        focal.className = 'media-focal-fields';
        ['x', 'y'].forEach((axis) => {
            const label = document.createElement('label');
            label.innerHTML = `<span>Foco ${axis.toUpperCase()}</span>`;
            const range = document.createElement('input');
            range.type = 'range';
            range.min = '0';
            range.max = '100';
            range.value = String(asset.focalPoint[axis]);
            range.dataset.mediaFocal = axis;
            range.dataset.assetId = asset.id;
            label.append(range);
            focal.append(label);
        });
        fields.append(focal);
    }
    body.append(fields);

    const actions = document.createElement('footer');
    if (role === 'gallery') {
        const up = button('↑', 'up', asset.id, 'media-icon-action');
        const down = button('↓', 'down', asset.id, 'media-icon-action');
        up.disabled = index === 0;
        down.disabled = index === total - 1;
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
    replacement.append(replacementInput);
    const upload = button('Subir a Storage', 'upload', asset.id);
    upload.disabled = !storageStatus.canUpload;
    upload.title = storageStatus.message;
    actions.append(replacement, upload, button('Eliminar', 'remove', asset.id, 'is-danger'));
    body.append(actions);
    card.append(header, body);
    return card;
}

function createRoleSection(role, snapshot, activity, storageStatus) {
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
    description.textContent = ROLE_COPY[role].copy;
    copy.append(title, description);
    const state = document.createElement('span');
    state.className = 'media-role-badge';
    state.textContent = !availability.packageAllowed
        ? 'NO INCLUIDO'
        : (!availability.sectionEnabled ? 'SECCIÓN INACTIVA' : 'DISPONIBLE');
    header.append(copy, state);
    section.append(header);

    if (!availability.editable) {
        const retained = document.createElement('p');
        retained.className = 'media-retained-note';
        retained.textContent = assets.length
            ? 'El recurso permanece conservado en el borrador y reaparecerá al restaurar el paquete o la sección.'
            : 'Activa la sección y usa un paquete compatible para configurar este recurso.';
        section.append(retained);
    }

    const controls = document.createElement('div');
    controls.className = 'media-role-controls';
    const chooser = document.createElement('label');
    chooser.className = 'media-file-button is-primary';
    chooser.textContent = role === 'gallery' ? 'Agregar imágenes' : (assets.length ? 'Reemplazar archivo' : 'Seleccionar archivo');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ROLE_COPY[role].accept;
    input.multiple = role === 'gallery';
    input.disabled = !availability.editable || (role === 'gallery' && assets.length >= 20);
    input.dataset.mediaFile = role;
    if (assets.length && role !== 'gallery') input.dataset.replaceId = assets[0].id;
    chooser.append(input);
    controls.append(chooser);
    if (role === 'gallery' && assets.length) {
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
    dropZone.setAttribute('aria-disabled', String(!availability.editable));
    dropZone.textContent = availability.editable
        ? (role === 'gallery' ? 'Arrastra aquí una o varias imágenes' : 'Arrastra aquí un archivo compatible')
        : 'Carga bloqueada por paquete o sección';
    section.append(dropZone);

    const message = document.createElement('p');
    message.className = 'media-role-message';
    message.dataset.mediaMessage = role;
    message.hidden = true;
    section.append(message);
    const list = document.createElement('div');
    list.className = role === 'gallery' ? 'media-gallery-list' : 'media-single-list';
    assets.forEach((asset, index) => list.append(createAssetCard(asset, role, index, assets.length, storageStatus)));
    if (!assets.length) {
        const empty = document.createElement('p');
        empty.className = 'media-empty';
        empty.textContent = 'Sin archivo configurado. La plantilla conserva su demo hasta que selecciones o elimines explícitamente este rol.';
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
        caption: '',
        previewUrl,
        storagePath: '',
        downloadUrl: '',
        status: previewUrl ? 'ready' : 'local',
        uploadProgress: 0,
        error: ''
    };
}

export function initMediaEditor({ container, state }) {
    if (!container || !state) return () => {};
    const registry = new MediaObjectUrlRegistry();
    const storageStatus = getInvitationMediaStorageStatus();
    const activity = {};
    let disposed = false;

    const render = (snapshot = state.getSnapshot()) => {
        if (disposed) return;
        const scroller = document.getElementById('builder-editor');
        const scrollTop = scroller?.scrollTop ?? 0;
        const fragment = document.createDocumentFragment();
        const notice = document.createElement('aside');
        notice.className = 'media-storage-notice';
        notice.innerHTML = '<strong>Preview local segura</strong><p></p>';
        notice.querySelector('p').textContent = storageStatus.message;
        fragment.append(notice);
        ['cover', 'gallery', 'video', 'videoPoster', 'music'].forEach((role) => {
            fragment.append(createRoleSection(role, snapshot, activity, storageStatus));
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
            const currentAsset = state.getSnapshot().draft.media.gallery.find(({ id }) => id === assetId)
                ?? ['cover', 'video', 'videoPoster', 'music'].map((key) => state.getSnapshot().draft.media[key]).find((asset) => asset?.id === assetId);
            const update = state.replaceMediaAsset(assetId, {
                ...metadataFromProcessed(role, file, processed, previewUrl),
                alt: replaceId ? currentAsset?.alt : metadataFromProcessed(role, file, processed).alt,
                caption: replaceId ? currentAsset?.caption : '',
                focalPoint: replaceId ? currentAsset?.focalPoint : { x: 50, y: 50 }
            });
            if (!update.ok) throw new Error(update.code);
            delete activity[role];
            render();
        } catch (error) {
            delete activity[role];
            render();
            showMessage(role, friendlyMediaError(error));
        }
    };

    const handleFiles = async (role, sourceFiles, replaceId = '') => {
        const files = [...sourceFiles];
        if (!files.length) return;
        if (role === 'gallery') {
            const availableSlots = 20 - (state.getSnapshot().draft.media.gallery?.length ?? 0);
            if (files.length > availableSlots) showMessage(role, `Solo se procesarán ${availableSlots} archivos para respetar el límite técnico.`);
            for (const [index, file] of files.slice(0, availableSlots).entries()) {
                activity.gallery = `Procesando ${index + 1} de ${Math.min(files.length, availableSlots)}…`;
                render();
                await processFile(file, role);
            }
            return;
        }
        const current = state.getSnapshot().draft.media[role];
        await processFile(files[0], role, replaceId || current?.id || '');
    };

    const handleFileInput = async (input) => {
        await handleFiles(input.dataset.mediaFile, input.files ?? [], input.dataset.replaceId ?? '');
    };

    const onChange = (event) => {
        const input = event.target.closest('[data-media-file]');
        if (input) {
            void handleFileInput(input);
            return;
        }
        const field = event.target.closest('[data-media-field]');
        if (field) state.updateMediaAsset(field.dataset.assetId, { [field.dataset.mediaField]: field.value });
        const focal = event.target.closest('[data-media-focal]');
        if (focal) state.updateMediaAsset(focal.dataset.assetId, { focalPoint: { [focal.dataset.mediaFocal]: Number(focal.value) } });
    };

    const onClick = (event) => {
        const action = event.target.closest('[data-media-action]');
        if (!action || action.disabled) return;
        const assetId = action.dataset.assetId;
        if (action.dataset.mediaAction === 'remove') {
            const removed = state.removeMediaAsset(assetId);
            if (removed.ok) registry.revoke(assetId);
        }
        if (action.dataset.mediaAction === 'up' || action.dataset.mediaAction === 'down') {
            state.moveGalleryAsset(assetId, action.dataset.mediaAction);
        }
    };

    const onDragOver = (event) => {
        const zone = event.target.closest('[data-media-drop]');
        if (!zone || zone.getAttribute('aria-disabled') === 'true') return;
        event.preventDefault();
        zone.classList.add('is-dragover');
    };

    const onDragLeave = (event) => {
        event.target.closest('[data-media-drop]')?.classList.remove('is-dragover');
    };

    const onDrop = (event) => {
        const zone = event.target.closest('[data-media-drop]');
        if (!zone || zone.getAttribute('aria-disabled') === 'true') return;
        event.preventDefault();
        zone.classList.remove('is-dragover');
        void handleFiles(zone.dataset.mediaDrop, event.dataTransfer?.files ?? []);
    };

    container.addEventListener('change', onChange);
    container.addEventListener('click', onClick);
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('dragleave', onDragLeave);
    container.addEventListener('drop', onDrop);
    render();
    const unsubscribe = state.subscribe(({ snapshot, reason }) => {
        if (['initialized', 'package-changed', 'sections-changed', 'media-changed'].includes(reason)) render(snapshot);
    }, { source: 'media-editor' });
    return () => {
        disposed = true;
        unsubscribe();
        container.removeEventListener('change', onChange);
        container.removeEventListener('click', onClick);
        container.removeEventListener('dragover', onDragOver);
        container.removeEventListener('dragleave', onDragLeave);
        container.removeEventListener('drop', onDrop);
        registry.revokeAll();
    };
}
