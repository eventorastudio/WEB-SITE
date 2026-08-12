#!/usr/bin/env node
/*
 * Dry run: node scripts/renumber-checkins-by-guest.mjs <eventId>
 * Apply:   node scripts/renumber-checkins-by-guest.mjs <eventId> --apply
 *
 * Firestore no renombra documentos: se crea, verifica y solo entonces se
 * elimina el origen. El modo por defecto no escribe ni crea backups.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
    createCheckinRenumberPlan,
    timestampParts
} from '../shared/checkin-numbering.js';

export const MAX_BATCH_WRITES = 400;
const DEFAULT_PROJECT_ID = 'eventorastudio-d6d95';

if (isMainModule()) {
    const options = parseArguments(process.argv.slice(2));
    if (!options.valid) {
        console.error(options.error);
        console.error('Uso: node scripts/renumber-checkins-by-guest.mjs <eventId> [--apply]');
        process.exitCode = 1;
    } else {
        await run(options).catch((error) => {
            console.error(`\nERROR: ${error?.message || error}`);
            if (error?.phase) console.error(`Fase detenida: ${error.phase}`);
            if (error?.backupPath) console.error(`Backup para recuperación: ${error.backupPath}`);
            console.error('No borres documentos manualmente; revisa el backup y las fases completadas.');
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
    const [eventSnapshot, guestSnapshot, checkinSnapshot] = await Promise.all([
        eventRef.get(),
        guestsRef.get(),
        checkinsRef.get()
    ]);
    if (!eventSnapshot.exists) throw new Error(`No existe eventos/${eventId}.`);

    const guests = guestSnapshot.docs.map(toRecord);
    const checkins = checkinSnapshot.docs.map(toRecord);
    const migration = createCheckinRenumberPlan({ guests, checkins });
    printPlan(eventId, migration, apply);
    if (!apply) {
        console.log('\nDRY RUN completado: no se creó backup y no se escribió en Firestore.');
        return migration;
    }
    if (!migration.canApply) throw new Error('Aplicación bloqueada por conflictos o documentos inválidos.');

    await confirmApply(eventId);
    const backupPath = await createBackup({
        eventId,
        event: eventSnapshot.data(),
        guests,
        checkins,
        migration
    });
    console.log(`\nBackup creado antes de la primera escritura: ${backupPath}`);

    const adapter = createFirestoreAdapter({
        admin,
        db,
        eventRef,
        guestsRef,
        checkinsRef,
        eventSnapshot,
        initialGuests: guests,
        initialCheckins: checkins,
        initialTotal: checkins.length
    });
    try {
        await executeMigrationPhases({ migration, adapter, backupPath });
    } catch (error) {
        error.backupPath = backupPath;
        throw error;
    }
    console.log(`\nMigración completada: ${checkins.length} check-ins verificados.`);
}

export function parseArguments(args) {
    const eventId = args[0];
    const flags = args.slice(1);
    if (!isSafeDocumentId(eventId)) return { valid: false, error: 'El eventId es obligatorio y no puede contener "/".' };
    if (flags.some((flag) => flag !== '--apply')) return { valid: false, error: 'Opción no reconocida.' };
    if (flags.filter((flag) => flag === '--apply').length > 1) return { valid: false, error: '--apply está repetido.' };
    return { valid: true, eventId, apply: flags.includes('--apply') };
}

export function buildBackupPayload({ eventId, event, guests, checkins, migration, createdAt = new Date() }) {
    return {
        format: 'eventora-checkin-renumber-backup-v1',
        eventId,
        createdAt: createdAt.toISOString(),
        event: serializeFirestoreValue(event),
        checkins: checkins.map((record) => ({
            oldDocumentId: record.id,
            data: serializeFirestoreValue(record.data)
        })),
        guestCountersBefore: guests.map((record) => ({
            guestId: record.id,
            checkinSecuencia: serializeFirestoreValue(record.data?.checkinSecuencia)
        })),
        plan: migration.moves.map(({ oldId, newId, guestId, sequence }) => ({ oldId, newId, guestId, sequence }))
    };
}

export function backupFileName(eventId, date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${eventId}-checkins-before-renumber-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;
}

export async function executeMigrationPhases({ migration, adapter, backupPath = null }) {
    const phases = [
        ['1. bloquear y revalidar orígenes', () => adapter.acquireLock()],
        ['2. crear documentos nuevos', () => adapter.createNew(migration.moves)],
        ['3. verificar copias campo por campo', () => adapter.verifyCreated(migration.moves)],
        ['3b. actualizar únicamente checkinSecuencia', () => adapter.updateGuestSequences(migration.guestSequenceUpdates)],
        ['3c. verificar checkinSecuencia', () => adapter.verifyGuestSequences(migration.guestSequenceUpdates)],
        ['4. eliminar documentos antiguos ya verificados', () => adapter.deleteOld(migration.moves)],
        ['5. verificar colección final', () => adapter.verifyFinal(migration)],
        ['6. liberar bloqueo', () => adapter.releaseLock()]
    ];
    const completedPhases = [];
    for (const [name, action] of phases) {
        try {
            await action();
            completedPhases.push(name);
        } catch (cause) {
            const error = new Error(`${name}: ${cause?.message || cause}`);
            error.phase = name;
            error.backupPath = backupPath;
            error.completedPhases = completedPhases;
            error.cause = cause;
            throw error;
        }
    }
    return { completedPhases };
}

export function verifyCreatedRecords(records, moves) {
    const actualById = new Map(records.map((record) => [record.id, record.data]));
    const errors = [];
    for (const move of moves) {
        if (!actualById.has(move.newId)) errors.push(`${move.newId} no existe`);
        else if (!firestoreValuesEqual(actualById.get(move.newId), move.data)) {
            errors.push(`${move.newId} no conserva exactamente los datos de ${move.oldId}`);
        }
    }
    return errors;
}

export function verifyGuestSequenceRecords(records, updates) {
    const actualById = new Map(records.map((record) => [record.id, record.data]));
    const errors = [];
    for (const update of updates) {
        const actual = actualById.get(update.guestId);
        if (!actual) errors.push(`invitados/${update.guestId} no existe`);
        else if (actual.checkinSecuencia !== update.expected) {
            errors.push(`invitados/${update.guestId}.checkinSecuencia es ${actual.checkinSecuencia}; se esperaba ${update.expected}`);
        }
    }
    return errors;
}

export function verifyFinalRecords(records, migration, initialTotal = migration.totalCheckins) {
    const errors = [];
    if (records.length !== initialTotal) errors.push(`total final ${records.length}; se esperaba ${initialTotal}`);
    errors.push(...verifyCreatedRecords(records, migration.moves));
    const expectedIds = new Set(migration.moves.map((move) => move.newId));
    for (const record of records) {
        if (!expectedIds.has(record.id)) errors.push(`permanece un Document ID no planificado: ${record.id}`);
    }
    return errors;
}

export function verifySourceUnchanged(currentRecords, initialRecords, label) {
    const current = new Map(currentRecords.map((record) => [record.id, record.data]));
    const initial = new Map(initialRecords.map((record) => [record.id, record.data]));
    const errors = [];
    if (current.size !== initial.size) errors.push(`${label}: cambió la cantidad de documentos`);
    for (const [id, data] of initial) {
        if (!current.has(id)) errors.push(`${label}/${id}: desapareció`);
        else if (!firestoreValuesEqual(current.get(id), data)) errors.push(`${label}/${id}: cambió después del plan`);
    }
    for (const id of current.keys()) {
        if (!initial.has(id)) errors.push(`${label}/${id}: apareció después del plan`);
    }
    return errors;
}

export function chunkWrites(items, maximum = MAX_BATCH_WRITES) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_BATCH_WRITES) {
        throw new Error('checkin-renumber/invalid-batch-size');
    }
    const chunks = [];
    for (let offset = 0; offset < items.length; offset += maximum) chunks.push(items.slice(offset, offset + maximum));
    return chunks;
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
    initialTotal
}) {
    return {
        async acquireLock() {
            await db.runTransaction(async (transaction) => {
                const current = await transaction.get(eventRef);
                if (!current.exists) throw new Error('el evento dejó de existir');
                if (!current.updateTime.isEqual(eventSnapshot.updateTime)) {
                    throw new Error('el evento cambió después del plan; vuelve a ejecutar el dry-run');
                }
                const event = current.data();
                if (event.guestRenumberingInProgress === true || event.checkinRenumberingInProgress === true) {
                    throw new Error('ya existe una renumeración en curso');
                }
                transaction.update(eventRef, {
                    checkinRenumberingInProgress: true,
                    checkinRenumberingStartedAt: admin.FieldValue.serverTimestamp()
                });
            });
            try {
                const [guests, checkins] = await Promise.all([guestsRef.get(), checkinsRef.get()]);
                const errors = [
                    ...verifySourceUnchanged(guests.docs.map(toRecord), initialGuests, 'invitados'),
                    ...verifySourceUnchanged(checkins.docs.map(toRecord), initialCheckins, 'checkins')
                ];
                if (errors.length) throw new Error(errors.join('; '));
            } catch (error) {
                await eventRef.update({
                    checkinRenumberingInProgress: admin.FieldValue.delete(),
                    checkinRenumberingStartedAt: admin.FieldValue.delete()
                });
                throw error;
            }
        },

        async createNew(moves) {
            const operations = moves
                .filter((move) => move.oldId !== move.newId)
                .map((move) => ({ type: 'create', id: move.newId, data: move.data }));
            await commitOperations(db, checkinsRef, operations);
        },

        async verifyCreated(moves) {
            const records = await readTargets(checkinsRef, moves.map((move) => move.newId));
            const errors = verifyCreatedRecords(records, moves);
            if (errors.length) throw new Error(errors.join('; '));
        },

        async updateGuestSequences(updates) {
            await commitOperations(db, guestsRef, updates.map((update) => ({
                type: 'update',
                id: update.guestId,
                data: { checkinSecuencia: update.expected }
            })));
        },

        async verifyGuestSequences(updates) {
            const records = await readTargets(guestsRef, updates.map((update) => update.guestId));
            const errors = verifyGuestSequenceRecords(records, updates);
            if (errors.length) throw new Error(errors.join('; '));
        },

        async deleteOld(moves) {
            const operations = moves
                .filter((move) => move.oldId !== move.newId)
                .map((move) => ({ type: 'delete', id: move.oldId }));
            await commitOperations(db, checkinsRef, operations);
        },

        async verifyFinal(migration) {
            const [checkins, guests] = await Promise.all([checkinsRef.get(), guestsRef.get()]);
            const errors = [
                ...verifyFinalRecords(checkins.docs.map(toRecord), migration, initialTotal),
                ...verifyGuestSequenceRecords(guests.docs.map(toRecord), migration.guestSequenceUpdates)
            ];
            if (errors.length) throw new Error(errors.join('; '));
        },

        async releaseLock() {
            await eventRef.update({
                checkinRenumberingInProgress: admin.FieldValue.delete(),
                checkinRenumberingStartedAt: admin.FieldValue.delete()
            });
        }
    };
}

async function commitOperations(db, collectionRef, operations) {
    for (const chunk of chunkWrites(operations)) {
        const batch = db.batch();
        for (const operation of chunk) {
            const target = collectionRef.doc(operation.id);
            if (operation.type === 'create') batch.create(target, operation.data);
            if (operation.type === 'update') batch.update(target, operation.data);
            if (operation.type === 'delete') batch.delete(target);
        }
        await batch.commit();
    }
}

async function readTargets(collectionRef, ids) {
    const snapshots = await Promise.all([...new Set(ids)].map((id) => collectionRef.doc(id).get()));
    return snapshots.filter((snapshot) => snapshot.exists).map(toRecord);
}

async function confirmApply(eventId) {
    if (!input.isTTY || !output.isTTY) throw new Error('--apply requiere una terminal interactiva.');
    const expected = `RENUMERAR CHECKINS ${eventId}`;
    const prompt = createInterface({ input, output });
    try {
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

function printPlan(eventId, migration, apply) {
    console.log(`\nEVENTO: ${eventId}`);
    console.table({
        'Total check-ins': migration.totalCheckins,
        'Invitados con check-ins': migration.guestsWithCheckins,
        'Documentos a renombrar': migration.documentsToRename,
        Conflictos: migration.conflicts.length,
        Inválidos: migration.errors.length,
        'Contadores a preparar': migration.guestSequenceUpdates.length
    });
    console.log('\nPLAN:');
    for (const move of migration.moves) {
        console.log(`\n${move.guestName || '(sin nombre)'}`);
        console.log(`Invitado: ${move.guestId}`);
        console.log(`OLD: ${move.oldId}`);
        console.log(`NEW: ${move.newId}`);
        console.log(`Fecha: ${formatTimestamp(move.data.fechaHora)}`);
        console.log('-----------------');
    }
    if (migration.errors.length) {
        console.log('\nINVÁLIDOS:');
        migration.errors.forEach((error) => console.log(`- ${error}`));
    }
    if (migration.conflicts.length) {
        console.log('\nCONFLICTOS:');
        migration.conflicts.forEach((error) => console.log(`- ${error}`));
    }
    console.log(`\nMODO: ${apply ? 'APPLY solicitado; aún no se escribió nada' : 'DRY RUN (solo lectura)'}`);
    if (!migration.canApply) console.log('BLOQUEO: --apply no está permitido con el plan actual.');
}

function formatTimestamp(value) {
    const parts = timestampParts(value);
    if (!parts) return '(Timestamp inválido)';
    return new Date((parts.seconds * 1000) + Math.floor(parts.nanoseconds / 1_000_000))
        .toISOString()
        .replace('T', ' ')
        .replace('Z', ' UTC');
}

function toRecord(snapshot) {
    return { id: snapshot.id, data: snapshot.data() };
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
    const parts = timestampParts(value);
    if (parts && (value?.constructor?.name === 'Timestamp' || typeof value?.toDate === 'function')) {
        return { __type: 'timestamp', seconds: parts.seconds, nanoseconds: parts.nanoseconds };
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

function isSafeDocumentId(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 1_500 && !value.includes('/');
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
