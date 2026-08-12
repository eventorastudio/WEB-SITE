import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import qrcode from 'qrcode-generator';
import { classifyAdminFirebaseError } from '../admin/core/firebase-errors.js';
import { PERMISSIONS, USER_ROLES, hasPermission, resolveRoleContext } from '../admin/core/roles.js';
import { buildQrPayload, getGuestQrAvailability, validateQrPayload } from '../shared/qr-code.js';
import { parseQrPayload } from '../portal/services/checkin-validation.js';
import { createQrMatrix, generateQrCanvas } from '../admin/modules/qr/qr-renderer.js';
import { buildQrZip } from '../admin/modules/qr/qr-download.js';
import { parseArguments as parseClaimsArguments } from '../scripts/manage-admin-claims.mjs';

const TOKEN_A = 'Abcdefghijklmnop_1234567890';
const TOKEN_B = 'Zyxwvutsrqponmlk_0987654321';

globalThis.qrcode = qrcode;
globalThis.JSZip = JSZip;

function installCanvasStub() {
    const drawCalls = [];
    globalThis.document = {
        createElement(tag) {
            if (tag !== 'canvas') throw new Error(`unexpected-element:${tag}`);
            return {
                width: 0,
                height: 0,
                getContext: () => ({ fillStyle: '', imageSmoothingEnabled: true, fillRect: (...args) => drawCalls.push(args) }),
                toBlob: (callback) => callback(new Uint8Array([137, 80, 78, 71]))
            };
        }
    };
    return drawCalls;
}

function qrGuest(index, overrides = {}) {
    const code = `INV-${String(index).padStart(4, '0')}`;
    return {
        id: code,
        codigoInvitado: code,
        nombre: index === 2 ? 'Andrea Téllez' : `Invitado ${index}`,
        mesa: index,
        pases: 2,
        tipoAcceso: index % 2 ? 'qr' : 'ambos',
        qrActivo: true,
        qrToken: `${TOKEN_A}${index}`,
        ...overrides
    };
}

test('ADMIN sin custom claim no obtiene elevación implícita a CEO', async () => {
    const context = await resolveRoleContext({ getIdTokenResult: async () => ({ claims: {} }) });
    assert.equal(context.role, null);
    assert.equal(context.isInternal, false);
    assert.equal(context.source, 'missing-claim');
});

test('claim role CEO habilita exclusivamente el permiso QR', async () => {
    const context = await resolveRoleContext({ getIdTokenResult: async () => ({ claims: { role: 'CEO' } }) });
    assert.equal(context.role, USER_ROLES.CEO);
    assert.equal(context.isCeo, true);
    assert.equal(hasPermission(context, PERMISSIONS.QR_EXPORT), true);
});

test('ADMINISTRADOR y DISENADOR no reciben permiso QR', async () => {
    for (const role of ['ADMINISTRADOR', 'DISENADOR']) {
        const context = await resolveRoleContext({ getIdTokenResult: async () => ({ claims: { userRole: role } }) });
        assert.equal(hasPermission(context, PERMISSIONS.QR_EXPORT), false);
    }
});

test('el diagnóstico distingue permission-denied de unavailable', () => {
    assert.equal(classifyAdminFirebaseError({ code: 'permission-denied' }).code, 'permission-denied');
    assert.equal(classifyAdminFirebaseError({ code: 'unavailable' }).code, 'unavailable');
});

test('el diagnóstico reconoce rechazos de App Check', () => {
    assert.equal(classifyAdminFirebaseError({ code: 'appCheck/fetch-status-error' }).code, 'app-check');
});

test('el payload QR contiene únicamente el token', () => {
    assert.equal(buildQrPayload({ qrToken: TOKEN_A, eventId: 'EVT-0001', nombre: 'No incluir' }), TOKEN_A);
    assert.doesNotMatch(buildQrPayload({ qrToken: TOKEN_A }), /INV-|Andrea|EVT-/);
});

test('payload generado es entendido por el parser real del Portal', () => {
    const payload = buildQrPayload({ qrToken: TOKEN_A });
    assert.deepEqual(parseQrPayload(payload), { token: TOKEN_A, eventId: null });
    assert.deepEqual(validateQrPayload(payload, TOKEN_A), { token: TOKEN_A, eventId: null });
});

test('invitados qr y ambos con token activo están disponibles', () => {
    assert.equal(getGuestQrAvailability(qrGuest(1, { tipoAcceso: 'qr' })).available, true);
    assert.equal(getGuestQrAvailability(qrGuest(2, { tipoAcceso: 'ambos' })).available, true);
});

test('invitado manual nunca genera QR operativo', () => {
    assert.deepEqual(getGuestQrAvailability(qrGuest(1, { tipoAcceso: 'manual' })), { status: 'unsupported', available: false });
});

