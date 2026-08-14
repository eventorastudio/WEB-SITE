import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { InvitationBuilderState, createInvitationDraft } from '../admin/invitations/core/builder-state.js';
import {
    MEDIA_MIME_POLICY,
    MEDIA_ROLE_REGISTRY,
    createEmptyInvitationMedia,
    sniffMediaMimeType,
    validateMediaSignature
} from '../admin/invitations/core/media-schema.js';
import { MediaObjectUrlRegistry } from '../admin/invitations/core/media-runtime.js';
import {
    TEMPLATE_BINDING_REGISTRY,
    applyTemplateContentBindings,
    prepareBuilderTemplate
} from '../admin/invitations/core/template-binding-registry.js';
import { COLLECTION_THEMES } from '../admin/invitations/core/theme-registry.js';
import {
    buildInvitationMediaStoragePath,
    getInvitationMediaStorageStatus,
    startInvitationMediaUpload
} from '../admin/invitations/services/invitation-media-service.js';
import { initMediaEditor } from '../admin/invitations/editors/media-editor.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function imageSeed(role, suffix = '1') {
    return {
        role,
        originalName: `foto-${suffix}.webp`,
        mimeType: 'image/webp',
        size: 120_000,
        width: 1200,
        height: 1500,
        previewUrl: `blob:https://eventora.local/${suffix}`,
        status: 'ready',
        alt: `Foto ${suffix}`
    };
}

function readyDraft() {
    const draft = createInvitationDraft('EVT-0001', { nombreEvento: 'Evento', fecha: '2027-11-15' });
    draft.packageId = 'premium';
    draft.themeId = 'champagne';
    draft.enabledSections = ['gallery', 'welcome-video', 'music'];
    draft.media.cover = { id: 'MED-LOCAL-001', ...imageSeed('cover', 'cover'), focalPoint: { x: 35, y: 65 }, caption: '', duration: 0, storagePath: '', downloadUrl: '', uploadProgress: 0, error: '', sortOrder: 0, kind: 'image' };
    draft.media.gallery = [
        { id: 'MED-LOCAL-002', ...imageSeed('gallery', 'gallery-1'), focalPoint: { x: 50, y: 50 }, caption: 'Primera', duration: 0, storagePath: '', downloadUrl: '', uploadProgress: 0, error: '', sortOrder: 0, kind: 'image' },
        { id: 'MED-LOCAL-003', ...imageSeed('gallery', 'gallery-2'), focalPoint: { x: 50, y: 50 }, caption: '', duration: 0, storagePath: '', downloadUrl: '', uploadProgress: 0, error: '', sortOrder: 1, kind: 'image' }
    ];
    draft.media.video = {
        id: 'MED-LOCAL-004', role: 'video', kind: 'video', originalName: 'bienvenida.mp4', mimeType: 'video/mp4', size: 2_000_000,
        width: 1920, height: 1080, duration: 40, alt: '', caption: '', storagePath: '', downloadUrl: '', previewUrl: 'blob:https://eventora.local/video',
        status: 'ready', uploadProgress: 0, error: '', focalPoint: { x: 50, y: 50 }, sortOrder: 0
    };
    draft.media.music = {
        id: 'MED-LOCAL-005', role: 'music', kind: 'audio', originalName: 'cancion.mp3', mimeType: 'audio/mpeg', size: 1_000_000,
        width: 0, height: 0, duration: 120, alt: '', caption: '', storagePath: '', downloadUrl: '', previewUrl: 'blob:https://eventora.local/audio',
        status: 'ready', uploadProgress: 0, error: '', focalPoint: { x: 50, y: 50 }, sortOrder: 0
    };
    draft.meta.touchedMediaRoles = ['cover', 'gallery', 'video', 'music'];
    return draft;
}

test('el contrato multimedia es semántico, serializable y no contiene binarios ni Base64', () => {
    const media = createEmptyInvitationMedia();
    assert.deepEqual(Object.keys(media), ['schemaVersion', 'cover', 'gallery', 'video', 'videoPoster', 'music']);
    assert.equal(MEDIA_ROLE_REGISTRY.gallery.technicalMaxItems, 20);
    assert.deepEqual(MEDIA_MIME_POLICY.image, ['image/jpeg', 'image/png', 'image/webp']);
    const serialized = JSON.stringify(readyDraft());
    assert.doesNotMatch(serialized, /data:/i);
    assert.doesNotMatch(serialized, /base64/i);
    assert.doesNotMatch(serialized, /\"file\"|\"blob\"/i);
});

test('firma real y MIME deben coincidir con la política', () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const webp = Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);
    assert.equal(sniffMediaMimeType(jpeg), 'image/jpeg');
    assert.equal(sniffMediaMimeType(png), 'image/png');
    assert.equal(sniffMediaMimeType(webp), 'image/webp');
    assert.deepEqual(validateMediaSignature({ declaredMime: 'image/jpeg', detectedMime: 'image/jpeg', kind: 'image' }), { ok: true });
    assert.equal(validateMediaSignature({ declaredMime: 'image/jpeg', detectedMime: 'image/png', kind: 'image' }).code, 'media/mime-signature-mismatch');
    assert.equal(validateMediaSignature({ declaredMime: 'image/svg+xml', detectedMime: '', kind: 'image' }).code, 'media/mime-not-allowed');
});

