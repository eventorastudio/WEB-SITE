// Contrato puro para IDs y secuencias de check-in. No importa Firebase.

export const GUEST_DOCUMENT_ID_PATTERN = /^INV-\d{4,}$/;
export const CHECKIN_DOCUMENT_ID_PATTERN = /^(INV-\d{4,})-(\d{3,})$/;

export function isCanonicalGuestId(value) {
    return typeof value === 'string' && GUEST_DOCUMENT_ID_PATTERN.test(value);
}

export function formatCheckinId(guestId, sequence) {
    if (!isCanonicalGuestId(guestId)) throw new Error('checkin-numbering/invalid-guest-id');
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
        throw new Error('checkin-numbering/invalid-sequence');
    }
    return `${guestId}-${String(sequence).padStart(3, '0')}`;
}

export function parseCheckinId(value) {
    const match = typeof value === 'string' ? CHECKIN_DOCUMENT_ID_PATTERN.exec(value) : null;
    if (!match) return null;
    const sequence = Number(match[2]);
    if (!Number.isSafeInteger(sequence) || sequence < 1) return null;
    return { guestId: match[1], sequence };
}

export function normalizeCheckinSequence(value, { strict = false } = {}) {
    if (value === undefined || value === null || value === '') return 0;
    if (Number.isSafeInteger(value) && value >= 0) return value;
    if (strict) throw new Error('checkin-numbering/invalid-sequence');
    return 0;
}

export function allocateNextCheckin(guestId, currentSequence) {
    if (!Number.isSafeInteger(currentSequence) || currentSequence < 0) {
        throw new Error('checkin-numbering/invalid-sequence');
    }
    const sequence = currentSequence + 1;
    if (!Number.isSafeInteger(sequence)) throw new Error('checkin-numbering/sequence-overflow');
    return { guestId, sequence, id: formatCheckinId(guestId, sequence) };
}

export function createCheckinRenumberPlan({ guests = [], checkins = [] } = {}) {
    const errors = [];
    const conflicts = [];
    const guestMap = new Map();

    for (const record of guests) {
        if (!record || !isCanonicalGuestId(record.id)) {
            errors.push(`Invitado ${record?.id || '(sin ID)'} no tiene formato INV-XXXX`);
            continue;
        }
        if (guestMap.has(record.id)) errors.push(`Invitado duplicado en el plan: ${record.id}`);
        guestMap.set(record.id, record);
    }

    const groups = new Map();
    const sourceIds = new Set();
    for (const record of checkins) {
        const oldId = String(record?.id ?? '');
        const data = record?.data && typeof record.data === 'object' ? record.data : {};
        if (!oldId || sourceIds.has(oldId)) {
            errors.push(`Check-in ${oldId || '(sin ID)'} tiene un Document ID ausente o duplicado`);
            continue;
        }
        sourceIds.add(oldId);

        const guestId = data.invitadoId;
        if (!isCanonicalGuestId(guestId)) {
            errors.push(`Check-in ${oldId}: invitadoId ausente o sin formato INV-XXXX`);
            continue;
        }
        if (!guestMap.has(guestId)) {
            errors.push(`Check-in ${oldId}: no existe invitados/${guestId}`);
            continue;
        }
        if (Object.hasOwn(data, 'codigoInvitado') && data.codigoInvitado !== guestId) {
            errors.push(`Check-in ${oldId}: codigoInvitado (${display(data.codigoInvitado)}) no coincide con invitadoId (${guestId})`);
            continue;
        }
        if (!timestampParts(data.fechaHora)) {
            errors.push(`Check-in ${oldId}: fechaHora ausente o no es Timestamp`);
            continue;
        }
        const group = groups.get(guestId) || [];
        group.push({ oldId, data, guestId });
        groups.set(guestId, group);
    }

    const moves = [];
    for (const guestId of [...groups.keys()].sort()) {
        const ordered = groups.get(guestId).sort(compareCheckins);
        ordered.forEach((record, index) => {
            const sequence = index + 1;
            moves.push({
                ...record,
                sequence,
                newId: formatCheckinId(guestId, sequence),
                guestName: String(guestMap.get(guestId)?.data?.nombre ?? '')
            });
        });
    }

    const targets = new Map();
    for (const move of moves) {
        if (targets.has(move.newId)) {
            conflicts.push(`${move.newId} fue asignado a ${targets.get(move.newId)} y ${move.oldId}`);
        } else {
            targets.set(move.newId, move.oldId);
        }
        if (sourceIds.has(move.newId) && move.oldId !== move.newId) {
            conflicts.push(`${move.newId} ya existe como otro documento; no se sobrescribirá`);
        }
    }

    const guestSequenceUpdates = [];
    const sequenceByGuest = new Map();
    moves.forEach((move) => sequenceByGuest.set(move.guestId, Math.max(
        sequenceByGuest.get(move.guestId) || 0,
        move.sequence
    )));
    for (const guest of guestMap.values()) {
        const expected = sequenceByGuest.get(guest.id) || 0;
        const current = guest.data?.checkinSecuencia;
        if (current !== expected) {
            guestSequenceUpdates.push({ guestId: guest.id, current, expected });
        }
    }

    return {
        totalCheckins: checkins.length,
        guestsWithCheckins: groups.size,
        documentsToRename: moves.filter((move) => move.oldId !== move.newId).length,
        moves,
        guestSequenceUpdates,
        errors,
        conflicts: [...new Set(conflicts)],
        canApply: errors.length === 0 && conflicts.length === 0
    };
}

export function compareCheckins(left, right) {
    const leftTime = timestampParts(left?.data?.fechaHora);
    const rightTime = timestampParts(right?.data?.fechaHora);
    if (!leftTime || !rightTime) throw new Error('checkin-numbering/invalid-timestamp');
    if (leftTime.seconds !== rightTime.seconds) return leftTime.seconds - rightTime.seconds;
    if (leftTime.nanoseconds !== rightTime.nanoseconds) return leftTime.nanoseconds - rightTime.nanoseconds;
    return String(left.oldId).localeCompare(String(right.oldId), 'en', { sensitivity: 'variant', numeric: false });
}

export function timestampParts(value) {
    if (!value || typeof value !== 'object') return null;
    const seconds = Number(value.seconds ?? value._seconds);
    const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
    if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(nanoseconds)) return null;
    if (nanoseconds < 0 || nanoseconds >= 1_000_000_000) return null;
    return { seconds, nanoseconds };
}

function display(value) {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
}
