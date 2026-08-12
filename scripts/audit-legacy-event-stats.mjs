#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
    LEGACY_EVENT_STATS_FIELDS,
    getStoredEventStats
} from '../shared/event-stats.js';

const DEFAULT_PROJECT_ID = 'eventorastudio-d6d95';

if (isMainModule()) {
    const options = parseArguments(process.argv.slice(2));
    if (!options.valid) {
        console.error(options.error);
        console.error('Uso: node scripts/audit-legacy-event-stats.mjs [eventId]');
        process.exitCode = 1;
    } else {
        await run(options).catch((error) => {
            console.error(`\nERROR: ${error?.message || error}`);
            process.exitCode = 1;
        });
    }
}

export function parseArguments(args) {
    if (args.length > 1) return { valid: false, error: 'Sólo se permite un eventId opcional.' };
    const eventId = args[0] ?? null;
    if (eventId !== null && !isSafeDocumentId(eventId)) {
        return { valid: false, error: 'El eventId no puede estar vacío ni contener "/".' };
    }
    return { valid: true, eventId };
}

export function auditLegacyEventData(eventId, eventData = {}) {
    const legacy = Object.fromEntries(LEGACY_EVENT_STATS_FIELDS
        .filter((field) => Object.hasOwn(eventData, field))
        .map((field) => [field, eventData[field]]));
    return {
        eventId,
        hasLegacyFields: Object.keys(legacy).length > 0,
        legacy,
        estadisticas: getStoredEventStats(eventData),
        status: Object.keys(legacy).length > 0
            ? 'LEGACY FIELDS PRESENT — IGNORED BY APPLICATION'
            : 'NO LEGACY EVENT STATS FIELDS'
    };
}

export async function run({ eventId = null } = {}) {
    const admin = await loadFirebaseAdmin();
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID;
    if (admin.getApps().length === 0) {
        admin.initializeApp({ credential: admin.applicationDefault(), projectId });
    }

    const db = admin.getFirestore();
    const records = eventId
        ? await readOneEvent(db, eventId)
        : await readAllEvents(db);
    const audits = records.map(({ id, data }) => auditLegacyEventData(id, data));
    const withLegacy = audits.filter((audit) => audit.hasLegacyFields);

    if (withLegacy.length === 0) {
        console.log('No se encontraron campos legacy de estadísticas en los eventos consultados.');
    } else {
        withLegacy.forEach(printAudit);
    }
    console.log(`\nEventos consultados: ${audits.length}`);
    console.log(`Eventos con campos legacy: ${withLegacy.length}`);
    console.log('AUDITORÍA DE SOLO LECTURA: Firestore no fue modificado.');
    return audits;
}

async function readOneEvent(db, eventId) {
    const snapshot = await db.collection('eventos').doc(eventId).get();
    if (!snapshot.exists) throw new Error(`No existe eventos/${eventId}.`);
    return [{ id: snapshot.id, data: snapshot.data() }];
}

async function readAllEvents(db) {
    const snapshot = await db.collection('eventos').get();
    return snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
}

function printAudit(audit) {
    console.log(`\nEVENTO: ${audit.eventId}`);
    console.log(audit.status);
    for (const field of LEGACY_EVENT_STATS_FIELDS) {
        if (Object.hasOwn(audit.legacy, field)) console.log(`${field}: ${formatValue(audit.legacy[field])}`);
    }
    console.log('estadisticas:');
    if (!audit.estadisticas) {
        console.log('  RESUMEN CANÓNICO NO DISPONIBLE');
        return;
    }
    for (const field of ['guestCount', 'totalPases', 'pasesConfirmados', 'pasesPendientes', 'pasesUtilizados']) {
        console.log(`  ${field}: ${audit.estadisticas[field]}`);
    }
}

function formatValue(value) {
    if (value === null) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
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
