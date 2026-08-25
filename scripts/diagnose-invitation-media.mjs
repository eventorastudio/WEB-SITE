#!/usr/bin/env node

import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PROJECT_ID = 'eventorastudio-d6d95';
const BUCKET = 'eventorastudio-d6d95.firebasestorage.app';
const INDEX_ROLES = ['cover', 'gallery', 'dressCode', 'place', 'video', 'videoPoster', 'music'];

export function parseArguments(args) {
    let event = '', dryRun = false;
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--event') event = args[++i] ?? '';
        else if (args[i] === '--dry-run') dryRun = true;
        else return { valid: false, error: `Unknown option: ${args[i]}` };
    }
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(event)) return { valid: false, error: 'Use --event with a safe event id.' };
    if (!dryRun) return { valid: false, error: 'This diagnostic requires --dry-run.' };
    return { valid: true, event, dryRun };
}

function relativePath(event, fullPath) {
    const prefix = `eventos/${event}/invitacion/`;
    return String(fullPath).startsWith(prefix) ? String(fullPath).slice(prefix.length) : String(fullPath);
}

function mediaIdFromPath(filePath) {
    const base = String(filePath).split('/').pop() ?? '';
    return base.match(/^(MED-LOCAL-\d{3,})(?:-[a-f0-9]{12})?\./i)?.[1] ?? null;
}

function roleCounts(items, getRole) {
    const counts = {};
    for (const item of items) {
        const role = getRole(item);
        counts[role || 'unknown/legacy'] = (counts[role || 'unknown/legacy'] ?? 0) + 1;
    }
    return counts;
}

export async function inspect(event, { db = getFirestore(), bucket = getStorage().bucket(BUCKET), projectId = PROJECT_ID } = {}) {
    const configRef = db.doc(`eventos/${event}/invitacion/config`);
    const configSnapshot = await configRef.get();
    const config = configSnapshot.exists ? (configSnapshot.data() ?? {}) : {};
    const mediaIndex = config.mediaIndex ?? {};
    const indexByRole = Object.fromEntries(INDEX_ROLES.map((role) => [role, []]));
    for (const role of INDEX_ROLES) {
        const field = role === 'cover' ? 'coverId' : role === 'gallery' ? 'galleryIds' : role === 'dressCode' ? 'dressCodeId' : role === 'place' ? 'placeIds' : role === 'video' ? 'videoId' : role === 'videoPoster' ? 'posterId' : 'audioId';
        const value = mediaIndex[field];
        indexByRole[role] = Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
    }
    const indexedIds = new Set(Object.values(indexByRole).flat());
    const mediaSnapshot = await configRef.collection('media').get();
    const documents = mediaSnapshot.docs.map((doc) => ({ id: doc.id, role: doc.data()?.role ?? '', storagePath: doc.data()?.storagePath ?? '' }));
    const files = (await bucket.getFiles({ prefix: `eventos/${event}/invitacion/media/` }))[0].map((file) => {
        const fullPath = String(file.name);
        return { path: relativePath(event, fullPath), mediaId: mediaIdFromPath(fullPath), rolePath: fullPath.split('/')[4] ?? '' };
    });
    const storageById = new Map(files.filter((file) => file.mediaId).map((file) => [file.mediaId, file]));
    const docsById = new Map(documents.map((doc) => [doc.id, doc]));
    const classifications = { A: [], B: [], C: [], D: [], E: [], F: [] };
    for (const doc of documents) {
        const storage = storageById.get(doc.id);
        const indexed = indexedIds.has(doc.id);
        if (doc.role && INDEX_ROLES.includes(doc.role) && indexed && storage) classifications.A.push(doc.id);
        else if (doc.role && INDEX_ROLES.includes(doc.role) && storage && !indexed) classifications.B.push(doc.id);
        else if (!storage) classifications.D.push(doc.id);
        else classifications.E.push(doc.id);
    }
    for (const file of files) if (!file.mediaId || !docsById.has(file.mediaId)) classifications.C.push(file.path);
    for (const doc of documents) if (!INDEX_ROLES.includes(doc.role)) classifications.E.push(doc.id);
    for (const doc of documents) if (doc.role && INDEX_ROLES.includes(doc.role) && storageById.has(doc.id) && doc.role !== storageById.get(doc.id).rolePath) classifications.F.push(doc.id);
    return { event, projectId, bucket: bucket.name, mediaIndex, indexByRole, documents, files, classifications, configExists: configSnapshot.exists };
}

export function printReport(report, output = console) {
    output.log('EVENT MEDIA DIAGNOSTIC');
    output.log(`\nEvent:\n${report.event}\n\nProject:\n${report.projectId}\n\nBucket:\n${report.bucket}`);
    output.log('\nMedia index:');
    for (const role of INDEX_ROLES) output.log(`- ${role}: ${report.indexByRole[role].length}`);
    output.log(`\nMedia documents:\n- total: ${report.documents.length}`);
    for (const [role, count] of Object.entries(roleCounts(report.documents, (item) => item.role))) output.log(`- ${role}: ${count}`);
    output.log(`\nStorage objects:\n- total: ${report.files.length}`);
    for (const [prefix, count] of Object.entries(roleCounts(report.files, (item) => item.rolePath))) output.log(`- ${prefix || 'unknown/legacy'}: ${count}`);
    const legacy = report.files.filter((file) => !INDEX_ROLES.includes(file.rolePath));
    output.log(`\nLegacy / unknown paths:\n${legacy.map((file) => `- ${file.path}`).join('\n') || '- none'}`);
    output.log('\nDocument relationships:');
    for (const doc of report.documents) {
        const file = report.files.find((item) => item.mediaId === doc.id);
        output.log(`- ${doc.id} role=${doc.role || 'unknown/legacy'} indexed=${Object.values(report.indexByRole).some((ids) => ids.includes(doc.id))} storage=${file?.path ?? 'missing'}`);
    }
    output.log(`\nClassifications:\n- A valid linked assets: ${report.classifications.A.length}\n- B media doc + Storage without index: ${report.classifications.B.length}\n- C Storage without media doc: ${report.classifications.C.length}\n- D media doc without Storage: ${report.classifications.D.length}\n- E unknown/legacy role or path: ${report.classifications.E.length}\n- F role/path mismatch: ${report.classifications.F.length}`);
    output.log('\nNO CHANGES PERFORMED');
}

export async function main(args = process.argv.slice(2), { output = console, initialize = true, inspectFn = inspect } = {}) {
    try {
        const options = parseArguments(args);
        if (!options.valid) throw new Error(options.error);
        output.log(`EVENT MEDIA DIAGNOSTIC\nEvent: ${options.event}\nAuthentication: ADC\nReading config/media and Storage media/ (read-only)...`);
        if (initialize && !getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID, storageBucket: BUCKET });
        const report = await inspectFn(options.event);
        printReport(report, output);
        return report;
    } catch (error) {
        output.error(`ERROR: ${String(error?.message ?? error).replaceAll(/(token|authorization|credential|secret)\s*[:=][^\s,}]+/gi, '$1=[redacted]')}`);
        process.exitCode = 1;
        return null;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
