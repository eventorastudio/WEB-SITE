import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { serializeInvitationRevision } from '../admin/invitations/core/invitation-publication-schema.js';
import { applyPreviewSectionVisibility } from '../admin/invitations/core/preview-sections.js';
import {
    applyTemplateContentBindings,
    prepareBuilderTemplate
} from '../admin/invitations/core/template-binding-registry.js';
import { InvitationPublicationService } from '../admin/invitations/services/invitation-publication-service.js';
import { PublicInvitationLoader } from '../invitacion/public-invitation-loader.js';
import { PublicInvitationPage } from '../invitacion/public-invitation-page.js';

const EVENT_ID = 'EVT-0001';
const UID = 'UID-PHASE63';
const PUBLIC_KEY = 'a'.repeat(48);
const CHAMPAGNE_TEMPLATE = readFileSync(
    new URL('../principal/demos/champagne/index.html', import.meta.url),
    'utf8'
);

function renderWithSharedThemeRuntime(payload) {
    const dom = new JSDOM(CHAMPAGNE_TEMPLATE);
    const document = dom.window.document;
    prepareBuilderTemplate(document, payload.theme.id);
    applyTemplateContentBindings(document, payload.theme.id, payload.draft);
    applyPreviewSectionVisibility(document, payload.sections, payload.enabledSections, {
        groups: payload.sectionGroups
    });
    const text = document.body.textContent.replace(/\s+/g, ' ').trim();
    dom.window.close();
    return text;
}

function createState(phrase = 'Primera versión pública') {
    const state = new InvitationBuilderState();
    state.initialize(EVENT_ID, {
        nombreEvento: 'María & Fernando',
        tipoEvento: 'Boda',
        fecha: '2027-11-15',
        hora: '19:00',
        ciudad: 'Saltillo',
        estado: 'Coahuila'
    });
    state.setPackage('prestige');
    state.setTheme('champagne');
    state.toggleSection('welcome-story', true);
    state.toggleSection('rsvp', true);
    state.updateDraftField('content.identity.phrase', phrase);
    state.addAccommodation({ name: 'Hotel Centro', reservationUrl: 'https://example.com/reservar' });
    state.hydrateMedia({
        schemaVersion: 1,
        cover: {
            id: 'MED-LOCAL-001',
            role: 'cover',
            kind: 'image',
            originalName: 'portada privada.jpg',
            mimeType: 'image/jpeg',
            size: 1200,
            width: 1200,
            height: 800,
            duration: 0,
            alt: 'Portada del evento',
            caption: '',
            storagePath: `eventos/${EVENT_ID}/invitacion/media/cover/MED-LOCAL-001-v1.jpg`,
            downloadUrl: 'https://firebasestorage.googleapis.com/v0/b/example/o/cover.jpg?token=public-safe-token',
            previewUrl: 'blob:private-preview',
            status: 'uploaded',
            uploadProgress: 100,
            error: '',
            focalPoint: { x: 45, y: 55 },
            sortOrder: 0
        },
        gallery: [],
        video: null,
        videoPoster: null,
        music: null
    }, { persisted: true });
    return state;
}

function createGateway() {
    let publication = null;
    const revisions = new Map();
    const projections = new Map();
    const commits = [];
    let timestampSequence = 0;
    return {
        commits,
        revisions,
        projections,
        get publication() { return publication == null ? null : structuredClone(publication); },
        seedLegacy(revision, legacyPublication) {
            revisions.set('REV-000001', structuredClone(revision));
            publication = structuredClone(legacyPublication);
        },
        getCurrentUid: () => UID,
        async runPublicationTransaction(eventId, { createPublicKey, planner }) {
            const currentPublication = publication == null ? null : structuredClone(publication);
            const currentRevision = currentPublication == null
                ? null
                : structuredClone(revisions.get(currentPublication.currentRevisionId));
            const publicKey = currentPublication?.publicKey ?? createPublicKey();
            const currentPublicProjection = projections.has(publicKey)
                ? structuredClone(projections.get(publicKey))
                : null;
            const plan = planner({
                currentPublication,
                currentRevision,
                currentPublicProjection,
                publicKey,
                serverTimestamp: () => new Date(`2026-08-17T08:00:0${timestampSequence++}.000Z`)
            });
            if (plan.status === 'unchanged') return plan;
            if (plan.revision) {
                if (revisions.has(plan.revisionId)) throw new Error('publication/revision-id-conflict');
                revisions.set(plan.revisionId, structuredClone(plan.revision));
            }
            if (plan.publication) publication = structuredClone(plan.publication);
            projections.set(publicKey, structuredClone(plan.publicProjection));
            commits.push({ eventId, revisionId: plan.revisionId, publicKey });
            return plan;
        },
        async readProjection(eventId, publicKey) {
            if (eventId !== EVENT_ID) return null;
            return projections.has(publicKey) ? structuredClone(projections.get(publicKey)) : null;
        }
    };
}

