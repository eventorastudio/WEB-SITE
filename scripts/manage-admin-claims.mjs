#!/usr/bin/env node
/*
 * Auditoría por defecto (solo lectura):
 *   node scripts/manage-admin-claims.mjs <uid-o-email> --role CEO
 *
 * Escritura explícita y confirmada:
 *   node scripts/manage-admin-claims.mjs <uid-o-email> --role CEO --apply
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ADMIN_ROLES = Object.freeze(['CEO', 'ADMINISTRADOR', 'DISENADOR', 'VENTAS', 'SOPORTE']);
const DEFAULT_PROJECT_ID = 'eventorastudio-d6d95';

if (isMainModule()) {
    const options = parseArguments(process.argv.slice(2));
    if (!options.valid) {
        console.error(options.error);
        console.error('Uso: node scripts/manage-admin-claims.mjs <uid-o-email> --role <ROL> [--apply]');
        process.exitCode = 1;
    } else {
        await run(options).catch((error) => {
            console.error(`ERROR: ${error?.message || error}`);
            process.exitCode = 1;
        });
    }
}

export function parseArguments(args) {
    const identifier = String(args[0] ?? '').trim();
    const roleIndex = args.indexOf('--role');
    const role = String(roleIndex >= 0 ? args[roleIndex + 1] : '').trim().toUpperCase();
    const apply = args.includes('--apply');
    const known = new Set([identifier, '--role', role, '--apply'].filter(Boolean));
    if (!identifier || identifier.includes('/')) return { valid: false, error: 'UID o correo inválido.' };
    if (!ADMIN_ROLES.includes(role)) return { valid: false, error: `Rol inválido. Usa: ${ADMIN_ROLES.join(', ')}.` };
    if (args.some((arg) => !known.has(arg))) return { valid: false, error: 'Opción no reconocida.' };
    return { valid: true, identifier, role, apply };
}

async function run({ identifier, role, apply }) {
    const admin = await loadFirebaseAdmin();
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID;
    if (admin.getApps().length === 0) admin.initializeApp({ credential: admin.applicationDefault(), projectId });
    const auth = admin.getAuth();
    const user = identifier.includes('@') ? await auth.getUserByEmail(identifier) : await auth.getUser(identifier);
    const current = user.customClaims || {};
    const proposed = { ...current, role, userRole: role };

    console.log('AUDITORÍA DE CUSTOM CLAIMS');
    console.table({
        uid: user.uid,
        email: user.email || '(sin correo)',
        displayName: user.displayName || '(sin nombre)',
        roleActual: current.role ?? '(ausente)',
        userRoleActual: current.userRole ?? '(ausente)',
        rolePropuesto: role
    });
    if (!apply) {
        console.log('DRY RUN: no se modificó Authentication.');
        return;
    }

    const expected = `ASIGNAR ROL ${role} A ${user.uid}`;
    if (!input.isTTY || !output.isTTY) throw new Error('--apply requiere terminal interactiva.');
    const prompt = createInterface({ input, output });
    try {
        const answer = await prompt.question(`Escribe exactamente "${expected}": `);
        if (answer.trim() !== expected) throw new Error('Confirmación cancelada; no se modificó Authentication.');
    } finally {
        prompt.close();
    }
    await auth.setCustomUserClaims(user.uid, proposed);
    console.log('Claims actualizados. Cierra sesión e inicia sesión para obtener un ID token nuevo.');
}

function isMainModule() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function loadFirebaseAdmin() {
    const [app, auth] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/auth')]);
    return { ...app, ...auth };
}
