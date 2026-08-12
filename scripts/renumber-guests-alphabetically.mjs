#!/usr/bin/env node
/*
 * Renumeración estable de invitados por evento.
 *
 * Dry run: node scripts/renumber-guests-alphabetically.mjs <eventId>
 * Apply:   node scripts/renumber-guests-alphabetically.mjs <eventId> --apply
 *
 * Firestore no permite renombrar documentos. La aplicación crea, verifica,
 * actualiza referencias, vuelve a verificar y solo entonces elimina orígenes.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
    buildGuestRenumberPlan,
    formatGuestId,
    planCheckinReferenceUpdates
} from '../shared/guest-numbering.js';

export const PROTECTED_GUEST_ID = 'INV-0001';
export const SPECIAL_REFERENCE_EVENT_ID = 'EVT-0001';
export const MAX_BATCH_WRITES = 400;
const DEFAULT_PROJECT_ID = 'eventorastudio-d6d95';
const CONFIRMATION_PREFIX = 'RENUMERAR';

if (isMainModule()) {
    const options = parseArguments(process.argv.slice(2));
    if (!options.valid) {
        console.error(options.error);
        console.error('Uso: node scripts/renumber-guests-alphabetically.mjs <eventId> [--apply]');
        process.exitCode = 1;
    } else {
        await run(options).catch((error) => {
            console.error(`\nERROR: ${error?.message || error}`);
            if (error?.phase) console.error(`Fase detenida: ${error.phase}`);
            if (error?.backupPath) console.error(`Backup para recuperación: ${error.backupPath}`);
            console.error('No continúes ni borres documentos manualmente hasta revisar el backup y el estado de las fases completadas.');
            process.exitCode = 1;
        });
    }
}

async function run({ eventId, apply }) {
    const admin = await loadFirebaseAdmin();
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID;
    if (admin.getApps().length === 0) {
        admin.initializeApp({ credential: admin.applicationDefault(), projectId });
    }
    const db = admin.getFirestore();
    const eventRef = db.collection('eventos').doc(eventId);
    const guestsRef = eventRef.collection('invitados');
    const checkinsRef = eventRef.collection('checkins');
    const [eventSnapshot, guestsSnapshot, checkinsSnapshot] = await Promise.all([
        eventRef.get(),
        guestsRef.get(),
        checkinsRef.get()
    ]);
    if (!eventSnapshot.exists) throw new Error(`No existe eventos/${eventId}.`);

    const guests = guestsSnapshot.docs.map(toRecord);
    const checkins = checkinsSnapshot.docs.map(toRecord);
    const migration = createMigrationPlan({ eventId, guests, checkins });
    printPlan(migration, apply);

    if (!apply) {
        console.log('\nDRY RUN completado: no se creó backup, no se generaron IDs y no se escribió en Firestore.');
        return migration;
    }
    if (!migration.canApply) throw new Error('Aplicación bloqueada por conflictos o errores del plan.');

    await confirmApply(eventId);
    const backupPath = await createBackup({
        eventId,
        event: eventSnapshot.data(),
        guests,
        checkins,
        migration
    });
    console.log(`\nBackup creado antes de escribir: ${backupPath}`);

    const adapter = createFirestoreAdapter({
        admin,
        db,
        eventRef,
        guestsRef,
        checkinsRef,
        eventSnapshot,
        initialGuests: guests,
        initialCheckins: checkins,
        migration
    });
    try {
        await executeMigrationPhases({ migration, adapter, backupPath });
    } catch (error) {
        error.backupPath = backupPath;
        throw error;
    }

    console.log('\nMigración completada y validada.');
    if (migration.protectedGuestId) console.log(`${migration.protectedGuestId} permaneció intacto.`);
    console.log(`Invitados finales: ${migration.totalGuests}. Secuencia final: ${formatGuestId(migration.totalGuests)}.`);
}

export function parseArguments(args) {
    const eventId = args[0];
    const flags = args.slice(1);
    if (!isSafeDocumentId(eventId)) return { valid: false, error: 'El eventId es obligatorio y no puede contener "/".' };
    if (flags.some((flag) => flag !== '--apply')) return { valid: false, error: 'Opción no reconocida.' };
    if (flags.filter((flag) => flag === '--apply').length > 1) return { valid: false, error: '--apply está repetido.' };
    return { valid: true, eventId, apply: flags.includes('--apply') };
}

export function createMigrationPlan({ eventId, guests, checkins }) {
    const protectedGuestId = eventId === SPECIAL_REFERENCE_EVENT_ID ? PROTECTED_GUEST_ID : null;
    const guestPlan = buildGuestRenumberPlan(guests, {
        preservedId: protectedGuestId,
        firstSequence: protectedGuestId ? 2 : 1
    });
    const referencePlan = planCheckinReferenceUpdates(checkins, guestPlan.moves);
    const errors = [
        ...guestPlan.errors,
        ...referencePlan.conflicts.map((conflict) => conflict.message)
    ];
    return {
        eventId,
        protectedGuestId,
        ...guestPlan,
        referenceUpdates: referencePlan.updates,
        referenceConflicts: referencePlan.conflicts,
        errors,
        checkinsTotal: checkins.length,
        checkinsAffected: referencePlan.updates.length,
        canApply: guestPlan.conflicts.length === 0 && errors.length === 0
    };
}

export async function executeMigrationPhases({ migration, adapter, backupPath = null }) {
    const phases = [
        ['bloquear evento', () => adapter.acquireLock()],
        ['crear documentos destino', () => adapter.createGuests(migration.moves)],
        ['verificar documentos destino', () => adapter.verifyCreated(migration.moves)],
        ['actualizar referencias', () => adapter.updateReferences(migration.referenceUpdates)],
        ['verificar referencias', () => adapter.verifyReferences(migration.referenceUpdates)],
        ['eliminar documentos origen', () => adapter.deleteOldGuests(migration.moves)],
        ['validación posterior', () => adapter.verifyFinal(migration)],
        ['finalizar numeración', () => adapter.finalize(migration.totalGuests)]
    ];
    const completed = [];
    for (const [phase, operation] of phases) {
        try {
            await operation();
            completed.push(phase);
        } catch (cause) {
            const error = new Error(`Falló la fase "${phase}": ${cause?.message || cause}`);
            error.phase = phase;
            error.completedPhases = completed;
            error.backupPath = backupPath;
            error.cause = cause;
            throw error;
        }
    }
    return { completedPhases: completed };
}

export function buildBackupPayload({ eventId, event, guests, checkins, migration, createdAt = new Date() }) {
    return {
        format: 'eventora-guest-renumber-backup-v1',
        eventId,
        createdAt: createdAt.toISOString(),
        event: serializeFirestoreValue(event),
        guests: guests.map((record) => ({ id: record.id, data: serializeFirestoreValue(record.data) })),
        checkins: checkins.map((record) => ({ id: record.id, data: serializeFirestoreValue(record.data) })),
        plan: {
            preserved: migration.preserved.map(({ oldId, newId, reason }) => ({ oldId, newId, reason })),
            moves: migration.moves.map(({ name, oldId, newId, oldCode }) => ({ name, oldId, newId, oldCode })),
            referenceUpdates: migration.referenceUpdates.map(({ id, guestOldId, guestNewId, patch }) => ({
                id, guestOldId, guestNewId, patch
            }))
        }
    };
}

export function backupFileName(eventId, date = new Date()) {
    const stamp = date.toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '-')
        .replace(/\.\d{3}Z$/, 'Z');
    return `${eventId}-before-guest-renumber-${stamp}.json`;
}

export function chunkWrites(items, maximum = MAX_BATCH_WRITES) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_BATCH_WRITES) {
        throw new Error('guest-renumber/invalid-batch-size');
    }
    const chunks = [];
    for (let offset = 0; offset < items.length; offset += maximum) {
        chunks.push(items.slice(offset, offset + maximum));
    }
    return chunks;
}

export function verifyCreatedRecords(records, moves) {
    const byId = new Map(records.map((record) => [record.id, record.data]));
    const errors = [];
    moves.forEach((move) => {
        const actual = byId.get(move.newId);
        if (!actual) {
            errors.push(`${move.newId} no existe después de la creación`);
            return;
        }
        if (!firestoreValuesEqual(actual, move.newData)) errors.push(`${move.newId} no coincide exactamente con el origen`);
        if (actual.codigoInvitado !== move.newId) errors.push(`${move.newId}.codigoInvitado no coincide con el Document ID`);
        if (actual.qrToken !== move.data.qrToken) errors.push(`${move.newId}.qrToken cambió`);
        for (const field of ['pases', 'pasesUtilizados', 'pasesDisponibles']) {
            if (!firestoreValuesEqual(actual[field], move.data[field])) errors.push(`${move.newId}.${field} cambió`);
        }
    });
    return errors;
}

export function verifyReferenceRecords(records, updates) {
    const byId = new Map(records.map((record) => [record.id, record.data]));
    const errors = [];
    updates.forEach((update) => {
        const actual = byId.get(update.id);
        if (!actual) {
            errors.push(`checkin ${update.id} no existe`);
            return;
        }
        Object.entries(update.patch).forEach(([field, expected]) => {
            if (actual[field] !== expected) errors.push(`checkin ${update.id}.${field} no se actualizó a ${expected}`);
        });
        Object.keys(update.original).forEach((field) => {
            if (Object.hasOwn(update.patch, field)) return;
            if (!firestoreValuesEqual(actual[field], update.original[field])) {
                errors.push(`checkin ${update.id}.${field} cambió sin estar en el plan`);
            }
        });
    });
    return errors;
}

export function verifyFinalRecords(records, migration) {
    const errors = [];
    if (records.length !== migration.totalGuests) {
        errors.push(`cantidad final ${records.length}; se esperaba ${migration.totalGuests}`);
    }
    const byId = new Map(records.map((record) => [record.id, record.data]));
    for (let sequence = 1; sequence <= migration.totalGuests; sequence += 1) {
        const expectedId = formatGuestId(sequence);
        const data = byId.get(expectedId);
        if (!data) errors.push(`falta ${expectedId}`);
        else if (data.codigoInvitado !== expectedId) errors.push(`${expectedId}.codigoInvitado no coincide`);
    }
    migration.moves.forEach((move) => {
        if (move.oldId !== move.newId && byId.has(move.oldId)) errors.push(`el ID antiguo ${move.oldId} todavía existe`);
    });
    errors.push(...verifyCreatedRecords(records, migration.moves));
    return [...new Set(errors)];
}

export function verifyNoOldReferences(records, moves) {
    const oldIds = new Set(moves.filter((move) => move.oldId !== move.newId).map((move) => move.oldId));
    const oldCodes = new Set(moves
        .filter((move) => move.oldCode && move.oldCode !== move.newId)
        .map((move) => move.oldCode));
    const errors = [];
    records.forEach((record) => {
        for (const field of ['invitadoId', 'guestId']) {
            if (oldIds.has(String(record.data[field] ?? '').trim())) {
                errors.push(`checkin ${record.id}.${field} todavía contiene un ID antiguo`);
            }
        }
        if (oldCodes.has(String(record.data.codigoInvitado ?? '').trim())) {
            errors.push(`checkin ${record.id}.codigoInvitado todavía contiene un código antiguo`);
        }
    });
    return errors;
}

function createFirestoreAdapter({
    admin,
    db,
    eventRef,
    guestsRef,
    checkinsRef,
    eventSnapshot,
    initialGuests,
    initialCheckins,
    migration
}) {
    return {
        async acquireLock() {
            await db.runTransaction(async (transaction) => {
                const current = await transaction.get(eventRef);
                if (!current.exists) throw new Error('el evento dejó de existir');
                if (!current.updateTime.isEqual(eventSnapshot.updateTime)) {
                    throw new Error('el evento cambió después del dry-run; vuelve a ejecutar el plan');
                }
                if (current.data().guestRenumberingInProgress === true
                    || current.data().checkinRenumberingInProgress === true) {
                    throw new Error('ya existe una renumeración en curso');
                }
                transaction.update(eventRef, {
                    guestRenumberingInProgress: true,
                    guestRenumberingStartedAt: admin.FieldValue.serverTimestamp()
                });
            });
            try {
                const [currentGuests, currentCheckins] = await Promise.all([guestsRef.get(), checkinsRef.get()]);
                const guestErrors = verifySourceUnchanged(currentGuests.docs.map(toRecord), initialGuests, 'invitados');
                const checkinErrors = verifySourceUnchanged(currentCheckins.docs.map(toRecord), initialCheckins, 'checkins');
                const errors = [...guestErrors, ...checkinErrors];
                if (errors.length) throw new Error(errors.join('; '));
            } catch (error) {
                await eventRef.update({
                    guestRenumberingInProgress: admin.FieldValue.delete(),
                    guestRenumberingStartedAt: admin.FieldValue.delete()
                });
                throw error;
            }
        },

        async createGuests(moves) {
            const operations = [];
            moves.forEach((move) => {
                if (move.oldId === move.newId) {
                    if (move.data.codigoInvitado !== move.newId) {
                        operations.push({ type: 'update', id: move.oldId, patch: { codigoInvitado: move.newId } });
                    }
                } else {
                    operations.push({ type: 'create', id: move.newId, data: move.newData });
                }
            });
            await commitOperations(db, guestsRef, operations);
        },

        async verifyCreated(moves) {
            const records = await readGuestTargets(guestsRef, moves.map((move) => move.newId));
            const errors = verifyCreatedRecords(records, moves);
            if (errors.length) throw new Error(errors.join('; '));
        },

        async updateReferences(updates) {
            const operations = updates.map((update) => ({ type: 'update', id: update.id, patch: update.patch }));
            await commitOperations(db, checkinsRef, operations);
        },

        async verifyReferences(updates) {
            const records = await readDocumentTargets(checkinsRef, updates.map((update) => update.id));
            const errors = verifyReferenceRecords(records, updates);
            if (errors.length) throw new Error(errors.join('; '));
        },

        async deleteOldGuests(moves) {
            const operations = moves
                .filter((move) => move.oldId !== move.newId)
                .map((move) => ({ type: 'delete', id: move.oldId }));
            await commitOperations(db, guestsRef, operations);
        },

        async verifyFinal(plan) {
            const [guestSnapshot, checkinSnapshot] = await Promise.all([guestsRef.get(), checkinsRef.get()]);
            const guestErrors = verifyFinalRecords(guestSnapshot.docs.map(toRecord), plan);
            const checkinRecords = checkinSnapshot.docs.map(toRecord);
            const referenceErrors = verifyReferenceRecords(checkinRecords, plan.referenceUpdates);
            const staleReferenceErrors = verifyNoOldReferences(checkinRecords, plan.moves);
            const errors = [...guestErrors, ...referenceErrors, ...staleReferenceErrors];
            if (errors.length) throw new Error(errors.join('; '));
        },

        async finalize(totalGuests) {
            await eventRef.update({
                guestListFinalized: true,
                guestSequence: totalGuests,
                guestNumberingFinalizedAt: admin.FieldValue.serverTimestamp(),
                guestRenumberingInProgress: admin.FieldValue.delete(),
                guestRenumberingStartedAt: admin.FieldValue.delete()
            });
        }
    };
}

export function verifySourceUnchanged(currentRecords, initialRecords, label) {
    const current = new Map(currentRecords.map((record) => [record.id, record.data]));
    const initial = new Map(initialRecords.map((record) => [record.id, record.data]));
    const errors = [];
    if (current.size !== initial.size) errors.push(`${label}: cambió la cantidad de documentos después del plan`);
    initial.forEach((data, id) => {
        if (!current.has(id)) errors.push(`${label}/${id}: el documento desapareció después del plan`);
        else if (!firestoreValuesEqual(current.get(id), data)) errors.push(`${label}/${id}: cambió después del plan`);
    });
    current.forEach((_, id) => {
        if (!initial.has(id)) errors.push(`${label}/${id}: apareció después del plan`);
    });
    return errors;
}

async function commitOperations(db, collectionRef, operations) {
    for (const chunk of chunkWrites(operations)) {
        const batch = db.batch();
        chunk.forEach((operation) => {
            const target = collectionRef.doc(operation.id);
            if (operation.type === 'create') batch.create(target, operation.data);
            if (operation.type === 'update') batch.update(target, operation.patch);
            if (operation.type === 'delete') batch.delete(target);
        });
        await batch.commit();
    }
}

async function readGuestTargets(collectionRef, ids) {
    return readDocumentTargets(collectionRef, ids);
}

async function readDocumentTargets(collectionRef, ids) {
    const unique = [...new Set(ids)];
    const snapshots = await Promise.all(unique.map((id) => collectionRef.doc(id).get()));
    return snapshots.filter((snapshot) => snapshot.exists).map(toRecord);
}

async function confirmApply(eventId) {
    if (!input.isTTY || !output.isTTY) throw new Error('--apply requiere una terminal interactiva.');
    const prompt = createInterface({ input, output });
    try {
        const expected = `${CONFIRMATION_PREFIX} ${eventId}`;
        const answer = await prompt.question(`Escribe ${expected} para crear el backup y comenzar: `);
        if (answer.trim() !== expected) throw new Error('Confirmación cancelada; no se escribió nada.');
    } finally {
        prompt.close();
    }
}

async function createBackup({ eventId, event, guests, checkins, migration }) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const directory = path.join(root, 'backups');
    await mkdir(directory, { recursive: true });
    const filePath = path.join(directory, backupFileName(eventId));
    const payload = buildBackupPayload({ eventId, event, guests, checkins, migration });
    await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return filePath;
}

function printPlan(migration, apply) {
    console.log('\nEVENTO:');
    console.log(migration.eventId);
    console.log(`MODO: ${apply ? 'APPLY solicitado (todavía sin escrituras)' : 'DRY RUN'}`);
    if (migration.protectedGuestId) {
        console.log(`\n${migration.protectedGuestId}:`);
        console.log(migration.preserved.length ? 'preservado' : 'NO DISPONIBLE COMO REFERENCIA VÁLIDA');
    }
    console.log('\nPLAN:');
    migration.moves.forEach((move) => {
        console.log(`\n${move.position}.`);
        console.log(`Nombre: ${move.name || '(sin nombre)'}`);
        console.log(`Old ID: ${move.oldId}`);
        console.log(`New ID: ${move.newId}`);
        const references = migration.referenceUpdates.filter((update) => update.guestOldId === move.oldId);
        console.log(`Referencias encontradas: ${references.length}`);
        references.forEach((reference) => {
            console.log(`  checkins/${reference.id}: ${Object.keys(reference.patch).join(', ')}`);
        });
    });
    console.log('\nRESUMEN');
    console.table({
        'Total invitados': migration.totalGuests,
        Preservados: migration.preserved.length + migration.moves.filter((move) => !move.requiresMove).length,
        'A renumerar': migration.moves.filter((move) => move.requiresMove).length,
        'Referencias a actualizar': migration.referenceUpdates.length,
        Conflictos: migration.conflicts.length + migration.referenceConflicts.length,
        Errores: migration.errors.length,
        'Checkins afectados': migration.checkinsAffected
    });
    migration.conflicts.forEach((conflict) => console.log(`CONFLICTO: ${conflict.message}.`));
    migration.errors.forEach((error) => console.log(`ERROR: ${error}.`));
    console.log(`\nRESULTADO: ${migration.canApply ? 'PLAN VÁLIDO' : 'APLICACIÓN BLOQUEADA'}`);
}

function toRecord(snapshot) {
    return { id: snapshot.id, data: snapshot.data(), ref: snapshot.ref };
}

function firestoreValuesEqual(left, right) {
    return stableStringify(serializeFirestoreValue(left)) === stableStringify(serializeFirestoreValue(right));
}

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function serializeFirestoreValue(value) {
    if (isTimestamp(value)) {
        const millis = value.toMillis();
        return {
            __type: 'timestamp',
            seconds: Number.isSafeInteger(value.seconds) ? value.seconds : Math.floor(millis / 1000),
            nanoseconds: Number.isSafeInteger(value.nanoseconds) ? value.nanoseconds : Math.round((millis % 1000) * 1_000_000),
            iso: value.toDate().toISOString()
        };
    }
    if (value?.constructor?.name === 'GeoPoint') {
        return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
    }
    if (value?.constructor?.name === 'DocumentReference') return { __type: 'reference', path: value.path };
    if (Buffer.isBuffer(value) || value?.constructor?.name === 'Bytes') {
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value.toUint8Array());
        return { __type: 'bytes', base64: bytes.toString('base64') };
    }
    if (typeof value === 'number' && Number.isNaN(value)) return { __type: 'number', value: 'NaN' };
    if (value === Infinity) return { __type: 'number', value: 'Infinity' };
    if (value === -Infinity) return { __type: 'number', value: '-Infinity' };
    if (Object.is(value, -0)) return { __type: 'number', value: '-0' };
    if (Array.isArray(value)) return value.map(serializeFirestoreValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeFirestoreValue(child)]));
    }
    return value;
}

function isTimestamp(value) {
    return value?.constructor?.name === 'Timestamp'
        && typeof value.toDate === 'function'
        && typeof value.toMillis === 'function';
}

function isSafeDocumentId(value) {
    return typeof value === 'string'
        && value.trim().length > 0
        && value.trim().length <= 1_500
        && !value.includes('/');
}

function isMainModule() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function loadFirebaseAdmin() {
    try {
        const [app, firestore] = await Promise.all([
            import('firebase-admin/app'),
            import('firebase-admin/firestore')
        ]);
        return { ...app, ...firestore };
    } catch (error) {
        throw new Error(`Falta firebase-admin. Ejecuta npm install. Detalle: ${error?.message || error}`);
    }
}
