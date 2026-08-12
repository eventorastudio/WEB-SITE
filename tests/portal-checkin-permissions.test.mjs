import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeGuestForCreate } from '../shared/guest-contract.js';
import { applyGuestStatsChanges } from '../shared/event-stats.js';
import {
    CHECKIN_GUEST_UPDATE_FIELDS,
    CHECKIN_RECORD_FIELDS,
    buildCheckinMutation,
    getGuestAffectedFields
} from '../portal/services/checkin-validation.js';

const timestamp = { serverTimestamp: true };

function realGuest(sequence = 7) {
    return {
        ...normalizeGuestForCreate({
            nombre: 'Familia Castillo Santana',
            pases: 2,
            mesa: 2,
            tipoAcceso: 'ambos'
        }, { documentId: 'INV-0006' }),
        estado: 'pendiente',
        confirmado: false,
        pasesUtilizados: 0,
        pasesDisponibles: 2,
        checkinSecuencia: sequence
    };
}

function build(guest, method = 'qr', passes = 1) {
    return buildCheckinMutation({
        guest,
        eventId: 'EVT-0001',
        guestId: 'INV-0006',
        requestedPasses: passes,
        method,
        qrToken: method === 'qr' ? guest.qrToken : null,
        userId: 'cliente-prestige-uid',
        timestamp
    });
}

test('EVT-0001/INV-0006 registra un pase y crea el siguiente ID correlacionado', () => {
    const before = realGuest(7);
    const mutation = build(before);
    assert.equal(mutation.checkinId, 'INV-0006-008');
    assert.equal(mutation.guestUpdate.pasesUtilizados, 1);
    assert.equal(mutation.guestUpdate.pasesDisponibles, 1);
    assert.equal(mutation.guestUpdate.checkinSecuencia, 8);
    assert.equal(mutation.guestUpdate.ultimoCheckinId, 'INV-0006-008');
    assert.equal(mutation.checkinRecord.pasesRegistrados, 1);
    assert.equal(mutation.checkinRecord.resultado, 'parcial');
});

test('affectedKeys reales están limitados y no incluyen campos administrativos', () => {
    const before = realGuest(0);
    const mutation = build(before);
    assert.deepEqual(getGuestAffectedFields(before, mutation.guestUpdate), CHECKIN_GUEST_UPDATE_FIELDS);
    assert.deepEqual(Object.keys(mutation.checkinRecord), CHECKIN_RECORD_FIELDS);
    for (const forbidden of ['nombre', 'pases', 'mesa', 'qrToken', 'qrActivo']) {
        assert.equal(Object.hasOwn(mutation.guestUpdate, forbidden), false);
    }
});

test('entrada manual, completa y segundo check-in conservan el contador', () => {
    const first = build(realGuest(0), 'manual', 1);
    const afterFirst = { ...realGuest(0), ...first.guestUpdate };
    const second = build(afterFirst, 'manual', 1);
    assert.equal(first.checkinId, 'INV-0006-001');
    assert.equal(second.checkinId, 'INV-0006-002');
    assert.equal(second.guestUpdate.pasesUtilizados, 2);
    assert.equal(second.guestUpdate.pasesDisponibles, 0);
    assert.equal(second.checkinRecord.resultado, 'aprobado');
    assert.equal(second.guestUpdate.horaLlegada, timestamp);
});

test('el delta canónico esperado queda definido para un backend confiable', () => {
    const beforeGuest = realGuest(7);
    const mutation = build(beforeGuest);
    const eventStats = {
        guestCount: 21,
        totalPases: 46,
        pasesConfirmados: 15,
        pasesPendientes: 31,
        pasesNoAsistiran: 0,
        pasesUtilizados: 12,
        pasesDisponibles: 34,
        gruposConfirmados: 6,
        gruposPendientes: 15,
        gruposNoAsistiran: 0,
        gruposConLlegada: 6
    };
    const afterGuest = { ...beforeGuest, ...mutation.guestUpdate };
    assert.deepEqual(applyGuestStatsChanges(eventStats, [{ before: beforeGuest, after: afterGuest }]), {
        guestCount: 21,
        totalPases: 46,
        pasesConfirmados: 17,
        pasesPendientes: 29,
        pasesNoAsistiran: 0,
        pasesUtilizados: 13,
        pasesDisponibles: 33,
        gruposConfirmados: 7,
        gruposPendientes: 14,
        gruposNoAsistiran: 0,
        gruposConLlegada: 7
    });
});

test('el Portal no escribe el evento padre y el debug no expone secretos', async () => {
    const source = await readFile(new URL('../portal/services/checkin-service.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /transaction\.update\(eventRef/);
    assert.match(source, /\[CheckIn Transaction\]/);
    assert.match(source, /updatesEventStats:\s*transactionDebug\.updatesEventStats/);
    const debugBlock = source.slice(source.indexOf("console.error('[CheckIn Transaction]'"), source.indexOf('throw error;', source.indexOf("console.error('[CheckIn Transaction]'")));
    assert.doesNotMatch(debugBlock, /qrToken|password|idToken|stack/);
});

test('la propuesta mantiene default deny y correlación getAfter sin write Portal al padre', async () => {
    const rules = await readFile(new URL('../firestore.rules.proposed', import.meta.url), 'utf8');
    assert.match(rules, /after\.diff\(before\)\.affectedKeys\(\)\.hasOnly/);
    assert.match(rules, /after\.checkinSecuencia == before\.checkinSecuencia \+ 1/);
    assert.match(rules, /!exists\(historyPath\)\s*&& existsAfter\(historyPath\)/);
    assert.match(rules, /after\.ultimoCheckinId == checkinId/);
    assert.match(rules, /allow create, update, delete: if isPlatformManager\(\)/);
    assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false/);
    assert.doesNotMatch(rules, /allow (?:read, )?write:\s*if\s*(?:true|request\.auth != null)/);
});
