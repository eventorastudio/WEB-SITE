import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import { isDraftPathTouched } from '../admin/invitations/core/content-schema.js';
import {
    RSVP_PERSISTED_TOUCHED_PATHS,
    createRsvpPersistenceFingerprint,
    deserializeRsvpConfig,
    serializeRsvpConfig
} from '../admin/invitations/core/rsvp-persistence-schema.js';
import { normalizeRsvpConfig } from '../admin/invitations/core/rsvp-schema.js';
import { initRsvpPersistenceController } from '../admin/invitations/modules/rsvp-persistence-controller.js';
import { InvitationRsvpService } from '../admin/invitations/services/invitation-rsvp-service.js';

const EVENT_ID = 'EVT-0001';
const UID = 'UID-RSVP-EDITOR';
const UPDATED_AT = Object.freeze({ seconds: 1_776_000_000, nanoseconds: 0 });

function validRsvp(overrides = {}) {
    return normalizeRsvpConfig({
        enabled: true,
        title: 'Confirma tu asistencia',
        message: 'Nos encantará contar contigo.',
        buttonLabel: 'Confirmar',
        deadline: '2026-12-20',
        method: 'whatsapp',
        whatsapp: { phone: '+525512345678', message: 'Confirmo mi asistencia' },
        guestPolicy: 'select-up-to-assigned',
        responses: {
            acceptedLabel: 'Sí asistiré',
            declinedLabel: 'No podré asistir',
            confirmationMessage: 'Gracias por responder.'
        },
        ...overrides
    });
}

function persistedDocument(overrides = {}) {
    const config = validRsvp(overrides.config ?? {});
    return serializeRsvpConfig(config, {
        eventId: overrides.eventId ?? EVENT_ID,
        touchedPaths: overrides.touchedPaths ?? RSVP_PERSISTED_TOUCHED_PATHS,
        updatedAt: overrides.updatedAt ?? UPDATED_AT,
        updatedBy: overrides.updatedBy ?? UID
    });
}

function createGateway({ document = null, failWrite = null, writeHook = null } = {}) {
    const writes = [];
    return {
        writes,
        getCurrentUid: () => UID,
        serverTimestamp: () => UPDATED_AT,
        readRsvp: async () => document,
        async writeRsvp(eventId, value) {
            writes.push({ eventId, value });
            if (writeHook) await writeHook(eventId, value);
            if (failWrite) throw failWrite;
            document = value;
        }
    };
}

function createState() {
    const state = new InvitationBuilderState();
    state.initialize(EVENT_ID, { nombreEvento: 'Evento', fecha: '2026-12-31', paquete: 'premium' });
    return state;
}

test('1. serialize produce el documento RSVP pequeño, exacto y versionado', () => {
    const document = persistedDocument();
    assert.deepEqual(Object.keys(document).sort(), [
        'buttonLabel', 'contentSchemaVersion', 'deadline', 'enabled', 'eventId',
        'guestPolicy', 'message', 'method', 'responses', 'schemaVersion', 'title',
        'touchedPaths', 'updatedAt', 'updatedBy', 'whatsapp'
    ]);
    assert.equal(document.schemaVersion, 1);
    assert.equal(document.contentSchemaVersion, 3);
    assert.equal(document.eventId, EVENT_ID);
});

test('2. serialize elimina propiedades desconocidas del draft y objetos anidados', () => {
    const document = serializeRsvpConfig({
        ...validRsvp(),
        injected: '<script>',
        whatsapp: { ...validRsvp().whatsapp, token: 'secret' },
        responses: { ...validRsvp().responses, html: '<b>unsafe</b>' }
    }, { eventId: EVENT_ID, touchedPaths: [], updatedAt: UPDATED_AT, updatedBy: UID });
    assert.equal('injected' in document, false);
    assert.deepEqual(Object.keys(document.whatsapp).sort(), ['message', 'phone']);
    assert.deepEqual(Object.keys(document.responses).sort(), ['acceptedLabel', 'confirmationMessage', 'declinedLabel']);
});

test('3. deserialize acepta un documento válido y devuelve una copia normalizada', () => {
    const document = persistedDocument();
    const result = deserializeRsvpConfig(document, EVENT_ID);
    assert.deepEqual(result.rsvp, validRsvp());
    assert.notEqual(result.rsvp, document);
    assert.deepEqual(result.touchedPaths, RSVP_PERSISTED_TOUCHED_PATHS);
});

test('4. deserialize rechaza campos persistidos desconocidos', () => {
    assert.throws(() => deserializeRsvpConfig({ ...persistedDocument(), previewState: 'mobile' }, EVENT_ID), /invalid-document-shape/);
});

test('5. roundtrip conserva todos los valores RSVP', () => {
    const source = validRsvp();
    const result = deserializeRsvpConfig(serializeRsvpConfig(source, {
        eventId: EVENT_ID,
        touchedPaths: RSVP_PERSISTED_TOUCHED_PATHS,
        updatedAt: UPDATED_AT,
        updatedBy: UID
    }), EVENT_ID);
    assert.deepEqual(result.rsvp, source);
});

