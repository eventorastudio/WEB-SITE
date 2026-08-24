#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateInvitationDraftToCurrentSchema } from '../admin/invitations/core/draft-migrations.js?v=phase123-draft-migration-architecture-20260824';
import {
    deserializeInvitationDraft,
    findCanonicalDifferences,
    serializeInvitationDraft
} from '../admin/invitations/core/draft-persistence-schema.js?v=phase123-draft-migration-architecture-20260824';

const DEFAULT_PROJECT_ID = 'eventorastudio-d6d95';
const APPLY_CONFIRMATION = 'APPLY INVITATION DRAFT';

if (isMainModule()) {
    const options = parseArguments(process.argv.slice(2));
    if (!options.valid) {
        console.error(options.error);
        console.error('Uso: node scripts/migrate-invitation-draft-one-off.mjs --event EVT-0001 --dry-run');
        process.exitCode = 1;
    } else {
        await run(options).catch((error) => {
            console.error(`ERROR: ${error?.message || error}`);
            process.exitCode = 1;
        });
    }
}

export function parseArguments(args) {
    let eventId = '';
    let dryRun = false;
    let apply = false;
    let confirmation = '';
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--event') eventId = args[++index] ?? '';
        else if (arg === '--dry-run') dryRun = true;
        else if (arg === '--apply') apply = true;
        else if (arg === '--confirm') confirmation = args[++index] ?? '';
        else return { valid: false, error: `Opción no reconocida: ${arg}` };
    }
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(eventId)) return { valid: false, error: 'Debes indicar un eventId seguro con --event.' };
    if (!dryRun && !apply) return { valid: false, error: 'La primera ejecución debe ser explícitamente --dry-run.' };
    if (apply && !dryRun) return { valid: false, error: '--apply requiere ejecutar también --dry-run.' };
    if (dryRun && apply && confirmation !== `${APPLY_CONFIRMATION} ${eventId}`) {
        return { valid: false, error: `--apply requiere --confirm "${APPLY_CONFIRMATION} ${eventId}".` };
    }
    return { valid: true, eventId, dryRun, apply, confirmation };
}

export function buildMigrationReport(rawDraft, eventId) {
    const migrated = migrateInvitationDraftToCurrentSchema(rawDraft);
    const runtime = deserializeInvitationDraft(migrated, eventId);
    const current = serializeInvitationDraft(runtime, {
        eventId,
        updatedAt: migrated.updatedAt,
        updatedBy: migrated.updatedBy
    });
    const differences = findCanonicalDifferences(rawDraft, current, { limit: 1000 });
    assertIntegrity(migrated, current);
    return { migrated, runtime, current, differences };
}

export async function createLocalBackup(eventId, rawDraft, directory = path.resolve('backups', 'invitation-drafts')) {
    await mkdir(directory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(directory, `${eventId}-${timestamp}.json`);
    await writeFile(backupPath, JSON.stringify({
        backupType: 'invitation-draft-original',
        createdAt: new Date().toISOString(),
        eventId,
        path: `eventos/${eventId}/invitacion/draft`,
        document: serializeFirestoreValue(rawDraft)
    }, null, 2), 'utf8');
    return backupPath;
}

function assertIntegrity(migrated, current) {
    const locationCount = migrated.locations.length;
    if (current.locations.length !== locationCount) throw new Error('integrity/location-count-changed');
    for (let index = 0; index < locationCount; index += 1) {
        const before = migrated.locations[index];
        const after = current.locations[index];
        for (const field of ['id', 'title', 'venueName', 'time', 'address']) {
            if (before[field] !== after[field]) throw new Error(`integrity/location-${field}-changed`);
        }
        if (before.imageMediaId !== after.imageMediaId) throw new Error(`integrity/location-${index}-image-media-id-changed`);
    }
    if ((migrated.accommodations?.length ?? 0) !== (current.accommodations?.length ?? 0)) {
        throw new Error('integrity/accommodations-count-changed');
    }
    for (let index = 0; index < (migrated.accommodations?.length ?? 0); index += 1) {
        for (const field of ['id', 'name', 'address']) {
            if (migrated.accommodations[index][field] !== current.accommodations[index][field]) {
                throw new Error(`integrity/accommodation-${field}-changed`);
            }
        }
    }
    if (!current.content?.welcome?.opening) throw new Error('integrity/opening-missing');
    if (migrated.settings?.packageId !== current.settings?.packageId
        || migrated.settings?.format !== current.settings?.format
        || migrated.settings?.renderMode !== current.settings?.renderMode) {
        throw new Error('integrity/settings-changed');
    }
    if (migrated.content?.rsvp && !current.content?.rsvp) throw new Error('integrity/rsvp-missing');
    for (const section of ['identity', 'schedule', 'place', 'welcome', 'countdown', 'location', 'dressCode', 'music', 'video', 'gallery', 'gifts', 'passes', 'itinerary', 'access']) {
        if (!Object.hasOwn(current.content, section)) throw new Error(`integrity/content-${section}-missing`);
    }
    if (Object.hasOwn(migrated.content, 'rsvp') && !Object.hasOwn(current.content, 'rsvp')) {
        throw new Error('integrity/content-rsvp-missing');
    }
}

export async function run({ eventId, dryRun, apply }) {
    const admin = await loadFirebaseAdmin();
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID;
    if (admin.getApps().length === 0) admin.initializeApp({ credential: admin.applicationDefault(), projectId });
    const db = admin.getFirestore();
    const draftRef = db.collection('eventos').doc(eventId).collection('invitacion').doc('draft');
    const snapshot = await draftRef.get();
    if (!snapshot.exists) throw new Error(`No existe eventos/${eventId}/invitacion/draft.`);
    const rawDraft = snapshot.data();
    const report = buildMigrationReport(rawDraft, eventId);
    printReport(eventId, report, dryRun, apply);
    if (dryRun && !apply) {
        console.log('\nDRY RUN completado: no se creó backup y no se escribió Firestore.');
        return { ...report, applied: false };
    }
    if (apply) {
        throw new Error('Modo --apply preparado pero bloqueado en esta fase; requiere revisión humana posterior al dry-run.');
    }
    return { ...report, applied: false };
}

function printReport(eventId, { migrated, current, differences }, dryRun, apply) {
    console.log(`EVENTO: ${eventId}`);
    console.log(`MODO: ${apply ? 'APPLY (bloqueado)' : dryRun ? 'DRY RUN' : 'no-escritura'}`);
    console.log(`schemaVersion: ${migrated.schemaVersion}`);
    console.log(`contentSchemaVersion: ${migrated.contentSchemaVersion}`);
    console.log(`locations: ${migrated.locations.length} → ${current.locations.length}`);
    console.log(`locations[1].imageMediaId: ${structuralStatus(migrated.locations?.[1]?.imageMediaId, current.locations?.[1]?.imageMediaId)}`);
    console.log(`accommodations: ${migrated.accommodations.length} → ${current.accommodations.length}`);
    console.log(`diferencias estructurales: ${differences.length}`);
    for (const difference of differences) console.log(JSON.stringify(difference));
}

function structuralStatus(before, after) {
    if (before === after) return 'preserved';
    return `${presenceType(before)} → ${presenceType(after)}`;
}

function presenceType(value) {
    if (value === undefined) return 'missing';
    if (value === null) return 'null';
    return typeof value;
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

async function loadFirebaseAdmin() {
    try {
        const [app, firestore] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/firestore')]);
        return { ...app, ...firestore };
    } catch (error) {
        throw new Error(`Falta firebase-admin. Detalle: ${error?.message || error}`);
    }
}

function isMainModule() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
