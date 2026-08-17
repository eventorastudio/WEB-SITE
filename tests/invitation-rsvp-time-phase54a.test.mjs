import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { InvitationBuilderState } from '../admin/invitations/core/builder-state.js';
import {
    INVITATION_CONTENT_SCHEMA_VERSION,
    isDraftPathTouched,
    migrateInvitationDraftContent
} from '../admin/invitations/core/content-schema.js';
import {
    RSVP_PERSISTENCE_SCHEMA_VERSION,
    deserializeRsvpConfig,
    serializeRsvpConfig
} from '../admin/invitations/core/rsvp-persistence-schema.js';
import { createRsvpConfig } from '../admin/invitations/core/rsvp-schema.js';
import {
    deriveRsvpResponseClosesAt,
    isValidIanaTimeZone
} from '../admin/invitations/core/rsvp-time.js';
import { validateRsvpConfig } from '../admin/invitations/core/builder-validation.js';
import { SECTION_EDITOR_REGISTRY } from '../admin/invitations/core/section-editor-registry.js';
import { createEditorField } from '../admin/invitations/editors/editor-fields.js';
import { InvitationRsvpService } from '../admin/invitations/services/invitation-rsvp-service.js';

const EVENT_ID = 'EVT-TIME-001';
const UID = 'UID-TIME-EDITOR';
const UPDATED_AT = Object.freeze({ serverTimestamp: true });

function timestampFromDate(value) {
    const milliseconds = value.getTime();
    return Object.freeze({
        seconds: Math.floor(milliseconds / 1000),
        nanoseconds: 0,
        toDate: () => new Date(milliseconds)
    });
}

function completeConfig(overrides = {}) {
    return createRsvpConfig({
        enabled: true,
        title: 'Confirma tu asistencia',
        message: 'Nos encantará contar contigo.',
        buttonLabel: 'Confirmar',
        deadline: '2026-12-20',
        deadlineTime: '18:30',
        deadlineTimeZone: 'America/Mexico_City',
        method: 'internal',
        guestPolicy: 'assigned-only',
        responses: {
            acceptedLabel: 'Sí asistiré',
            declinedLabel: 'No podré asistir',
            confirmationMessage: 'Gracias por responder.'
        },
        ...overrides
    });
}

function serialize(config = completeConfig(), options = {}) {
    const instant = deriveRsvpResponseClosesAt(config);
    return serializeRsvpConfig(config, {
        eventId: EVENT_ID,
        touchedPaths: options.touchedPaths ?? [],
        responseClosesAt: instant ? timestampFromDate(instant) : null,
        updatedAt: UPDATED_AT,
        updatedBy: UID
    });
}

function legacyDocument() {
    const config = completeConfig();
    return {
        schemaVersion: 1,
        contentSchemaVersion: 3,
        eventId: EVENT_ID,
        enabled: config.enabled,
        title: config.title,
        message: config.message,
        buttonLabel: config.buttonLabel,
        deadline: config.deadline,
        method: config.method,
        whatsapp: config.whatsapp,
        guestPolicy: config.guestPolicy,
        responses: config.responses,
        touchedPaths: ['content.rsvp.deadline'],
        updatedAt: UPDATED_AT,
        updatedBy: UID
    };
}

function createGateway({ document = null } = {}) {
    const writes = [];
    const converted = [];
    return {
        writes,
        converted,
        getCurrentUid: () => UID,
        serverTimestamp: () => UPDATED_AT,
        timestampFromDate(value) {
            converted.push(value);
            return timestampFromDate(value);
        },
        readRsvp: async () => document,
        async writeRsvp(eventId, value) {
            writes.push({ eventId, value });
            document = value;
        }
    };
}

function createState() {
    const state = new InvitationBuilderState();
    state.initialize(EVENT_ID, { nombreEvento: 'Evento', fecha: '2026-12-31', paquete: 'premium' });
    return state;
}

test('1. sin deadline deriva null', () => {
    assert.equal(deriveRsvpResponseClosesAt(createRsvpConfig()), null);
});

test('2. fecha, hora y zona IANA derivan el instante UTC correcto', () => {
    assert.equal(deriveRsvpResponseClosesAt(completeConfig()).toISOString(), '2026-12-21T00:30:00.000Z');
});