test('6. explicit clear sobrevive serialize, deserialize e hidratación', () => {
    const touchedPaths = ['content.rsvp.title'];
    const document = persistedDocument({ config: { title: '' }, touchedPaths });
    const loaded = deserializeRsvpConfig(document, EVENT_ID);
    const state = createState();
    state.hydrateRsvp(loaded.rsvp, { touchedPaths: loaded.touchedPaths });
    assert.equal(state.getSnapshot().draft.content.rsvp.title, '');
    assert.equal(isDraftPathTouched(state.getSnapshot().draft, 'content.rsvp.title'), true);
    assert.equal(isDraftPathTouched(state.getSnapshot().draft, 'content.rsvp.message'), false);
});

test('7. configuración inválida no ejecuta write', async () => {
    const gateway = createGateway();
    const service = new InvitationRsvpService({ gateway });
    await assert.rejects(service.save({
        eventId: EVENT_ID,
        draftEventId: EVENT_ID,
        rsvp: { ...validRsvp(), method: 'email' },
        touchedPaths: []
    }), /invalid-method/);
    assert.equal(gateway.writes.length, 0);
});

test('8. service load deserializa el documento del evento', async () => {
    const service = new InvitationRsvpService({ gateway: createGateway({ document: persistedDocument() }) });
    const loaded = await service.load(EVENT_ID);
    assert.equal(loaded.exists, true);
    assert.deepEqual(loaded.rsvp, validRsvp());
});

test('9. documento ausente usa defaults sin generar write', async () => {
    const gateway = createGateway();
    const service = new InvitationRsvpService({ gateway });
    const state = createState();
    const loaded = await service.hydrateState(state, EVENT_ID);
    assert.equal(loaded.exists, false);
    assert.deepEqual(loaded.rsvp, normalizeRsvpConfig());
    assert.equal(gateway.writes.length, 0);
    assert.equal(state.getSnapshot().ui.draftDirty, false);
});

test('10. service save escribe sólo en el eventId propietario', async () => {
    const gateway = createGateway();
    const service = new InvitationRsvpService({ gateway });
    await service.save({ eventId: EVENT_ID, draftEventId: EVENT_ID, rsvp: validRsvp(), touchedPaths: [] });
    assert.equal(gateway.writes.length, 1);
    assert.equal(gateway.writes[0].eventId, EVENT_ID);
    assert.equal(gateway.writes[0].value.updatedBy, UID);
});

test('11. ownership cross-event se rechaza antes del write', async () => {
    const gateway = createGateway();
    const service = new InvitationRsvpService({ gateway });
    await assert.rejects(service.save({
        eventId: EVENT_ID,
        draftEventId: 'EVT-0002',
        rsvp: validRsvp(),
        touchedPaths: []
    }), /event-ownership-mismatch/);
    assert.equal(gateway.writes.length, 0);
});

test('12. hydration coloca Firestore en draft.content.rsvp antes de montar UI', async () => {
    const state = createState();
    const service = new InvitationRsvpService({ gateway: createGateway({ document: persistedDocument() }) });
    await service.hydrateState(state, EVENT_ID);
    assert.deepEqual(state.getSnapshot().draft.content.rsvp, validRsvp());
});

test('13. hydration persistida conserva draftDirty y rsvpDirty en false', async () => {
    const state = createState();
    const service = new InvitationRsvpService({ gateway: createGateway({ document: persistedDocument() }) });
    await service.hydrateState(state, EVENT_ID);
    assert.equal(state.getSnapshot().ui.draftDirty, false);
    assert.equal(state.getSnapshot().ui.rsvpDirty, false);
});

test('14. editar RSVP después de hydration activa ambos dirty RSVP/general', () => {
    const state = createState();
    state.hydrateRsvp(validRsvp(), { touchedPaths: RSVP_PERSISTED_TOUCHED_PATHS });
    state.updateDraftField('content.rsvp.title', 'Nuevo título');
    assert.equal(state.getSnapshot().ui.rsvpDirty, true);
    assert.equal(state.getSnapshot().ui.draftDirty, true);
});

test('15. saveState exitoso limpia RSVP y draft cuando no hay otros cambios', async () => {
    const state = createState();
    state.updateDraftField('content.rsvp.title', 'Guardable');
    const service = new InvitationRsvpService({ gateway: createGateway() });
    const result = await service.saveState(state, EVENT_ID);
    assert.equal(result.clean, true);
    assert.equal(state.getSnapshot().ui.rsvpDirty, false);
    assert.equal(state.getSnapshot().ui.draftDirty, false);
});

test('16. fallo de save conserva valores y dirty para retry', async () => {
    const state = createState();
    state.updateDraftField('content.rsvp.title', 'No perder');
    const service = new InvitationRsvpService({ gateway: createGateway({ failWrite: new Error('unavailable') }) });
    await assert.rejects(service.saveState(state, EVENT_ID), /unavailable/);
    assert.equal(state.getSnapshot().draft.content.rsvp.title, 'No perder');
    assert.equal(state.getSnapshot().ui.rsvpDirty, true);
    assert.equal(state.getSnapshot().ui.draftDirty, true);
});

