import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applicationDefault, getApps, initializeApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { FieldValue, getFirestore } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';

const EXPECTED_FIREBASE_PROJECT = 'eventorastudio-d6d95';
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const STAGES = new Map([
    ['not-started', 'Sin comenzar'], ['setup', 'Configuración inicial'], ['skeleton', 'Esqueleto / estructura'], ['visual-design', 'Diseño visual'],
    ['content', 'Contenido'], ['functionality', 'Funcionalidades'], ['responsive', 'Responsive'], ['qa', 'QA'], ['client-review', 'Revisión del cliente'],
    ['revisions', 'Cambios'], ['final-review', 'Revisión final'], ['ready-to-publish', 'Listo para publicar'], ['published', 'Publicado']
]);
const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.project && !args.status)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
}

const credential = applicationDefault();
const adcProjectId = await getAdcProjectId(credential);
if (adcProjectId && adcProjectId !== EXPECTED_FIREBASE_PROJECT) abort(`ADC apunta a ${adcProjectId}; se esperaba ${EXPECTED_FIREBASE_PROJECT}.`);
if (!adcProjectId) abort(`No se pudo confirmar el proyecto ADC. Se esperaba ${EXPECTED_FIREBASE_PROJECT}.`);
if (!getApps().length) initializeApp({ credential, projectId: EXPECTED_FIREBASE_PROJECT });
const db = getFirestore();
const projectId = validateProjectId(args.project);
const projectRef = db.collection('projects').doc(projectId);

if (args.status) {
    const snapshot = await projectRef.get();
    if (!snapshot.exists) abort('El proyecto no existe.');
    printStatus(snapshot.data());
    process.exit(0);
}

const config = await readLocalConfig();
if (config.projectId !== projectId) abort('El projectId local no coincide con el proyecto solicitado.');
if (!config.businessName) abort('El archivo .eventora-project.json debe incluir businessName.');
if (!STAGES.has(args.stage)) abort(`Fase inválida. Usa una de: ${[...STAGES.keys()].join(', ')}`);
if (!args.title || args.title.length > 180) abort('El título es obligatorio y debe tener máximo 180 caracteres.');
if (!args.description || args.description.length > 1000) abort('La descripción es obligatoria y debe tener máximo 1000 caracteres.');

const commit = detectCommit();
const current = await projectRef.get();
if (!current.exists) abort('El proyecto no existe.');
const currentData = current.data();
if (normalize(config.businessName) !== normalize(currentData.businessName)) abort('El businessName local no coincide con Firestore.');

console.log(`Proyecto: ${currentData.businessName}`);
console.log(`Nueva fase: ${STAGES.get(args.stage)}`);
console.log(`Resumen: ${args.description}`);
console.log(`Commit: ${commit || 'null'}`);
if (args.dryRun) {
    console.log('DRY-RUN: no se modificó Firestore.');
    process.exit(0);
}

const updateRef = projectRef.collection('updates').doc();
await db.runTransaction(async (transaction) => {
    transaction.set(updateRef, { createdAt: FieldValue.serverTimestamp(), stage: args.stage, title: args.title, description: args.description, source: 'codex', commit });
    transaction.update(projectRef, { developmentStage: args.stage, lastUpdateAt: FieldValue.serverTimestamp(), lastUpdateSummary: args.description, updatedAt: FieldValue.serverTimestamp() });
});
console.log(`Avance registrado: ${updateRef.id}`);

function parseArgs(values) {
    const parsed = { dryRun: false, status: false, help: false };
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === '--dry-run') parsed.dryRun = true;
        else if (value === '--status') parsed.status = true;
        else if (value === '--help' || value === '-h') parsed.help = true;
        else if (value.startsWith('--')) { const key = value.slice(2); parsed[key] = values[++index] || ''; }
        else abort(`Argumento no reconocido: ${value}`);
    }
    return parsed;
}
function validateProjectId(value) { if (!value || !PROJECT_ID_PATTERN.test(value)) abort('El projectId debe ser un identificador simple, sin rutas.'); return value; }
async function readLocalConfig() {
    const file = path.join(process.cwd(), '.eventora-project.json');
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { abort('No se encontró un .eventora-project.json válido en la carpeta actual.'); }
}
function detectCommit() { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim() || null; } catch { return null; } }
async function getAdcProjectId(credential) {
    try { return await credential.getProjectId(); } catch { /* authorized_user ADC may not expose projectId through google-auth */ }
    const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'gcloud', 'application_default_credentials.json');
    try {
        const adc = JSON.parse(await fs.readFile(adcPath, 'utf8'));
        return adc.quota_project_id || adc.project_id || process.env.GOOGLE_CLOUD_PROJECT || '';
    } catch { return process.env.GOOGLE_CLOUD_PROJECT || ''; }
}
function printStatus(data) { console.log(`Negocio: ${data.businessName || 'Sin nombre'}`); console.log(`Estado: ${data.projectStatus || 'Sin definir'}`); console.log(`Fase actual: ${STAGES.get(data.developmentStage) || data.developmentStage || 'Sin comenzar'}`); console.log(`Última actualización: ${data.lastUpdateSummary || 'Sin avances registrados.'}`); }
function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
function abort(message) { console.error(`ERROR: ${message}`); process.exit(1); }
function printHelp() { console.log('Uso: node scripts/report-project-status.mjs --project <id> --stage <stage> --title "..." --description "..." [--dry-run]'); console.log('Consulta: node scripts/report-project-status.mjs --status --project <id>'); }