test('QR desactivado queda bloqueado', () => {
    assert.deepEqual(getGuestQrAvailability(qrGuest(1, { qrActivo: false })), { status: 'disabled', available: false });
});

test('token ausente o inválido queda como no disponible', () => {
    assert.deepEqual(getGuestQrAvailability(qrGuest(1, { qrToken: null })), { status: 'missing', available: false });
});

test('la matriz QR se genera localmente con corrección H', () => {
    const matrix = createQrMatrix(TOKEN_A);
    assert.ok(matrix.length >= 21);
    assert.equal(matrix.length, matrix[0].length);
    assert.ok(matrix.flat().some(Boolean));
});

test('el canvas individual usa resolución 1024x1024 y fondo explícito', () => {
    const calls = installCanvasStub();
    const canvas = generateQrCanvas(TOKEN_A, { size: 1024 });
    assert.equal(canvas.width, 1024);
    assert.equal(canvas.height, 1024);
    assert.deepEqual(calls[0], [0, 0, 1024, 1024]);
});

test('ZIP contiene PNG por código e index.csv sin qrToken', async () => {
    installCanvasStub();
    const bytes = await buildQrZip({ eventId: 'EVT-0001', guests: [qrGuest(1), qrGuest(2)], outputType: 'uint8array' });
    const zip = await JSZip.loadAsync(bytes);
    assert.ok(zip.file('INV-0001.png'));
    assert.ok(zip.file('INV-0002.png'));
    const csv = await zip.file('index.csv').async('string');
    assert.match(csv, /Andrea Téllez/);
    assert.doesNotMatch(csv, /Abcdefghijklmnop|qrToken|correo|telefono/);
});

test('progreso ZIP alcanza 21 de 21', async () => {
    installCanvasStub();
    const progress = [];
    await buildQrZip({ guests: Array.from({ length: 21 }, (_, index) => qrGuest(index + 1)), outputType: 'uint8array', onProgress: (item) => progress.push(item) });
    assert.deepEqual(progress.at(-1), { current: 21, total: 21 });
});

test('generación local soporta una lista de 200 invitados', async () => {
    installCanvasStub();
    const bytes = await buildQrZip({ guests: Array.from({ length: 200 }, (_, index) => qrGuest(index + 1)), outputType: 'uint8array' });
    const zip = await JSZip.loadAsync(bytes);
    assert.equal(Object.keys(zip.files).length, 201);
});

test('el HTML no contiene tokens ni atributos data-token', async () => {
    const html = await readFile(new URL('../admin/event.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /data-token|qrToken/);
});

test('el manager nunca envía qrToken a dataset ni console', async () => {
    const source = await readFile(new URL('../admin/modules/qr/qr-manager.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /dataset\.(?:token|qrToken)/);
    assert.doesNotMatch(source, /console\.(?:log|error|warn)\([^\n]*qrToken/);
});

test('la vista móvil usa tarjetas y evita una tabla horizontal', async () => {
    const css = await readFile(new URL('../admin/assets/css/event.css', import.meta.url), 'utf8');
    assert.match(css, /@media \(max-width: 1050px\)[\s\S]*\.qr-table-wrap \{ display: none; \}/);
    assert.match(css, /\.qr-card-list \{ display: grid/);
});

test('la sección QR consume los tokens del tema oscuro del ADMIN', async () => {
    const css = await readFile(new URL('../admin/assets/css/event.css', import.meta.url), 'utf8');
    assert.match(css, /\.qr-pane \{[^}]*background: var\(--surface-secondary\)/);
    assert.match(css, /\.qr-summary article \{[^}]*background: var\(--surface\)/);
    assert.match(css, /\.qr-summary strong \{[^}]*color: var\(--text-primary\)/);
});

test('Service Worker mantiene versión nueva y defensa explícita para ADMIN', async () => {
    const source = await readFile(new URL('../portal/service-worker.js', import.meta.url), 'utf8');
    assert.match(source, /eventora-prestige-static-v4/);
    assert.match(source, /pathname\.startsWith\('\/admin\/'\)/);
});

test('la herramienta de claims es dry-run por defecto y solo acepta roles internos', () => {
    assert.deepEqual(parseClaimsArguments(['user@example.com', '--role', 'CEO']), {
        valid: true, identifier: 'user@example.com', role: 'CEO', apply: false
    });
    assert.equal(parseClaimsArguments(['user@example.com', '--role', 'CLIENTE']).valid, false);
});

test('la propuesta de Rules no abre acceso global', async () => {
    const source = await readFile(new URL('../admin/docs/firestore-admin-claims-rules-proposal.md', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /allow read, write: if true/);
    assert.doesNotMatch(source, /allow read, write: if request\.auth != null/);
    assert.match(source, /request\.auth\.token\.(?:role|userRole)/);
});
