#!/usr/bin/env node
/*
 * Controlled Prestige guest migration.
 *
 * Dry run (default): node scripts/migrate-guests-prestige.mjs EVT-0001
 * Apply:             node scripts/migrate-guests-prestige.mjs EVT-0001 --apply
 *
 * Prerequisites: Node 20+, firebase-admin and Application Default Credentials.
 * This file never writes unless --apply is present.
 */

import { readFile } from 'node:fs/promises';

const [eventId, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');

if (!isSafeDocumentId(eventId) || flags.some((flag) => flag !== '--apply')) {
    console.error('Uso: node scripts/migrate-guests-prestige.mjs <eventId> [--apply]');
    process.exitCode = 1;
} else {
    await main({ eventId, apply });
}

async function main({ eventId, apply }) {
    const { planGuestPrestigeMigration } = await loadSharedGuestContract();
    const { initializeApp, applicationDefault, getApps } = await loadAdminApp();
    const { getFirestore, FieldValue } = await loadAdminFirestore();

    if (getApps().length === 0) initializeApp({ credential: applicationDefault() });
    const db = getFirestore();
    const snapshot = await db.collection('eventos').doc(eventId).collection('invitados').get();
    const analysis = snapshot.docs.map((docSnap) => {
        const source = docSnap.data();
        return {
            ref: docSnap.ref,
            id: docSnap.id,
            source,
            ...planGuestPrestigeMigration(source, { generateTokens: false })
        };
    });
    const summary = summarize(analysis);

    printSummary({ eventId, apply, summary });
    printInvalid(analysis);
    if (!apply) {
        console.log('\nDRY RUN: no se escribió ningún documento. Usa --apply para ejecutar solo las actualizaciones listadas.');
        return;
    }

    const writable = analysis.filter((item) => item.status === 'update');
    let written = 0;
    for (let offset = 0; offset < writable.length; offset += 400) {
        const chunk = writable.slice(offset, offset + 400);
        const batch = db.batch();
        chunk.forEach((item) => {
            // Generate a token only for a document that was explicitly selected
            // by this analysis as missing one. Existing tokens are untouched.
            const plan = planGuestPrestigeMigration((item.source ?? {}), { generateTokens: true });
            // `source` is set below before this branch; retain this defensive guard.
            if (plan.status !== 'update') return;
            batch.set(item.ref, { ...plan.patch, fechaActualizacion: FieldValue.serverTimestamp() }, { merge: true });
        });
        await batch.commit();
        written += chunk.length;
        console.log(`Aplicado bloque ${Math.floor(offset / 400) + 1}: ${written}/${writable.length} documentos.`);
    }
    console.log(`\nMigración finalizada. Documentos actualizados: ${written}. Inválidos omitidos: ${summary.invalid}.`);
}

async function loadSharedGuestContract() {
    // The front-end is ESM without a root package.json. Loading the source as a
    // data module keeps this CLI on the very same canonical contract.
    const source = await readFile(new URL('../shared/guest-contract.js', import.meta.url), 'utf8');
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

async function loadAdminApp() {
    try {
        return await import('firebase-admin/app');
    } catch {
        throw new Error('Falta firebase-admin. Instálalo en un entorno administrativo aislado antes de ejecutar la migración.');
    }
}

async function loadAdminFirestore() {
    try {
        return await import('firebase-admin/firestore');
    } catch {
        throw new Error('Falta firebase-admin. Instálalo en un entorno administrativo aislado antes de ejecutar la migración.');
    }
}

function summarize(items) {
    return items.reduce((result, item) => {
        result.total += 1;
        result[item.status] += 1;
        if (item.hasExistingToken) result.existingTokens += 1;
        if (item.needsQrToken) result.newTokensRequired += 1;
        return result;
    }, { total: 0, correct: 0, update: 0, invalid: 0, existingTokens: 0, newTokensRequired: 0 });
}

function printSummary({ eventId, apply, summary }) {
    console.log(`\nEvento: ${eventId}`);
    console.log(`Modo: ${apply ? 'APPLY (escritura explícita)' : 'DRY RUN (sin escrituras)'}`);
    console.table(summary);
}

function printInvalid(items) {
    const invalid = items.filter((item) => item.status === 'invalid');
    if (!invalid.length) return;
    console.log('\nDocumentos inválidos omitidos:');
    invalid.forEach((item) => console.log(`- ${item.id}: ${item.reason}`));
}

function isSafeDocumentId(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 1_500 && !value.includes('/');
}