test('3. la zona del navegador no cambia el instante derivado', () => {
    const previous = process.env.TZ;
    try {
        process.env.TZ = 'Asia/Tokyo';
        const tokyoRuntime = deriveRsvpResponseClosesAt(completeConfig()).toISOString();
        process.env.TZ = 'America/Los_Angeles';
        const losAngelesRuntime = deriveRsvpResponseClosesAt(completeConfig()).toISOString();
        assert.equal(tokyoRuntime, losAngelesRuntime);
        assert.equal(tokyoRuntime, '2026-12-21T00:30:00.000Z');
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
});

test('4. una zona IANA inválida o un offset disfrazado se rechazan', () => {
    for (const timeZone of ['Mars/Olympus', 'CST', 'UTC-6', 'Etc/GMT+6']) {
        assert.equal(isValidIanaTimeZone(timeZone), false);
        assert.throws(() => deriveRsvpResponseClosesAt(completeConfig({ deadlineTimeZone: timeZone })), /invalid-time-zone/);
    }
});

test('5. una fecha calendárica inválida se rechaza', () => {
    assert.throws(() => deriveRsvpResponseClosesAt(completeConfig({ deadline: '2026-02-30' })), /invalid-deadline/);
});

test('6. una hora inválida, incluido 24:00, se rechaza', () => {
    for (const deadlineTime of ['24:00', '12:60', '9:30']) {
        assert.throws(() => deriveRsvpResponseClosesAt(completeConfig({ deadlineTime })), /invalid-deadline-time/);
    }
});

test('7. 23:59 es una hora límite válida', () => {
    assert.ok(deriveRsvpResponseClosesAt(completeConfig({ deadlineTime: '23:59' })) instanceof Date);
});

test('8. 00:00 es una hora límite válida', () => {
    assert.ok(deriveRsvpResponseClosesAt(completeConfig({ deadlineTime: '00:00' })) instanceof Date);
});

test('9. fecha sin hora queda incompleta', () => {
    const config = completeConfig({ deadlineTime: '' });
    assert.match(validateRsvpConfig(config)['content.rsvp.deadlineTime'], /hora límite/i);
});

test('10. fecha y hora sin timezone quedan incompletas', () => {
    const config = completeConfig({ deadlineTimeZone: '' });
    assert.match(validateRsvpConfig(config)['content.rsvp.deadlineTimeZone'], /zona horaria IANA/i);
});

test('11. hora sin fecha se rechaza', () => {
    const config = createRsvpConfig({ deadlineTime: '12:00' });
    assert.match(validateRsvpConfig(config)['content.rsvp.deadline'], /fecha límite/i);
});

test('12. zona sin fecha se rechaza', () => {
    const config = createRsvpConfig({ deadlineTimeZone: 'Europe/Madrid' });
    assert.match(validateRsvpConfig(config)['content.rsvp.deadline'], /fecha límite/i);
});

test('13. serialize escribe el contrato RSVP v2 exacto', () => {
    const document = serialize();
    assert.equal(RSVP_PERSISTENCE_SCHEMA_VERSION, 2);
    assert.deepEqual(Object.keys(document).sort(), [
        'buttonLabel', 'contentSchemaVersion', 'deadline', 'deadlineTime',
        'deadlineTimeZone', 'enabled', 'eventId', 'guestPolicy', 'message',
        'method', 'responseClosesAt', 'responses', 'schemaVersion', 'title',
        'touchedPaths', 'updatedAt', 'updatedBy', 'whatsapp'
    ]);
});

test('14. deserialize acepta el contrato v2 y separa el instante derivado', () => {
    const result = deserializeRsvpConfig(serialize(), EVENT_ID);
    assert.deepEqual(result.rsvp, completeConfig());
    assert.equal(result.responseClosesAt.toDate().toISOString(), '2026-12-21T00:30:00.000Z');
    assert.equal('responseClosesAt' in result.rsvp, false);
});

test('15. el roundtrip conserva el Timestamp responseClosesAt', () => {
    const document = serialize();
    const result = deserializeRsvpConfig(document, EVENT_ID);
    assert.equal(result.responseClosesAt, document.responseClosesAt);
});

test('16. el content schema queda en v4 sin cambiar el schema global', () => {
    assert.equal(INVITATION_CONTENT_SCHEMA_VERSION, 4);
    assert.equal(createState().getSnapshot().draft.schemaVersion, 5);
});

test('17. migración de content v3 produce v4', () => {
    const migrated = migrateInvitationDraftContent({ contentSchemaVersion: 3, content: { rsvp: completeConfig() } });
    assert.equal(migrated.contentSchemaVersion, 4);
});

test('18. un documento legacy conserva deadline y exige intervención', () => {
    const migrated = deserializeRsvpConfig(legacyDocument(), EVENT_ID);
    assert.equal(migrated.migrated, true);
    assert.equal(migrated.rsvp.deadline, '2026-12-20');
    assert.match(validateRsvpConfig(migrated.rsvp)['content.rsvp.deadlineTime'], /hora límite/i);
});

test('19. migración legacy no inventa hora ni zona', () => {
    const migrated = deserializeRsvpConfig(legacyDocument(), EVENT_ID);
    assert.equal(migrated.rsvp.deadlineTime, '');
    assert.equal(migrated.rsvp.deadlineTimeZone, '');
    assert.equal(migrated.responseClosesAt, null);
});

test('20. deadlineTime pertenece a touched paths persistibles', () => {
    const document = serialize(completeConfig(), { touchedPaths: ['content.rsvp.deadlineTime'] });
    assert.deepEqual(document.touchedPaths, ['content.rsvp.deadlineTime']);
});

test('21. deadlineTimeZone pertenece a touched paths persistibles', () => {
    const document = serialize(completeConfig(), { touchedPaths: ['content.rsvp.deadlineTimeZone'] });
    assert.deepEqual(document.touchedPaths, ['content.rsvp.deadlineTimeZone']);
});

test('22. explicit clear temporal sobrevive roundtrip e hidratación', () => {
    const config = createRsvpConfig();
    const touchedPaths = [
        'content.rsvp.deadline',
        'content.rsvp.deadlineTime',
        'content.rsvp.deadlineTimeZone'
    ];
    const loaded = deserializeRsvpConfig(serialize(config, { touchedPaths }), EVENT_ID);
    const state = createState();
    state.hydrateRsvp(loaded.rsvp, { touchedPaths: loaded.touchedPaths });
    touchedPaths.forEach((path) => assert.equal(isDraftPathTouched(state.getSnapshot().draft, path), true));
    assert.equal(loaded.responseClosesAt, null);
});

test('23. save deriva y persiste un Timestamp desde el contrato editorial', async () => {
    const gateway = createGateway();
    const result = await new InvitationRsvpService({ gateway }).save({
        eventId: EVENT_ID,
        draftEventId: EVENT_ID,
        rsvp: completeConfig(),
        touchedPaths: []
    });
    assert.equal(gateway.converted.length, 1);
    assert.equal(gateway.converted[0].toISOString(), '2026-12-21T00:30:00.000Z');
    assert.equal(gateway.writes[0].value.responseClosesAt.toDate().toISOString(), '2026-12-21T00:30:00.000Z');
    assert.equal(result.responseClosesAt.toDate().toISOString(), '2026-12-21T00:30:00.000Z');
});

test('24. fallo de derivación bloquea el write', async () => {
    const gateway = createGateway();
    await assert.rejects(new InvitationRsvpService({ gateway }).save({
        eventId: EVENT_ID,
        draftEventId: EVENT_ID,
        rsvp: completeConfig({ deadlineTimeZone: '' }),
        touchedPaths: []
    }), /deadline-time-zone-required/);
    assert.equal(gateway.writes.length, 0);
    assert.equal(gateway.converted.length, 0);
});

test('25. hydration v2 conserva el draft limpio y no copia responseClosesAt', async () => {
    const state = createState();
    const service = new InvitationRsvpService({ gateway: createGateway({ document: serialize() }) });
    const loaded = await service.hydrateState(state, EVENT_ID);
    assert.equal(loaded.responseClosesAt.toDate().toISOString(), '2026-12-21T00:30:00.000Z');
    assert.equal('responseClosesAt' in state.getSnapshot().draft.content.rsvp, false);
    assert.equal(state.getSnapshot().ui.rsvpDirty, false);
    assert.equal(state.getSnapshot().ui.draftDirty, false);
});

test('26. guardar el contrato temporal deja mediaDirty intacto', async () => {
    const state = createState();
    state.markMediaPending();
    state.updateDraftFields({
        'content.rsvp.deadline': '2026-12-20',
        'content.rsvp.deadlineTime': '18:30',
        'content.rsvp.deadlineTimeZone': 'America/Mexico_City'
    });
    await new InvitationRsvpService({ gateway: createGateway() }).saveState(state, EVENT_ID);
    assert.equal(state.getSnapshot().ui.mediaDirty, true);
    assert.equal(state.getSnapshot().ui.rsvpDirty, false);
});

test('27. una hora local inexistente por DST se rechaza', () => {
    assert.throws(() => deriveRsvpResponseClosesAt(completeConfig({
        deadline: '2026-03-08',
        deadlineTime: '02:30',
        deadlineTimeZone: 'America/New_York'
    })), /nonexistent-local-time/);
});

test('28. una hora local ambigua por DST se rechaza', () => {
    assert.throws(() => deriveRsvpResponseClosesAt(completeConfig({
        deadline: '2026-11-01',
        deadlineTime: '01:30',
        deadlineTimeZone: 'America/New_York'
    })), /ambiguous-local-time/);
});

test('29. el editor ofrece búsqueda IANA sin aceptar automáticamente la zona sugerida', () => {
    const dom = new JSDOM('<main></main>');
    globalThis.document = dom.window.document;
    try {
        const definition = SECTION_EDITOR_REGISTRY.rsvp.fields.find(({ path }) => path === 'content.rsvp.deadlineTimeZone');
        const field = createEditorField(definition, () => {});
        const input = field.querySelector('input');
        assert.equal(input.value, '');
        assert.ok(input.getAttribute('list'));
        assert.ok(field.querySelector('datalist'));
        assert.match(input.placeholder, /Sugerida:|^$/);
    } finally {
        dom.window.close();
        delete globalThis.document;
    }
});