test('object URLs se revocan al reemplazar, eliminar y destruir', () => {
    const created = [];
    const revoked = [];
    const registry = new MediaObjectUrlRegistry({
        urlApi: {
            createObjectURL: (file) => { const url = `blob:test/${file.name}/${created.length}`; created.push(url); return url; },
            revokeObjectURL: (url) => revoked.push(url)
        }
    });
    registry.set('MED-LOCAL-001', { name: 'uno.webp' });
    registry.set('MED-LOCAL-001', { name: 'dos.webp' });
    registry.set('MED-LOCAL-002', { name: 'tres.webp' });
    registry.revoke('MED-LOCAL-002');
    registry.revokeAll();
    assert.deepEqual([...revoked].sort(), [...created].sort());
    assert.equal(registry.entries.size, 0);
});

test('estado conserva IDs, orden y datos ante reemplazo, toggle, tema y downgrade/upgrade', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Evento', fecha: '2027-11-15' });
    state.setPackage('premium');
    state.toggleSection('gallery', true);
    state.setTheme('champagne');
    const first = state.addMediaAsset('gallery', imageSeed('gallery', '1')).entity;
    const second = state.addMediaAsset('gallery', imageSeed('gallery', '2')).entity;
    assert.equal(first.id, 'MED-LOCAL-001');
    assert.equal(second.id, 'MED-LOCAL-002');
    state.moveGalleryAsset(second.id, 'up');
    assert.deepEqual(state.getSnapshot().draft.media.gallery.map(({ id, sortOrder }) => [id, sortOrder]), [[second.id, 0], [first.id, 1]]);
    state.replaceMediaAsset(first.id, imageSeed('gallery', 'reemplazo'));
    assert.equal(state.getSnapshot().draft.media.gallery.find(({ id }) => id === first.id).originalName, 'foto-reemplazo.webp');
    state.toggleSection('gallery', false);
    state.setPackage('esencial');
    state.setTheme('luxury');
    assert.equal(state.getSnapshot().draft.media.gallery.length, 2);
    state.setPackage('premium');
    state.toggleSection('gallery', true);
    assert.equal(state.getSnapshot().draft.media.gallery.length, 2);
});

test('roles Premium quedan bloqueados en Esencial sin borrar recursos previos', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Evento', fecha: '2027-11-15' });
    state.setPackage('esencial');
    assert.deepEqual(state.addMediaAsset('gallery', imageSeed('gallery')), { ok: false, code: 'builder/media-not-allowed' });
    assert.equal(state.toggleSection('music', true).ok, true);
    const music = state.addMediaAsset('music', {
        role: 'music', originalName: 'audio.mp3', mimeType: 'audio/mpeg', size: 1000, duration: 20, previewUrl: 'blob:https://eventora.local/music', status: 'ready'
    });
    assert.equal(music.ok, true);
});

test('galería soporta 1, 6 y máximo técnico 20 sin reutilizar IDs', () => {
    const state = new InvitationBuilderState();
    state.initialize('EVT-0001', { nombreEvento: 'Evento', fecha: '2027-11-15' });
    state.setPackage('premium');
    state.toggleSection('gallery', true);
    for (let index = 1; index <= 20; index += 1) {
        const added = state.addMediaAsset('gallery', imageSeed('gallery', String(index)));
        assert.equal(added.ok, true);
        if (index === 1) assert.equal(state.getSnapshot().draft.media.gallery.length, 1);
        if (index === 6) assert.equal(state.getSnapshot().draft.media.gallery.length, 6);
    }
    assert.deepEqual(state.addMediaAsset('gallery', imageSeed('gallery', '21')), { ok: false, code: 'builder/media-gallery-limit' });
    const removedId = state.getSnapshot().draft.media.gallery[5].id;
    state.removeMediaAsset(removedId);
    const replacement = state.addMediaAsset('gallery', imageSeed('gallery', 'nuevo'));
    assert.equal(replacement.entity.id, 'MED-LOCAL-021');
    assert.equal(state.getSnapshot().draft.media.gallery.length, 20);
});

