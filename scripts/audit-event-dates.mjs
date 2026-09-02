#!/usr/bin/env node
/*
 * Auditor read-only de consistencia entre eventos.fecha y
 * eventos/{eventId}/invitacion/draft.content.schedule.date.
 *
 * Uso seguro: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/audit-event-dates.mjs
 * El script se niega a conectar a un proyecto no emulado en esta fase.
 */

import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';
import { isValidEventDate } from '../shared/event-date.js';

const STATUSES = Object.freeze([
    'OK',
    'ROOT_ONLY',
    'DRAFT_ONLY',
    'CONFLICT',
    'MISSING',
    'INVALID_ROOT',
    'INVALID_DRAFT'
]);

export function classifyEventDates(rootDate, draftDate) {
    const hasRoot = typeof rootDate === 'string' && rootDate.trim() !== '';
    const hasDraft = typeof draftDate === 'string' && draftDate.trim() !== '';
    const validRoot = hasRoot && isValidEventDate(rootDate.trim());
    const validDraft = hasDraft && isValidEventDate(draftDate.trim());

    if (hasRoot && !validRoot) return 'INVALID_ROOT';
    if (hasDraft && !validDraft) return 'INVALID_DRAFT';
    if (!hasRoot && !hasDraft) return 'MISSING';
    if (validRoot && !hasDraft) return 'ROOT_ONLY';
    if (!hasRoot && validDraft) return 'DRAFT_ONLY';
    return rootDate.trim() === draftDate.trim() ? 'OK' : 'CONFLICT';
}

export function summarizeStatuses(rows) {
    return Object.fromEntries(STATUSES.map((status) => [
        status,
        rows.filter((row) => row.status === status).length
    ]));
}

async function run() {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
        throw new Error('audit-event-dates/emulator-required: no se conecta a producción en esta fase');
    }
    if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId: 'demo-eventora-date-audit' });
    const db = getFirestore();
    const events = await db.collection('eventos').get();
    const rows = [];
    for (const eventSnapshot of events.docs) {
        const draftSnapshot = await eventSnapshot.ref.collection('invitacion').doc('draft').get();
        const rootDate = eventSnapshot.get('fecha');
        const draftDate = draftSnapshot.exists ? draftSnapshot.get('content.schedule.date') : undefined;
        rows.push({ eventId: eventSnapshot.id, rootDate: rootDate ?? null, draftDate: draftDate ?? null, status: classifyEventDates(rootDate, draftDate) });
    }
    rows.forEach((row) => console.log(JSON.stringify(row)));
    console.log(JSON.stringify({ total: rows.length, byStatus: summarizeStatuses(rows) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
