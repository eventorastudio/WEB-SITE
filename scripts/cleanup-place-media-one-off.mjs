#!/usr/bin/env node

import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PROJECT_ID = 'eventorastudio-d6d95';
const BUCKET = 'eventorastudio-d6d95.firebasestorage.app';
const CONFIRMATION = 'DELETE ORPHAN PLACE MEDIA';

function parseArgs(args) {
    let event = '', dryRun = false, apply = false, confirm = '';
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--event') event = args[++i] ?? '';
        else if (args[i] === '--dry-run') dryRun = true;
        else if (args[i] === '--apply') apply = true;
        else if (args[i] === '--confirm') confirm = args[++i] ?? '';
        else return { valid: false, error: `Unknown option: ${args[i]}` };
    }
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(event)) return { valid: false, error: 'Use --event with a safe event id.' };
    if (!dryRun) return { valid: false, error: 'Dry-run is mandatory.' };
    if (apply && confirm !== `${CONFIRMATION} ${event}`) return { valid: false, error: `--apply requires --confirm "${CONFIRMATION} ${event}".` };
    return { valid: true, event, dryRun, apply };
}

function safeFileRecord(file) {
    const name = String(file.name ?? '');
    const match = name.match(/\/([^/]+)\.[a-z0-9]+$/i);
    return { path: name, mediaId: match?.[1]?.match(/^MED-LOCAL-\d{3,}(?:-[a-f0-9]{12})?$/)?.[0] ?? null };
}

export async function inspect(event, { db = getFirestore(), bucket = getStorage().bucket(BUCKET) } = {}) {
    const configRef = db.doc(`eventos/${event}/invitacion/config`);
    const configSnapshot = await configRef.get();
    const config = configSnapshot.exists ? (configSnapshot.data() ?? {}) : {};
    const index = config.mediaIndex ?? {};
    const indexedIds = Array.isArray(index.placeIds) ? index.placeIds.filter((id) => typeof id === 'string') : [];
    const mediaSnapshot = await configRef.collection('media').get();
    const placeDocs = mediaSnapshot.docs.filter((doc) => doc.data()?.role === 'place');
    const allFiles = (await bucket.getFiles({ prefix: `eventos/${event}/invitacion/media/place/` }))[0];
    const files = allFiles.map(safeFileRecord);
    const docById = new Map(placeDocs.map((doc) => [doc.id, doc.data()]));
    const fileIds = new Set(files.map(({ mediaId }) => mediaId).filter(Boolean));
    const validDocs = placeDocs.filter((doc) => indexedIds.includes(doc.id) && fileIds.has(doc.id));
    const orphanDocs = placeDocs.filter((doc) => !indexedIds.includes(doc.id) || !fileIds.has(doc.id));
    const orphanFiles = files.filter(({ mediaId }) => !mediaId || !docById.has(mediaId) || !indexedIds.includes(mediaId));
    const brokenRefs = indexedIds.filter((id) => !docById.has(id) || !fileIds.has(id));
    return { indexedIds, placeDocs, files, validDocs, orphanDocs, orphanFiles, brokenRefs, configExists: configSnapshot.exists };
}

export function printReport(event, report, output = console) {
    const structural = (items) => items.map((item) => typeof item === 'string' ? item : item.path ?? item.id);
    output.log('PLACE MEDIA CLEANUP DRY RUN');
    output.log(`Event:\n${event}`);
    output.log('Authentication:\nADC');
    output.log(`Media config:\n- placeIds count: ${report.indexedIds.length}`);
    output.log(`Media documents:\n- place role count: ${report.placeDocs.length}`);
    output.log(`Storage:\n- place object count: ${report.files.length}`);
    output.log(`Classification:\n- valid linked assets: ${report.validDocs.length}\n- broken index references: ${report.brokenRefs.length}\n- orphan media documents: ${report.orphanDocs.length}\n- orphan storage objects: ${report.orphanFiles.length}`);
    output.log(`Candidates (relative paths/IDs only):\n- media documents: ${report.orphanDocs.map((doc) => doc.id).join(', ') || 'none'}\n- storage objects: ${structural(report.orphanFiles).join(', ') || 'none'}`);
    output.log('Action:\nNO CHANGES PERFORMED');
}

async function applyCleanup(event, report) {
    if (process.env.ALLOW_PLACE_MEDIA_CLEANUP !== '1') throw new Error('apply bloqueado: establece ALLOW_PLACE_MEDIA_CLEANUP=1 después de revisar el dry-run.');
    const db = getFirestore();
    const bucket = getStorage().bucket(BUCKET);
    const batch = db.batch();
    report.orphanDocs.forEach((doc) => batch.delete(db.doc(`eventos/${event}/invitacion/config/media/${doc.id}`)));
    if (report.brokenRefs.length) {
        const ref = db.doc(`eventos/${event}/invitacion/config`);
        const snapshot = await ref.get();
        const config = snapshot.data() ?? {};
        batch.set(ref, { ...config, mediaIndex: { ...config.mediaIndex, placeIds: report.indexedIds.filter((id) => !report.brokenRefs.includes(id)) } });
    }
    await batch.commit();
    await Promise.all(report.orphanFiles.map(({ path }) => bucket.file(path).delete()));
}

export async function run(args = process.argv.slice(2), { output = console, inspectFn = inspect, initialize = true } = {}) {
    const options = parseArgs(args);
    if (!options.valid) throw new Error(options.error);
    output.log(`PLACE MEDIA CLEANUP DRY RUN\n\nEvent:\n${options.event}\n\nAuthentication:\nADC\n\nReading media config, media documents and Storage place objects...`);
    if (initialize && !getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID, storageBucket: BUCKET });
    const report = await inspectFn(options.event);
    printReport(options.event, report, output);
    if (options.apply) await applyCleanup(options.event, report);
    else output.log('DRY-RUN: no se escribieron documentos ni se eliminaron objetos.');
    return report;
}

export async function main(args = process.argv.slice(2), dependencies = {}) {
    try { return await run(args, dependencies); }
    catch (error) {
        const message = String(error?.code ?? '').startsWith('PERMISSION_DENIED')
            ? 'unable to read invitation media configuration'
            : String(error?.message ?? error).replaceAll(/(token|authorization|credential|secret)\s*[:=][^\s,}]+/gi, '$1=[redacted]');
        (dependencies.output ?? console).error(`ERROR: ${message}`);
        if (dependencies.setExitCode !== false) process.exitCode = 1;
        return null;
    }
}

function isMainModule() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
    await main();
}