test('los once adapters reemplazan media real sin autoplay y conservan el demo untouched', async () => {
    for (const theme of COLLECTION_THEMES) {
        const html = await readFile(path.join(ROOT, theme.templatePath.replace(/^\//, '')), 'utf8');
        const untouchedDom = new JSDOM(html, { url: 'https://eventora.local/' });
        const untouchedDraft = createInvitationDraft('EVT-0001', { nombreEvento: 'Evento', fecha: '2027-11-15' });
        prepareBuilderTemplate(untouchedDom.window.document, theme.id);
        applyTemplateContentBindings(untouchedDom.window.document, theme.id, untouchedDraft);
        assert.equal(untouchedDom.window.document.querySelectorAll('[data-builder-phase4]').length, 0, `${theme.id}: demo untouched`);

        const dom = new JSDOM(html, { url: 'https://eventora.local/' });
        const draft = readyDraft();
        draft.themeId = theme.id;
        prepareBuilderTemplate(dom.window.document, theme.id);
        applyTemplateContentBindings(dom.window.document, theme.id, draft);
        const adapter = TEMPLATE_BINDING_REGISTRY[theme.id];
        const cover = dom.window.document.querySelector(adapter.media.cover);
        assert.ok(cover?.src.startsWith('blob:'), `${theme.id}: portada`);
        assert.equal(cover.style.objectPosition, '35% 65%', `${theme.id}: punto focal`);
        assert.equal(dom.window.document.querySelectorAll('[data-builder-phase4="gallery"] img').length, 2, `${theme.id}: galería`);
        const video = dom.window.document.querySelector('[data-builder-phase4="video"] video');
        const audio = dom.window.document.querySelector('[data-builder-phase4="music"] audio');
        assert.ok(video?.controls, `${theme.id}: video con controles`);
        assert.equal(video?.hasAttribute('autoplay'), false, `${theme.id}: video sin autoplay`);
        assert.ok(audio?.controls, `${theme.id}: audio con controles`);
        assert.equal(audio?.hasAttribute('autoplay'), false, `${theme.id}: audio sin autoplay`);
    }
});

test('explicit clear no restaura media demo y Data URLs nunca se renderizan', async () => {
    const theme = COLLECTION_THEMES.find(({ id }) => id === 'champagne');
    const html = await readFile(path.join(ROOT, theme.templatePath.replace(/^\//, '')), 'utf8');
    const dom = new JSDOM(html, { url: 'https://eventora.local/' });
    const draft = readyDraft();
    draft.media.cover = null;
    draft.media.gallery = [{
        ...draft.media.gallery[0],
        previewUrl: 'data:image/png;base64,AAAA',
        downloadUrl: ''
    }];
    prepareBuilderTemplate(dom.window.document, theme.id);
    applyTemplateContentBindings(dom.window.document, theme.id, draft);
    const cover = dom.window.document.querySelector(TEMPLATE_BINDING_REGISTRY.champagne.media.cover);
    assert.equal(cover.hidden, true);
    assert.equal(dom.window.document.querySelectorAll('[data-builder-phase4="gallery"] img').length, 0);
    assert.equal(dom.window.document.documentElement.outerHTML.includes('data:image/png'), false);
});

test('Storage permanece bloqueado y las rutas preparadas son deterministas y acotadas', () => {
    const status = getInvitationMediaStorageStatus();
    assert.equal(status.canUpload, false);
    assert.equal(status.mode, 'blocked');
    assert.equal(buildInvitationMediaStoragePath({ eventId: 'EVT-0001', assetId: 'MED-LOCAL-001', role: 'cover', mimeType: 'image/webp' }), 'eventos/EVT-0001/invitacion/media/cover/MED-LOCAL-001.webp');
    assert.throws(() => buildInvitationMediaStoragePath({ eventId: '../EVT', assetId: 'MED-LOCAL-001', role: 'cover', mimeType: 'image/webp' }), /storage\/invalid-event-id/);
    assert.throws(() => startInvitationMediaUpload(), /storage\/not-integrated/);
});

test('Media Manager monta drop zones, conserva scroll y retiene cards durante downgrade', () => {
    const dom = new JSDOM('<main id="builder-editor"><div id="media"></div></main>', { pretendToBeVisual: true, url: 'https://eventora.local/' });
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    try {
        const state = new InvitationBuilderState();
        state.initialize('EVT-0001', { nombreEvento: 'Evento', fecha: '2027-11-15' });
        state.setPackage('premium');
        state.toggleSection('gallery', true);
        const scroller = dom.window.document.getElementById('builder-editor');
        const container = dom.window.document.getElementById('media');
        scroller.scrollTop = 220;
        const cleanup = initMediaEditor({ container, state });
        assert.equal(container.querySelectorAll('[data-media-drop]').length, 5);
        assert.equal(container.querySelector('[data-media-drop="gallery"]').getAttribute('aria-disabled'), 'false');
        const asset = state.addMediaAsset('gallery', imageSeed('gallery', 'ui')).entity;
        assert.equal(scroller.scrollTop, 220);
        assert.ok(container.querySelector(`[data-asset-id="${asset.id}"]`));
        state.setPackage('esencial');
        assert.equal(container.querySelector('[data-media-role="gallery"]').classList.contains('is-locked'), true);
        assert.ok(container.textContent.includes('permanece conservado'));
        assert.equal(state.getSnapshot().draft.media.gallery.length, 1);
        cleanup();
    } finally {
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
        dom.window.close();
    }
});
