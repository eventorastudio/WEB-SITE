#!/usr/bin/env node
/*
 * Normalización controlada de invitados a partir de INV-0001.
 *
 * Dry run: node scripts/normalize-guests-from-reference.mjs EVT-0001
 * Apply:   node scripts/normalize-guests-from-reference.mjs EVT-0001 --apply
 *
 * Requiere firebase-admin y Application Default Credentials. No escribe si
 * falta --apply. INV-0001 nunca forma parte de los batches.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
    CANONICAL_GUEST_FIELDS,
    GUEST_FIELD_DEFINITIONS,
    generateGuestQrToken,
    generateGuestVisibleCode,
    isValidQrToken,
    normalizeLegacyGuest,
    supportsQrAccess
} from '../shared/guest-contract.js';

export const REFERENCE_GUEST_ID = 'INV-0001';
export const MAX_BATCH_WRITES = 400;
const DEFAULT_PROJECT_ID = 'eventorastudio-d6d95';
const NEVER_COPY_FIELDS = Object.freeze([
    'nombre', 'correo', 'telefono', 'mesa', 'pases', 'notas',
    'codigoInvitado', 'qrToken', 'fechaCreacion', 'horaLlegada'
]);

if (isMainModule()) {
    const options = parseArguments(process.argv.slice(2));
    if (!options.valid) {
        console.error(options.error);
        console.error('Uso: node scripts/normalize-guests-from-reference.mjs <eventId> [--apply]');
        process.exitCode = 1;
    } else {
        await run(options).catch((error) => {
            console.error(`\nERROR: ${error?.message || error}`);
            process.exitCode = 1;
        });
    }
}

async function run({ eventId, apply }) {
    const admin = await loadFirebaseAdmin();
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID;
    if (admin.getApps().length === 0) {
        admin.initializeApp({ credential: admin.applicationDefault(), projectId });
    }
    const db = admin.getFirestore();
    const eventRef = db.collection('eventos').doc(eventId);
    const referenceRef = eventRef.collection('invitados').doc(REFERENCE_GUEST_ID);

    const [referenceSnapshot, guestsSnapshot, checkinsSnapshot] = await Promise.all([
        referenceRef.get(),
        eventRef.collection('invitados').get(),
        eventRef.collection('checkins').get()
    ]);
    if (!referenceSnapshot.exists) throw new Error(`No existe eventos/${eventId}/invitados/${REFERENCE_GUEST_ID}.`);

    const referenceData = referenceSnapshot.data();
    const referenceKeys = Object.keys(referenceData).sort();
    const identities = buildIdentityRegistry(guestsSnapshot.docs);
    const checkinAudit = auditCheckins(checkinsSnapshot.docs, guestsSnapshot.docs);
    const history = checkinAudit.history;
    const referenceAudit = auditReference({
        data: referenceData,
        keys: referenceKeys,
        documentId: REFERENCE_GUEST_ID,
        history: history.get(REFERENCE_GUEST_ID)
    });

    printReferenceAudit(referenceAudit);
    printCheckinAudit(checkinAudit);
    printDuplicateAudit(identities);

    const analysis = guestsSnapshot.docs.map((snapshot) => analyseGuest({
        snapshot,
        referenceKeys,
        history: history.get(snapshot.id),
        duplicateCodes: identities.duplicateCodes,
        duplicateTokens: identities.duplicateTokens
    }));
    const summary = summarize(analysis);
    printAnalysis({ eventId, apply, analysis });

    const globalBlockers = [
        ...referenceAudit.errors,
        ...checkinAudit.errors,
        ...identities.duplicateCodes.map((value) => `Código duplicado: ${value}`),
        ...identities.duplicateTokens.map((value) => `qrToken duplicado: ${maskSecret(value)}`)
    ];
    const invalidBlockers = analysis
        .filter((item) => item.status === 'invalid' && item.id !== REFERENCE_GUEST_ID)
        .map((item) => `${item.id}: ${item.reasons.join(', ')}`);
    const allBlockers = [...globalBlockers, ...invalidBlockers];

    if (!apply) {
        console.log('\nDRY RUN completado: no se escribió ningún documento ni se generó un backup.');
        console.log('Para aplicar, corrige primero todos los inválidos/bloqueos y ejecuta el mismo comando con --apply.');
        printSummary(summary);
        printBlockers(allBlockers);
        return;
    }

    printSummary(summary);
    if (allBlockers.length) {
        printBlockers(allBlockers);
        throw new Error('Aplicación bloqueada: la referencia o uno o más documentos son inválidos.');
    }

    await confirmApply(eventId);
    const backupPath = await createBackup(eventId, guestsSnapshot.docs);
    console.log(`\nBackup creado antes de escribir: ${backupPath}`);

    const writable = analysis.filter((item) => item.status === 'update' && item.id !== REFERENCE_GUEST_ID);
    const occupiedCodes = new Set(identities.codes.keys());
    const occupiedTokens = new Set(identities.tokens.keys());
    const prepared = writable.map((item) => prepareWrite(item, occupiedCodes, occupiedTokens, admin.FieldValue));

    let written = 0;
    for (let offset = 0; offset < prepared.length; offset += MAX_BATCH_WRITES) {
        const chunk = prepared.slice(offset, offset + MAX_BATCH_WRITES);
        const batchNumber = Math.floor(offset / MAX_BATCH_WRITES) + 1;
        const batch = db.batch();
        chunk.forEach((item) => batch.set(item.ref, item.patch, { merge: true }));
        try {
            await batch.commit();
        } catch (error) {
            console.error(`Falló el batch ${batchNumber}. Documentos afectados:`);
            chunk.forEach((item) => console.error(`- ${item.id}`));
            console.error(`El backup se conserva en: ${backupPath}`);
            throw error;
        }
        written += chunk.length;
        console.log(`Batch ${batchNumber} aplicado: ${written}/${prepared.length}.`);
    }

    const [referenceAfter, guestsAfter] = await Promise.all([referenceRef.get(), eventRef.collection('invitados').get()]);
    if (!referenceAfter.updateTime.isEqual(referenceSnapshot.updateTime)) {
        throw new Error(`${REFERENCE_GUEST_ID} cambió durante la migración; no se afirma éxito total.`);
    }
    const validation = validateAfterApply(guestsAfter.docs, referenceKeys);
    if (validation.length) {
        console.error('\nLa validación posterior encontró diferencias:');
        validation.forEach((item) => console.error(`- ${item.id}: ${item.issues.join(', ')}`));
        throw new Error('La validación posterior no fue satisfactoria; conserva el backup.');
    }

    console.log(`\nMigración validada. Documentos actualizados: ${written}.`);
    console.log(`${REFERENCE_GUEST_ID} no fue modificado. No se borró ningún documento.`);
}

export function parseArguments(args) {
    const eventId = args[0];
    const flags = args.slice(1);
    if (!isSafeDocumentId(eventId)) return { valid: false, error: 'El eventId es obligatorio y no puede contener "/".' };
    if (flags.some((flag) => flag !== '--apply')) return { valid: false, error: 'Opción no reconocida.' };
    if (flags.filter((flag) => flag === '--apply').length > 1) return { valid: false, error: '--apply está repetido.' };
    return { valid: true, eventId, apply: flags.includes('--apply') };
}

export function aggregateCheckins(documents, guests = []) {
    return auditCheckins(documents, guests).history;
}

export function auditCheckins(documents, guests = []) {
    const result = new Map();
    const identityLookup = buildGuestIdentityLookup(guests);
    const associations = [];
    const errors = [];
    documents.forEach((snapshot) => {
        const data = snapshot.data();
        const candidates = [
            ['invitadoId', data.invitadoId],
            ['guestId', data.guestId],
            ['codigoInvitado', data.codigoInvitado]
        ].filter(([, value]) => typeof value === 'string' && value.trim())
            .map(([field, value]) => ({ field, value: value.trim() }));
        const resolved = new Set();
        candidates.forEach(({ value }) => {
            const ids = identityLookup.get(value);
            if (ids) ids.forEach((id) => resolved.add(id));
        });

        let guestId = '';
        if (resolved.size === 1) {
            [guestId] = resolved;
        } else if (guests.length === 0 && candidates.length) {
            guestId = candidates[0].value;
        } else if (resolved.size > 1) {
            errors.push(`Check-in ${snapshot.id} tiene referencias contradictorias: ${[...resolved].join(', ')}`);
        } else {
            errors.push(`Check-in ${snapshot.id} no se puede asociar a un invitado mediante invitadoId, guestId ni codigoInvitado`);
        }

        associations.push({
            id: snapshot.id,
            guestId: guestId || null,
            matchedBy: candidates.map(({ field }) => field),
            references: candidates
        });
        if (!guestId) return;
        const current = result.get(guestId) || { passes: 0, firstAt: null, invalid: [], count: 0, documentIds: [] };
        current.count += 1;
        current.documentIds.push(snapshot.id);
        const passes = toStrictInteger(data.pasesRegistrados);
        let invalidRecord = false;
        if (!Number.isInteger(passes) || passes < 1) {
            errors.push(`Check-in ${snapshot.id} tiene pasesRegistrados inválido`);
            invalidRecord = true;
        } else {
            current.passes += passes;
        }
        if (!isTimestamp(data.fechaHora)) {
            errors.push(`Check-in ${snapshot.id} tiene fechaHora inválida`);
            invalidRecord = true;
        } else if (!current.firstAt || compareTimestamps(data.fechaHora, current.firstAt) < 0) {
            current.firstAt = data.fechaHora;
        }
        if (invalidRecord) current.invalid.push(snapshot.id);
        result.set(guestId, current);
    });
    return {
        history: result,
        total: documents.length,
        associations,
        errors
    };
}

export function buildIdentityRegistry(documents) {
    const codes = new Map();
    const tokens = new Map();
    documents.forEach((snapshot) => {
        const data = snapshot.data();
        addIdentity(codes, data.codigoInvitado, snapshot.id);
        addIdentity(tokens, data.qrToken, snapshot.id);
    });
    return {
        codes,
        tokens,
        duplicateCodes: duplicateValues(codes),
        duplicateTokens: duplicateValues(tokens)
    };
}

function buildGuestIdentityLookup(documents) {
    const lookup = new Map();
    documents.forEach((snapshot) => {
        addGuestIdentity(lookup, snapshot.id, snapshot.id);
        const data = snapshot.data();
        addGuestIdentity(lookup, data.codigoInvitado, snapshot.id);
    });
    return lookup;
}

function addGuestIdentity(lookup, value, guestId) {
    if (typeof value !== 'string' || !value.trim()) return;
    const key = value.trim();
    const ids = lookup.get(key) || new Set();
    ids.add(guestId);
    lookup.set(key, ids);
}

export function auditReference({ data, keys, documentId, history }) {
    const rows = keys.map((key) => {
        const definition = GUEST_FIELD_DEFINITIONS[key];
        return {
            campo: key,
            tipoFirestore: firestoreType(data[key]),
            valorActual: displayValue(key, data[key]),
            significado: definition?.meaning || 'Campo no documentado en el contrato actual',
            obligatorio: definition ? (definition.required ? 'sí' : 'no') : 'por confirmar',
            unico: definition ? (definition.unique ? 'sí' : 'no') : 'por confirmar',
            estrategia: definition?.strategy || 'Requiere confirmación manual; nunca se copiará por defecto.'
        };
    });
    const errors = [];
    const missingContractFields = CANONICAL_GUEST_FIELDS.filter((key) => !keys.includes(key));
    const unsupportedFields = keys.filter((key) => !GUEST_FIELD_DEFINITIONS[key]);
    if (missingContractFields.length) errors.push(`INV-0001 no contiene campos canónicos: ${missingContractFields.join(', ')}`);
    if (unsupportedFields.length) errors.push(`INV-0001 contiene campos sin regla segura: ${unsupportedFields.join(', ')}`);
    keys.forEach((key) => {
        const expected = GUEST_FIELD_DEFINITIONS[key]?.type;
        if (expected && !matchesExpectedType(data[key], expected)) {
            errors.push(`INV-0001.${key} es ${firestoreType(data[key])}; se esperaba ${expected}`);
        }
    });
    const plan = normalizeLegacyGuest(data, {
        documentId,
        checkinPasses: history?.passes || 0,
        firstCheckinAt: history?.firstAt || null
    });
    const differences = buildFieldDiffs({
        source: data,
        patch: plan.patch,
        generatedFields: plan.generatedFields,
        missingFields: missingContractFields,
        incorrectTypeFields: keys.filter((key) => {
            const expected = GUEST_FIELD_DEFINITIONS[key]?.type;
            return expected && !matchesExpectedType(data[key], expected);
        })
    });
    const diagnosticFields = [
        'estado',
        'confirmado',
        'llegadaRegistrada',
        'horaLlegada',
        'pases',
        'pasesUtilizados',
        'pasesDisponibles'
    ];
    const referenceState = {
        fields: diagnosticFields.map((fieldName) => {
            const currentPresent = Object.hasOwn(data, fieldName);
            const proposedValue = Object.hasOwn(plan.patch, fieldName) ? plan.patch[fieldName] : data[fieldName];
            return {
                field: fieldName,
                current: diagnosticField(fieldName, data[fieldName], currentPresent),
                proposed: diagnosticField(fieldName, proposedValue, proposedValue !== undefined),
                difference: differences.find((difference) => difference.field === fieldName) || null
            };
        }),
        checkinCount: history?.count || 0,
        checkinDocumentIds: history?.documentIds || [],
        result: null
    };
    if (history?.invalid?.length) errors.push(`INV-0001 tiene check-ins inválidos: ${history.invalid.join(', ')}`);
    if (plan.status === 'invalid') errors.push(`INV-0001 es inconsistente: ${plan.reason}`);
    if (plan.status === 'update') errors.push(`INV-0001 requeriría cambios: ${[...Object.keys(plan.patch), ...plan.generatedFields].join(', ')}`);
    referenceState.result = errors.length ? 'REFERENCIA INVÁLIDA' : 'REFERENCIA VÁLIDA';
    referenceState.requiredChanges = plan.status === 'update'
        ? [...Object.keys(plan.patch), ...plan.generatedFields]
        : [];
    return { rows, errors, keys, unsupportedFields, missingContractFields, differences, referenceState };
}

export function analyseGuest({ snapshot, referenceKeys, history, duplicateCodes = [], duplicateTokens = [] }) {
    const source = snapshot.data();
    const id = snapshot.id;
    const missingFields = referenceKeys.filter((key) => !Object.hasOwn(source, key));
    const incorrectTypes = referenceKeys
        .filter((key) => Object.hasOwn(source, key) && GUEST_FIELD_DEFINITIONS[key])
        .filter((key) => !matchesExpectedType(source[key], GUEST_FIELD_DEFINITIONS[key].type))
        .map((key) => `${key}: ${firestoreType(source[key])} → ${GUEST_FIELD_DEFINITIONS[key].type}`);
    const incorrectTypeFields = referenceKeys
        .filter((key) => Object.hasOwn(source, key) && GUEST_FIELD_DEFINITIONS[key])
        .filter((key) => !matchesExpectedType(source[key], GUEST_FIELD_DEFINITIONS[key].type));
    const reasons = [];
    if (history?.invalid?.length) reasons.push(`check-ins inválidos: ${history.invalid.join(', ')}`);
    if (!Object.hasOwn(source, 'fechaCreacion')) reasons.push('falta fechaCreacion; no se inventará una fecha histórica');

    const unsupportedMissing = missingFields.filter((key) => !GUEST_FIELD_DEFINITIONS[key]);
    if (unsupportedMissing.length) reasons.push(`faltan campos sin estrategia segura: ${unsupportedMissing.join(', ')}`);
    const unsafeTypeFields = referenceKeys.filter((key) => {
        if (!Object.hasOwn(source, key) || matchesExpectedType(source[key], GUEST_FIELD_DEFINITIONS[key]?.type || '')) return false;
        return ['codigoInvitado', 'nombre', 'correo', 'telefono', 'notas', 'fechaCreacion', 'horaLlegada'].includes(key);
    });
    if (unsafeTypeFields.length) reasons.push(`tipos no convertibles de forma segura: ${unsafeTypeFields.join(', ')}`);
    if (source.codigoInvitado && duplicateCodes.includes(source.codigoInvitado)) reasons.push('codigoInvitado duplicado');
    if (source.qrToken && duplicateTokens.includes(source.qrToken)) reasons.push('qrToken duplicado');

    const plan = normalizeLegacyGuest(source, {
        documentId: id,
        checkinPasses: history?.passes || 0,
        firstCheckinAt: history?.firstAt || null
    });
    if (plan.status === 'invalid') reasons.push(plan.reason);

    const patch = Object.fromEntries(Object.entries(plan.patch).filter(([key]) => referenceKeys.includes(key)));
    const generatedFields = plan.generatedFields.filter((key) => referenceKeys.includes(key));
    if (referenceKeys.includes('fechaActualizacion') && id !== REFERENCE_GUEST_ID
        && (Object.keys(patch).length || generatedFields.length || missingFields.length || incorrectTypes.length)) {
        patch.fechaActualizacion = '[serverTimestamp]';
    }

    const changedFields = new Set([...Object.keys(patch), ...generatedFields]);
    const preservedFields = Object.keys(source).filter((key) => !changedFields.has(key));
    const needsUpdate = Object.keys(patch).length > 0 || generatedFields.length > 0;
    const differences = buildFieldDiffs({
        source,
        patch,
        generatedFields,
        missingFields,
        incorrectTypeFields
    });
    return {
        id,
        ref: snapshot.ref,
        source,
        status: reasons.length ? 'invalid' : needsUpdate ? 'update' : 'correct',
        reasons,
        patch,
        generatedFields,
        missingFields,
        incorrectTypes,
        preservedFields,
        differences
    };
}

export function summarize(items) {
    return items.reduce((summary, item) => {
        summary.total += 1;
        if (item.status === 'correct') summary.normalized += 1;
        if (item.status === 'update') summary.requiresChanges += 1;
        if (item.status === 'invalid') summary.invalid += 1;
        if (typeof item.source.codigoInvitado !== 'string' || !item.source.codigoInvitado.trim()) summary.withoutCode += 1;
        if (supportsQrAccess(item.source.tipoAcceso)
            && (typeof item.source.qrToken !== 'string' || !item.source.qrToken.trim())) summary.withoutQrToken += 1;
        if (item.incorrectTypes.length) summary.wrongTypes += 1;
        return summary;
    }, {
        total: 0,
        normalized: 0,
        requiresChanges: 0,
        invalid: 0,
        withoutCode: 0,
        withoutQrToken: 0,
        wrongTypes: 0
    });
}

export function prepareWrite(item, occupiedCodes, occupiedTokens, FieldValue) {
    if (item.id === REFERENCE_GUEST_ID) throw new Error(`${REFERENCE_GUEST_ID} está protegido y no puede prepararse para escritura.`);
    const patch = { ...item.patch };
    if (item.generatedFields.includes('codigoInvitado')) {
        patch.codigoInvitado = allocateUniqueCode(item.id, occupiedCodes);
    }
    if (item.generatedFields.includes('qrToken')) {
        patch.qrToken = allocateUniqueToken(occupiedTokens);
    }
    if (patch.fechaActualizacion === '[serverTimestamp]') patch.fechaActualizacion = FieldValue.serverTimestamp();
    return { id: item.id, ref: item.ref, patch };
}

export function validateAfterApply(documents, referenceKeys) {
    const identities = buildIdentityRegistry(documents);
    return documents.map((snapshot) => {
        const data = snapshot.data();
        const issues = [];
        const missing = referenceKeys.filter((key) => !Object.hasOwn(data, key));
        if (missing.length) issues.push(`faltan: ${missing.join(', ')}`);
        referenceKeys.forEach((key) => {
            const definition = GUEST_FIELD_DEFINITIONS[key];
            if (definition && Object.hasOwn(data, key) && !matchesExpectedType(data[key], definition.type)) {
                issues.push(`${key} tiene tipo ${firestoreType(data[key])}`);
            }
        });
        if (!missing.length) {
            const contractPlan = normalizeLegacyGuest(data, { documentId: snapshot.id });
            if (contractPlan.status === 'invalid') {
                issues.push(`contrato inválido: ${contractPlan.reason}`);
            } else if (contractPlan.status === 'update') {
                issues.push(`aún requeriría cambios: ${[...Object.keys(contractPlan.patch), ...contractPlan.generatedFields].join(', ')}`);
            }
        }
        if (identities.duplicateCodes.includes(data.codigoInvitado)) issues.push('codigoInvitado duplicado');
        if (identities.duplicateTokens.includes(data.qrToken)) issues.push('qrToken duplicado');
        return { id: snapshot.id, issues };
    }).filter((item) => item.issues.length);
}

export function firestoreType(value) {
    if (value === null) return 'null';
    if (isTimestamp(value)) return 'timestamp';
    if (Buffer.isBuffer(value) || value?.constructor?.name === 'Bytes') return 'bytes';
    if (value?.constructor?.name === 'GeoPoint') return 'geopoint';
    if (value?.constructor?.name === 'DocumentReference') return 'reference';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'number';
    if (typeof value === 'object') return 'map';
    return typeof value;
}

export function matchesExpectedType(value, expected) {
    return expected.split('|').some((candidate) => {
        if (candidate === 'number') return typeof value === 'number' && Number.isInteger(value);
        return firestoreType(value) === candidate;
    });
}

export function buildFieldDiffs({
    source = {},
    patch = {},
    generatedFields = [],
    missingFields = [],
    incorrectTypeFields = []
} = {}) {
    const fields = new Set([
        ...Object.keys(patch),
        ...generatedFields,
        ...missingFields,
        ...incorrectTypeFields
    ]);
    const normalizedStatus = Object.hasOwn(patch, 'estado') ? patch.estado : source.estado;

    return [...fields].map((fieldName) => {
        const present = Object.hasOwn(source, fieldName);
        const generated = generatedFields.includes(fieldName);
        const patched = Object.hasOwn(patch, fieldName);
        const currentValue = present ? source[fieldName] : undefined;
        const proposedValue = patched ? patch[fieldName] : undefined;
        const expectedType = GUEST_FIELD_DEFINITIONS[fieldName]?.type || 'desconocido';
        const hasProposal = patched || generated;
        const proposedDisplay = generated
            ? generatedValueLabel(fieldName)
            : hasProposal
                ? diagnosticValue(fieldName, proposedValue)
                : '(sin propuesta automática)';
        const proposedJsType = generated
            ? expectedJsType(expectedType)
            : proposedValue === '[serverTimestamp]'
                ? 'object (FieldValue)'
            : hasProposal
                ? jsType(proposedValue)
                : '(sin propuesta)';
        const proposedFirestoreType = generated
            ? expectedType
            : proposedValue === '[serverTimestamp]'
                ? 'timestamp'
                : hasProposal
                    ? firestoreType(proposedValue)
                    : expectedType;

        const difference = {
            field: fieldName,
            currentDisplay: diagnosticValue(fieldName, currentValue, { present }),
            currentJsType: jsType(currentValue),
            currentFirestoreType: present ? firestoreType(currentValue) : 'ausente',
            proposedDisplay,
            proposedJsType,
            proposedFirestoreType,
            reason: explainDifference({
                fieldName,
                present,
                currentValue,
                proposedValue,
                hasProposal,
                generated,
                normalizedStatus,
                expectedType
            })
        };

        if (fieldName === 'confirmado') {
            const statusPresent = Object.hasOwn(source, 'estado');
            difference.statusContext = {
                rawDisplay: diagnosticValue('estado', source.estado, { present: statusPresent }),
                rawJsType: jsType(source.estado),
                rawFirestoreType: statusPresent ? firestoreType(source.estado) : 'ausente',
                normalizedDisplay: diagnosticValue('estado', normalizedStatus, { present: normalizedStatus !== undefined }),
                normalizedJsType: jsType(normalizedStatus),
                normalizedFirestoreType: normalizedStatus === undefined ? 'ausente' : firestoreType(normalizedStatus)
            };
        }
        return difference;
    });
}

function explainDifference({
    fieldName,
    present,
    currentValue,
    proposedValue,
    hasProposal,
    generated,
    normalizedStatus,
    expectedType
}) {
    if (fieldName === 'codigoInvitado' && generated) {
        return 'codigoInvitado vacío; se generará un código único durante --apply';
    }
    if (fieldName === 'fechaActualizacion' && proposedValue === '[serverTimestamp]') {
        return 'fechaActualizacion se actualizará mediante serverTimestamp() debido a que el documento tendrá cambios';
    }

    let cause;
    if (!present) {
        cause = 'campo ausente';
    } else if (currentValue === null && hasProposal && proposedValue !== null) {
        cause = 'el valor actual es null';
    } else if (hasProposal && jsType(currentValue) !== jsType(proposedValue)) {
        cause = `tipo distinto (${jsType(currentValue)} → ${jsType(proposedValue)})`;
    } else if (hasProposal && !Object.is(currentValue, proposedValue)) {
        cause = 'valor distinto';
    } else if (!matchesExpectedType(currentValue, expectedType)) {
        cause = `tipo Firestore distinto (${firestoreType(currentValue)} → ${expectedType})`;
    } else {
        cause = 'el campo requiere generación o revisión explícita';
    }

    if (fieldName === 'confirmado') {
        const derived = normalizedStatus === 'confirmado' || normalizedStatus === 'llego';
        return `${cause}; confirmado se deriva de estado normalizado = ${diagnosticValue('estado', normalizedStatus, { present: normalizedStatus !== undefined })}, por lo que el booleano esperado es ${derived}`;
    }

    const semanticReasons = {
        estado: 'se normaliza al catálogo canónico: pendiente, confirmado, no_asistira o llego',
        llegadaRegistrada: 'se deriva de las señales confiables de llegada y de los check-ins',
        pasesUtilizados: 'se conserva un contador válido o se deriva del historial confiable',
        pasesDisponibles: 'se calcula como pases - pasesUtilizados',
        qrActivo: 'se valida contra tipoAcceso y la presencia de un qrToken válido',
        horaLlegada: 'debe ser coherente con una llegada registrada',
        fechaActualizacion: 'al escribir cambios se usaría un serverTimestamp',
        fechaCreacion: 'no existe una propuesta automática porque no se inventa una fecha histórica'
    };
    return semanticReasons[fieldName] ? `${cause}; ${semanticReasons[fieldName]}` : cause;
}

function diagnosticValue(fieldName, value, { present = true } = {}) {
    if (!present) return '(ausente)';
    if (fieldName === 'qrToken') return maskSecret(value);
    if (value === '[serverTimestamp]') return '[serverTimestamp → timestamp]';
    if (isTimestamp(value)) return value.toDate().toISOString();
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'object') return JSON.stringify(serializeFirestoreValue(value));
    return String(value);
}

function diagnosticField(fieldName, value, present) {
    return {
        display: diagnosticValue(fieldName, value, { present }),
        jsType: jsType(value),
        firestoreType: present ? firestoreType(value) : 'ausente'
    };
}

function jsType(value) {
    if (value === null) return 'object (null)';
    if (Array.isArray(value)) return 'object (array)';
    return typeof value;
}

function expectedJsType(expectedFirestoreType) {
    const candidate = expectedFirestoreType.split('|')[0];
    if (candidate === 'null') return 'object (null)';
    if (['timestamp', 'map', 'geopoint', 'reference', 'bytes', 'array'].includes(candidate)) return 'object';
    return candidate;
}

function generatedValueLabel(fieldName) {
    if (fieldName === 'codigoInvitado') return '(se generaría un código único solo con --apply)';
    if (fieldName === 'qrToken') return '(se generaría un token secreto solo con --apply)';
    return '(se generaría solo con --apply)';
}

function printReferenceAudit(audit) {
    console.log(`\nESQUEMA REAL DE ${REFERENCE_GUEST_ID}`);
    console.table(audit.rows);
    printReferenceState(audit.referenceState);
    if (audit.differences.length) {
        console.log('\nREFERENCE DIFF');
        audit.differences.forEach((difference) => printFieldDiff(difference));
    }
}

function printReferenceState(state) {
    console.log(`\nDIAGNÓSTICO REAL DE ${REFERENCE_GUEST_ID}`);
    state.fields.forEach((field) => printReferenceField(field));
    console.log('checkins asociados:');
    console.log(`  cantidad: ${state.checkinCount}`);
    if (state.checkinDocumentIds.length) console.log(`  documentos: ${state.checkinDocumentIds.join(', ')}`);
    console.log(`${REFERENCE_GUEST_ID}: ${state.result}`);
    console.log(`Cambios requeridos: ${state.requiredChanges.join(', ') || 'ninguno'}`);
}

function printReferenceField(field) {
    console.log(`${field.field}:`);
    console.log(`  actual: ${field.current.display} (JS: ${field.current.jsType}; Firestore: ${field.current.firestoreType})`);
    console.log(`  propuesto: ${field.proposed.display} (JS: ${field.proposed.jsType}; Firestore: ${field.proposed.firestoreType})`);
    console.log(`  motivo: ${field.difference?.reason || 'sin cambios; ya cumple el contrato'}`);
}

function printCheckinAudit(audit) {
    console.log('\nAUDITORÍA DE CHECKINS');
    console.log(`Total documentos: ${audit.total}`);
    console.log(`Asociados: ${audit.associations.filter((item) => item.guestId).length}`);
    console.log(`Sin asociación segura: ${audit.associations.filter((item) => !item.guestId).length}`);
    if (audit.errors.length) audit.errors.forEach((error) => console.log(`- ${error}`));
}

function printDuplicateAudit(identities) {
    if (!identities.duplicateCodes.length && !identities.duplicateTokens.length) return;
    console.log('\nDUPLICADOS GLOBALES');
    identities.duplicateCodes.forEach((value) => console.log(`- codigoInvitado: ${value}`));
    identities.duplicateTokens.forEach((value) => console.log(`- qrToken: ${maskSecret(value)}`));
}

function printAnalysis({ eventId, apply, analysis }) {
    console.log(`\nEvento: ${eventId}`);
    console.log(`Modo: ${apply ? 'APPLY solicitado (aún sin escrituras)' : 'DRY RUN'}`);
    console.log('\nDETALLE POR DOCUMENTO');
    analysis.forEach((item) => {
        console.log(`\n${item.id} [${item.status}]`);
        console.log(`  Campos faltantes: ${item.missingFields.join(', ') || 'ninguno'}`);
        console.log(`  Tipos incorrectos: ${item.incorrectTypes.join('; ') || 'ninguno'}`);
        console.log(`  Valores/campos conservados: ${item.preservedFields.join(', ') || 'ninguno'}`);
        console.log(`  Valores/campos a generar: ${item.generatedFields.join(', ') || 'ninguno'}`);
        console.log(`  Campos a corregir: ${Object.keys(item.patch).join(', ') || 'ninguno'}`);
        if (item.differences.length) {
            console.log('  DIFERENCIAS DETALLADAS');
            item.differences.forEach((difference) => printFieldDiff(difference, '    '));
        }
        if (item.reasons.length) console.log(`  Bloqueos: ${item.reasons.join('; ')}`);
    });
    console.log('\nCAMPOS QUE NUNCA SE COPIAN LITERALMENTE DE INV-0001');
    console.log(NEVER_COPY_FIELDS.join(', '));
    console.log('INV-0001 aporta únicamente el esquema de campos; ningún valor suyo se copia a otro invitado.');
}

function printSummary(summary) {
    console.log('\nRESUMEN');
    console.table({
        'Total invitados': summary.total,
        'Ya normalizados': summary.normalized,
        'Requieren cambios': summary.requiresChanges,
        'Inválidos': summary.invalid,
        'Sin código': summary.withoutCode,
        'Sin QR': summary.withoutQrToken,
        'Tipos incorrectos': summary.wrongTypes
    });
}

function printBlockers(blockers) {
    if (!blockers.length) {
        console.log('\nBLOQUEOS: ninguno');
        return;
    }
    console.log('\nBLOQUEOS');
    blockers.forEach((item) => console.log(`- ${item}`));
}

function printFieldDiff(difference, indent = '') {
    console.log(`${indent}Campo: ${difference.field}`);
    console.log(`${indent}  Valor actual: ${difference.currentDisplay}`);
    console.log(`${indent}  Tipo actual JS: ${difference.currentJsType}`);
    console.log(`${indent}  Tipo actual Firestore: ${difference.currentFirestoreType}`);
    console.log(`${indent}  Valor propuesto: ${difference.proposedDisplay}`);
    console.log(`${indent}  Tipo propuesto JS: ${difference.proposedJsType}`);
    console.log(`${indent}  Tipo propuesto Firestore: ${difference.proposedFirestoreType}`);
    console.log(`${indent}  Motivo: ${difference.reason}`);
    if (difference.statusContext) {
        console.log(`${indent}  Estado raw: ${difference.statusContext.rawDisplay} (JS: ${difference.statusContext.rawJsType}; Firestore: ${difference.statusContext.rawFirestoreType})`);
        console.log(`${indent}  Estado normalizado: ${difference.statusContext.normalizedDisplay} (JS: ${difference.statusContext.normalizedJsType}; Firestore: ${difference.statusContext.normalizedFirestoreType})`);
    }
}

async function confirmApply(eventId) {
    if (!input.isTTY || !output.isTTY) {
        throw new Error('--apply requiere una terminal interactiva para la confirmación adicional.');
    }
    const prompt = createInterface({ input, output });
    try {
        const answer = await prompt.question(`Escribe NORMALIZAR ${eventId} para crear el backup y aplicar: `);
        if (answer.trim() !== `NORMALIZAR ${eventId}`) throw new Error('Confirmación cancelada; no se escribió nada.');
    } finally {
        prompt.close();
    }
}

async function createBackup(eventId, documents) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const directory = path.join(root, 'backups');
    await mkdir(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, 'Z');
    const filePath = path.join(directory, `${eventId}-guests-before-normalization-${stamp}.json`);
    const payload = documents.map((snapshot) => ({ id: snapshot.id, data: serializeFirestoreValue(snapshot.data()) }));
    await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return filePath;
}

function prepareGeneratedCode(documentId, occupiedCodes) {
    const preferred = generateGuestVisibleCode(documentId);
    if (!occupiedCodes.has(preferred)) return preferred;
    for (let attempt = 0; attempt < 16; attempt += 1) {
        const candidate = generateGuestVisibleCode();
        if (!occupiedCodes.has(candidate)) return candidate;
    }
    throw new Error(`No se pudo reservar un código único para ${documentId}.`);
}

function allocateUniqueCode(documentId, occupiedCodes) {
    const value = prepareGeneratedCode(documentId, occupiedCodes);
    occupiedCodes.add(value);
    return value;
}

function allocateUniqueToken(occupiedTokens) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
        const value = generateGuestQrToken();
        if (isValidQrToken(value) && !occupiedTokens.has(value)) {
            occupiedTokens.add(value);
            return value;
        }
    }
    throw new Error('No se pudo generar un qrToken único.');
}

function serializeFirestoreValue(value) {
    if (isTimestamp(value)) return { __type: 'timestamp', value: value.toDate().toISOString() };
    if (value?.constructor?.name === 'GeoPoint') return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
    if (value?.constructor?.name === 'DocumentReference') return { __type: 'reference', path: value.path };
    if (Buffer.isBuffer(value) || value?.constructor?.name === 'Bytes') {
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value.toUint8Array());
        return { __type: 'bytes', base64: bytes.toString('base64') };
    }
    if (Array.isArray(value)) return value.map(serializeFirestoreValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeFirestoreValue(child)]));
    }
    return value;
}

function displayValue(key, value) {
    if (key === 'qrToken') return maskSecret(value);
    if (isTimestamp(value)) return value.toDate().toISOString();
    if (value === null) return 'null';
    if (typeof value === 'object') return JSON.stringify(serializeFirestoreValue(value));
    return String(value);
}

function maskSecret(value) {
    const text = String(value ?? '');
    if (!text) return '(vacío)';
    return text.length <= 8 ? '********' : `${text.slice(0, 4)}…${text.slice(-4)} (${text.length} caracteres)`;
}

function addIdentity(registry, value, documentId) {
    if (typeof value !== 'string' || !value.trim()) return;
    const normalized = value.trim();
    const ids = registry.get(normalized) || [];
    ids.push(documentId);
    registry.set(normalized, ids);
}

function duplicateValues(registry) {
    return [...registry.entries()].filter(([, ids]) => ids.length > 1).map(([value]) => value);
}

function toStrictInteger(value) {
    if (typeof value === 'number') return Number.isInteger(value) ? value : null;
    if (typeof value !== 'string' || !/^[+-]?\d+$/.test(value.trim())) return null;
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function isTimestamp(value) {
    return value?.constructor?.name === 'Timestamp'
        && typeof value.toDate === 'function'
        && typeof value.toMillis === 'function';
}

function compareTimestamps(left, right) {
    return left.toMillis() - right.toMillis();
}

function isSafeDocumentId(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 1_500 && !value.includes('/');
}

function isMainModule() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function loadFirebaseAdmin() {
    try {
        const [app, firestore] = await Promise.all([
            import('firebase-admin/app'),
            import('firebase-admin/firestore')
        ]);
        return { ...app, ...firestore };
    } catch (error) {
        throw new Error(`Falta firebase-admin. Ejecuta npm install en este repositorio. Detalle: ${error?.message || error}`);
    }
}
