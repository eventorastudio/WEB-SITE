import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule } from 'node:vm';

async function loadModule(url, cache = new Map()) {
    if (cache.has(url.href)) return cache.get(url.href);
    const source = await readFile(url, 'utf8');
    const module = new SourceTextModule(source, { identifier: url.href });
    cache.set(url.href, module);
    await module.link((specifier, referencingModule) => loadModule(new URL(specifier, referencingModule.identifier), cache));
    await module.evaluate();
    return module;
}

const shared = (await loadModule(new URL('../shared/guest-contract.js', import.meta.url))).namespace;
const validation = (await loadModule(new URL('../portal/services/checkin-validation.js', import.meta.url))).namespace;

test('crear manual o por Excel genera el contrato Prestige completo', () => {
    const guest = shared.normalizeGuestForCreate({
        nombre: 'Abuela Sol',
        pases: '4',
        mesa: '5',
        tipoAcceso: 'ambos'
    });

    assert.equal(guest.pases, 4);
    assert.equal(guest.pasesUtilizados, 0);
    assert.equal(guest.pasesDisponibles, 4);
    assert.equal(guest.llegadaRegistrada, false);
    assert.equal(guest.horaLlegada, null);
    assert.equal(guest.qrActivo, true);
    assert.match(guest.qrToken, /^[A-Za-z0-9_-]{16,256}$/);
    assert.match(guest.codigoInvitado, /^INV-[A-Za-z0-9_-]+$/);
});

test('un pase manual no recibe QR y uno existente no se regenera', () => {
    const token = 'Abcdefghijklmnop_1234567890';
    const qr = shared.normalizeGuestForCreate({ nombre: 'Ana', pases: 1, tipoAcceso: 'qr', qrToken: token });
    const manual = shared.normalizeGuestForCreate({ nombre: 'Luis', pases: 1, tipoAcceso: 'manual' });

    assert.equal(qr.qrToken, token);
    assert.equal(qr.qrActivo, true);
    assert.equal(manual.qrToken, null);
    assert.equal(manual.qrActivo, false);
});

test('editar pases conserva usados y bloquea un total menor a los usados', () => {
    const current = {
        nombre: 'Ana', pases: 4, pasesUtilizados: 3, pasesDisponibles: 1,
        tipoAcceso: 'qr', qrActivo: true, qrToken: 'Abcdefghijklmnop_1234567890', estado: 'pendiente'
    };
    const updated = shared.normalizeGuestForUpdate({ nombre: 'Ana', pases: 5, tipoAcceso: 'qr' }, current);

    assert.equal(updated.pases, 5);
    assert.equal(updated.pasesUtilizados, 3);
    assert.equal(updated.pasesDisponibles, 2);
    assert.equal(updated.qrToken, current.qrToken);
    assert.throws(
        () => shared.normalizeGuestForUpdate({ nombre: 'Ana', pases: 2, tipoAcceso: 'qr' }, current),
        (error) => error?.code === 'guest/passes-below-used'
    );
});

test('la migración en dry run detecta cambios sin generar tokens', () => {
    const dryRun = shared.planGuestPrestigeMigration({ nombre: 'Ana', pases: '2', tipoAcceso: 'qr' });
    const applyPlan = shared.planGuestPrestigeMigration({ nombre: 'Ana', pases: '2', tipoAcceso: 'qr' }, { generateTokens: true });

    assert.equal(dryRun.status, 'update');
    assert.equal(dryRun.needsQrToken, true);
    assert.equal(Object.hasOwn(dryRun.patch, 'qrToken'), false);
    assert.equal(applyPlan.patch.pases, 2);
    assert.match(applyPlan.patch.qrToken, /^[A-Za-z0-9_-]{16,256}$/);
});

test('la transacción exacta de dos pases produce escrituras compatibles con Rules', () => {
    const timestamp = { serverTimestamp: true };
    const mutation = validation.buildCheckinMutation({
        guest: {
            codigoInvitado: 'INV-0001', nombre: 'Luis Pablo García', pases: 2,
            pasesUtilizados: 0, pasesDisponibles: 2, llegadaRegistrada: false,
            horaLlegada: null, qrActivo: true, qrToken: 'Abcdefghijklmnop_1234567890'
        },
        eventId: 'EVT-0001',
        guestId: 'guestDocumentId',
        requestedPasses: 2,
        method: 'qr',
        qrToken: 'Abcdefghijklmnop_1234567890',
        userId: 'portalUserId',
        timestamp
    });

    assert.deepEqual(mutation.guestUpdate, {
        pasesUtilizados: 2,
        pasesDisponibles: 0,
        llegadaRegistrada: true,
        horaLlegada: timestamp,
        estado: 'llego',
        fechaActualizacion: timestamp
    });
    assert.deepEqual(Object.keys(mutation.checkinRecord).sort(), [
        'codigoInvitado', 'eventId', 'fechaHora', 'invitadoId', 'metodo',
        'nombreInvitado', 'pasesDisponiblesDespues', 'pasesRegistrados',
        'registradoPor', 'resultado'
    ]);
    assert.equal(mutation.checkinRecord.resultado, 'aprobado');
    assert.equal(mutation.checkinRecord.fechaHora, timestamp);
});