test('17. guardar RSVP deja mediaDirty intacto', async () => {
    const state = createState();
    state.markMediaPending();
    state.updateDraftField('content.rsvp.title', 'RSVP');
    await new InvitationRsvpService({ gateway: createGateway() }).saveState(state, EVENT_ID);
    assert.equal(state.getSnapshot().ui.rsvpDirty, false);
    assert.equal(state.getSnapshot().ui.mediaDirty, true);
    assert.equal(state.getSnapshot().ui.isDirty, true);
});

test('18. cambio de tema después de hydration conserva RSVP y dirty general separado', () => {
    const state = createState();
    state.hydrateRsvp(validRsvp(), { touchedPaths: RSVP_PERSISTED_TOUCHED_PATHS });
    state.setTheme('champagne');
    assert.deepEqual(state.getSnapshot().draft.content.rsvp, validRsvp());
    assert.equal(state.getSnapshot().ui.rsvpDirty, false);
    assert.equal(state.getSnapshot().ui.draftDirty, true);
});

test('19. toggle RSVP después de hydration conserva el resto y marca RSVP dirty', () => {
    const state = createState();
    state.hydrateRsvp(validRsvp(), { touchedPaths: RSVP_PERSISTED_TOUCHED_PATHS });
    state.updateDraftField('content.rsvp.enabled', false);
    assert.equal(state.getSnapshot().draft.content.rsvp.enabled, false);
    assert.equal(state.getSnapshot().draft.content.rsvp.title, validRsvp().title);
    assert.equal(state.getSnapshot().ui.rsvpDirty, true);
});

test('20. WhatsApp conserva teléfono y mensaje en roundtrip', () => {
    const loaded = deserializeRsvpConfig(persistedDocument(), EVENT_ID);
    assert.deepEqual(loaded.rsvp.whatsapp, { phone: '+525512345678', message: 'Confirmo mi asistencia' });
});

test('21. guestPolicy conserva select-up-to-assigned en roundtrip', () => {
    const loaded = deserializeRsvpConfig(persistedDocument(), EVENT_ID);
    assert.equal(loaded.rsvp.guestPolicy, 'select-up-to-assigned');
});

test('22. edición durante un write en vuelo no se marca falsamente como clean', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const state = createState();
    state.updateDraftField('content.rsvp.title', 'Versión enviada');
    const service = new InvitationRsvpService({ gateway: createGateway({ writeHook: () => pending }) });
    const savePromise = service.saveState(state, EVENT_ID);
    await Promise.resolve();
    state.updateDraftField('content.rsvp.title', 'Cambio posterior');
    release();
    const result = await savePromise;
    assert.equal(result.clean, false);
    assert.equal(state.getSnapshot().ui.rsvpDirty, true);
    assert.equal(state.getSnapshot().draft.content.rsvp.title, 'Cambio posterior');
});

test('23. fingerprint ignora touched no RSVP y es determinista', () => {
    const left = createRsvpPersistenceFingerprint(validRsvp(), {
        eventId: EVENT_ID,
        touchedPaths: ['content.identity.primaryName', 'content.rsvp.title']
    });
    const right = createRsvpPersistenceFingerprint(validRsvp(), {
        eventId: EVENT_ID,
        touchedPaths: ['content.rsvp.title']
    });
    assert.equal(left, right);
});

test('24. controlador mantiene botón reintentable y draft tras fallo', async () => {
    const dom = new JSDOM('<button id="save"></button><span id="status"></span>');
    const button = dom.window.document.getElementById('save');
    const status = dom.window.document.getElementById('status');
    const state = createState();
    state.updateDraftField('content.rsvp.title', 'Retry');
    let attempts = 0;
    let retry = null;
    const service = {
        async saveState() {
            attempts += 1;
            if (attempts === 1) throw new Error('permission-denied');
            state.markRsvpPersisted();
            return { clean: true };
        }
    };
    const cleanup = initRsvpPersistenceController({
        button,
        status,
        state,
        service,
        onError: (_error, context) => { retry = context.retry; }
    });
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(state.getSnapshot().ui.rsvpDirty, true);
    assert.match(status.textContent, /No se guardó/);
    assert.equal(typeof retry, 'function');
    retry();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(state.getSnapshot().ui.rsvpDirty, false);
    assert.equal(attempts, 2);
    cleanup();
});

test('25. Builder hidrata RSVP antes de mountModules y usa un solo save central', async () => {
    const [builder, html] = await Promise.all([
        readFile(new URL('../admin/invitations/builder.js', import.meta.url), 'utf8'),
        readFile(new URL('../admin/invitations/builder.html', import.meta.url), 'utf8')
    ]);
    assert.ok(builder.indexOf('await invitationRsvpService.hydrateState(builderState, eventId)') < builder.indexOf('mountModules();'));
    assert.equal((html.match(/id="builder-save-rsvp"/g) ?? []).length, 1);
    assert.doesNotMatch(builder, /firebase-firestore\.js/);
});