test('publicación crea proyección sanitizada con publicKey aleatorio estable', async () => {
    const gateway = createGateway();
    let keyFactoryCalls = 0;
    const service = new InvitationPublicationService({
        gateway,
        publicKeyFactory: () => {
            keyFactoryCalls += 1;
            return PUBLIC_KEY;
        }
    });
    const result = await service.publishState(createState(), EVENT_ID);
    const projection = gateway.projections.get(PUBLIC_KEY);

    assert.equal(result.status, 'published');
    assert.equal(result.publicKey, PUBLIC_KEY);
    assert.equal(gateway.publication.publicKey, PUBLIC_KEY);
    assert.equal(keyFactoryCalls, 1);
    assert.equal(projection.revisionId, 'REV-000001');
    assert.equal(projection.accommodations[0].name, 'Hotel Centro');
    assert.equal(projection.sections.includes('rsvp'), true);
    assert.equal(Object.hasOwn(projection.content, 'rsvp'), false);
    assert.equal(Object.hasOwn(projection, 'publishedBy'), false);
    assert.equal(Object.hasOwn(projection, 'publishedAt'), false);
    assert.equal(Object.hasOwn(projection.media.cover, 'storagePath'), false);
    assert.equal(Object.hasOwn(projection.media.cover, 'originalName'), false);
    assert.match(projection.media.cover.downloadUrl, /^https:/);
});

test('página carga la revisión activa y cambia tras republicar sin rotar publicKey', async () => {
    const gateway = createGateway();
    const service = new InvitationPublicationService({ gateway, publicKeyFactory: () => PUBLIC_KEY });
    const state = createState('Versión pública uno');
    await service.publishState(state, EVENT_ID);
    const renders = [];
    const page = new PublicInvitationPage({
        loader: new PublicInvitationLoader({ gateway }),
        renderer: async (payload) => renders.push({
            payload: structuredClone(payload),
            text: renderWithSharedThemeRuntime(payload)
        })
    });
    const location = { href: `https://eventorastudio.com/invitacion/?event=${EVENT_ID}&key=${PUBLIC_KEY}` };

    assert.equal((await page.load(location)).status, 'rendered');
    assert.equal(renders.at(-1).payload.enabledSections.includes('rsvp'), true);
    assert.equal(renders.at(-1).payload.enabledSections.includes('access-preview'), false);
    assert.equal(renders.at(-1).payload.draft.content.identity.phrase, 'Versión pública uno');
    assert.equal(renders.at(-1).payload.publication.revisionId, 'REV-000001');
    assert.match(renders.at(-1).text, /Versión pública uno/);

    state.updateDraftField('content.identity.phrase', 'Versión pública dos');
    const republished = await service.publishState(state, EVENT_ID);
    assert.equal(republished.publicKey, PUBLIC_KEY);
    assert.equal(republished.revisionId, 'REV-000002');
    assert.equal((await page.load(location)).status, 'rendered');
    assert.equal(renders.at(-1).payload.draft.content.identity.phrase, 'Versión pública dos');
    assert.equal(renders.at(-1).payload.publication.revisionId, 'REV-000002');
    assert.match(renders.at(-1).text, /Versión pública dos/);
    assert.doesNotMatch(renders.at(-1).text, /Versión pública uno/);
    assert.equal(gateway.revisions.size, 2);
});

test('publicación idéntica conserva key/proyección y devuelve unchanged', async () => {
    const gateway = createGateway();
    let keyFactoryCalls = 0;
    const service = new InvitationPublicationService({
        gateway,
        publicKeyFactory: () => {
            keyFactoryCalls += 1;
            return PUBLIC_KEY;
        }
    });
    const state = createState();
    await service.publishState(state, EVENT_ID);
    const before = structuredClone(gateway.projections.get(PUBLIC_KEY));
    const result = await service.publishState(state, EVENT_ID);

    assert.equal(result.status, 'unchanged');
    assert.equal(result.publicKey, PUBLIC_KEY);
    assert.equal(keyFactoryCalls, 1);
    assert.deepEqual(gateway.projections.get(PUBLIC_KEY), before);
    assert.equal(gateway.commits.length, 1);
    assert.equal(gateway.revisions.size, 1);
});

test('publication 6.2 existente obtiene key/proyección sin duplicar revisión', async () => {
    const gateway = createGateway();
    const state = createState('Publicación heredada');
    const publishedAt = new Date('2026-08-17T07:00:00.000Z');
    gateway.seedLegacy(serializeInvitationRevision(state.getSnapshot().draft, {
        eventId: EVENT_ID,
        revisionNumber: 1,
        publishedAt,
        publishedBy: UID
    }), {
        schemaVersion: 1,
        eventId: EVENT_ID,
        currentRevisionId: 'REV-000001',
        currentRevisionNumber: 1,
        publishedAt,
        publishedBy: UID
    });
    const service = new InvitationPublicationService({ gateway, publicKeyFactory: () => PUBLIC_KEY });
    const result = await service.publishState(state, EVENT_ID);

    assert.equal(result.status, 'published');
    assert.equal(result.revisionId, 'REV-000001');
    assert.equal(gateway.revisions.size, 1);
    assert.equal(gateway.publication.schemaVersion, 2);
    assert.equal(gateway.publication.publicKey, PUBLIC_KEY);
    assert.equal(gateway.projections.get(PUBLIC_KEY).revisionId, 'REV-000001');
});
