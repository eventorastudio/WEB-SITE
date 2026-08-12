#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
    EVENT_STATS_FIELDS,
    EVENT_STATS_SCHEMA_VERSION,
    calculateEventStats,
    getStoredEventStats
} from '../shared/event-stats.js';

const DEFAULT_PROJECT_ID = 'eventorastudio-d6d95';
const CONFIRMATION_PREFIX = 'RECONSTRUIR ESTADISTICAS';

if (isMainModule()) {
    const options = parseArguments(process.argv.slice(2));
    if (!options.valid) {
        console.error(options.error);
        console.error('Uso: node scripts/rebuild-event-stats.mjs <eventId> [--apply]');
        process.exitCode = 1;
    } else {
        await run(options).catch((error) => {
            console.error(`\nERROR: ${error?.message || error}`);
            if (error?.backupPath) console.error(`Backup: ${error.backupPath}`);
            process.exitCode = 1;
        });
    }
}

export function parseArguments(args) {
    const eventId = args[0];
    const flags = args.slice(1);
    if (!isSafeDocumentId(eventId)) return { valid: false, error: 'El eventId es obligatorio y no puede contener "/".' };
    if (flags.some((flag) => flag !== '--apply')) return { valid: false, error: 'Opción no reconocida.' };
    if (flags.filter((flag) => flag === '--apply').length > 1) return { valid: false, error: '--apply está repetido.' };
    return { valid: true, eventId, apply: flags.includes('--apply') };
}

export async function run({ eventId, apply }) {
    const admin = await loadFirebaseAdmin();
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID;
    if (admin.getApps().length === 0) {
        admin.initializeApp({ credential: admin.applicationDefault(), projectId });
    }

    const db = admin.getFirestore();
    const eventRef = db.collection('eventos').doc(eventId);
    const [eventSnapshot, guestsSnapshot] = await Promise.all([
        eventRef.get(),
        eventRef.collection('invitados').get()
    ]);
    if (!eventSnapshot.exists) throw new Error(`No existe eventos/${eventId}.`);

    const eventData = eventSnapshot.data();
    const stored = getStoredEventStats(eventData);
    const legacy = readLegacyStatsForReport(eventData);
    const actual = calculateEventStats(guestsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    const differences = buildReportDifferences(stored, legacy, actual);
    printReport({ eventId, stored, legacy, actual, differences, apply });

    if (!apply) {
        console.log('\nDRY RUN completado. No se creó backup y no se escribió en Firestore.');
        return { eventId, stored, actual, differences, applied: false };
    }

    await confirmApply(eventId);
    const backupPath = await createBackup(eventId, eventData);
    console.log(`\nBackup creado antes de modificar el evento: ${backupPath}`);

    const expectedRevision = revisionOf(eventData);
    try {
        await db.runTransaction(async (transaction) => {
            const current = await transaction.get(eventRef);
            if (!current.exists) throw new Error(`No existe eventos/${eventId}.`);
            if (revisionOf(current.data()) !== expectedRevision) {
                throw new Error('Los invitados cambiaron después del dry-run interno. Ejecuta nuevamente el comando.');
            }
            transaction.update(eventRef, {
                estadisticas: actual,
                statsSchemaVersion: EVENT_STATS_SCHEMA_VERSION,
                statsUpdatedAt: admin.FieldValue.serverTimestamp()
            });
        });
    } catch (error) {
        error.backupPath = backupPath;
        throw error;
    }

    console.log('\nEstadísticas reconstruidas correctamente. Los campos legacy se conservaron sin cambios.');
    return { eventId, stored, actual, differences, applied: true, backupPath };
}

export function printReport({ eventId, stored, legacy, actual, differences, apply = false }) {
    console.log(`EVENTO: ${eventId}`);
    console.log(`MODO: ${apply ? 'APPLY solicitado (aún sin confirmar)' : 'DRY RUN'}`);
    console.log('\nEstadísticas almacenadas:');
    printStats(stored);
    if (legacy && Object.keys(legacy).length > 0) {
        console.log('\nCampos legacy encontrados (sólo diagnóstico, la aplicación no los consume):');
        for (const [field, value] of Object.entries(legacy)) console.log(`${field}: ${value}`);
    }
    console.log('\nEstadísticas reales calculadas:');
    printStats(actual);
    console.log('\nDiferencias:');
    const entries = Object.entries(differences);
    if (entries.length === 0) {
        console.log('Sin diferencias.');
    } else {
        for (const [field, values] of entries) {
            console.log(`${field}: almacenado=${values.stored ?? 'NO DISPONIBLE'} real=${values.actual}`);
        }
    }
}

export function readLegacyStatsForReport(eventData = {}) {
    const candidates = {
        totalPases: eventData.totalInvitados ?? eventData.invitados,
        pasesConfirmados: eventData.confirmados,
        pasesPendientes: eventData.pendientes,
        pasesNoAsistiran: eventData.noAsisten ?? eventData.noAsiste,
        pasesUtilizados: eventData.llegaron ?? eventData.llegadas
    };
    return Object.fromEntries(Object.entries(candidates).filter(([, value]) => {
        const number = Number(value);
        return Number.isSafeInteger(number) && number >= 0;
    }).map(([field, value]) => [field, Number(value)]));
}

export function buildReportDifferences(stored, legacy, actual) {
    const differences = {};
    for (const field of EVENT_STATS_FIELDS) {
        const storedValue = stored?.[field] ?? legacy?.[field] ?? null;
        if (storedValue !== actual[field]) differences[field] = { stored: storedValue, actual: actual[field] };
    }
    return differences;
}

function printStats(stats) {
    if (!stats) {
        console.log('Resumen canónico NO DISPONIBLE (los campos legacy no se usan como fallback).');
        return;
    }
    for (const field of EVENT_STATS_FIELDS) console.log(`${field}: ${stats[field]}`);
}

async function confirmApply(eventId) {
    const expected = `${CONFIRMATION_PREFIX} ${eventId}`;
    const prompt = createInterface({ input, output });
    try {
        const answer = await prompt.question(`\nEscribe exactamente "${expected}" para continuar: `);
        if (answer.trim() !== expected) throw new Error('Confirmación incorrecta. No se realizó ningún cambio.');
    } finally {
        prompt.close();
    }
}

async function createBackup(eventId, eventData) {
    const directory = path.resolve('backups', 'event-stats');
    await mkdir(directory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(directory, `${eventId}-${timestamp}.json`);
    await writeFile(backupPath, JSON.stringify({
        createdAt: new Date().toISOString(),
        eventId,
        path: `eventos/${eventId}`,
        event: serializeFirestoreValue(eventData)
    }, null, 2), 'utf8');
    return backupPath;
}

function serializeFirestoreValue(value) {
    if (value?.toDate && typeof value.toDate === 'function') {
        return { __type: 'timestamp', iso: value.toDate().toISOString() };
    }
    if (Array.isArray(value)) return value.map(serializeFirestoreValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeFirestoreValue(child)]));
    }
    return value;
}

function revisionOf(eventData) {
    const value = Number(eventData?.statsRevision);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function isSafeDocumentId(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 1_500 && !value.includes('/');
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
