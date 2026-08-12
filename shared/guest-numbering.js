export const GUEST_ID_PREFIX = 'INV-';
export const GUEST_ID_MIN_DIGITS = 4;

const baseCollator = new Intl.Collator('es-MX', {
    usage: 'sort',
    sensitivity: 'base',
    numeric: true,
    ignorePunctuation: false
});
const exactCollator = new Intl.Collator('es-MX', {
    usage: 'sort',
    sensitivity: 'variant',
    numeric: true,
    ignorePunctuation: false
});

export function formatGuestId(sequence) {
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
        throw new Error('guest-numbering/invalid-sequence');
    }
    return `${GUEST_ID_PREFIX}${String(sequence).padStart(GUEST_ID_MIN_DIGITS, '0')}`;
}

export function parseGuestId(value) {
    const match = /^INV-(\d{4,})$/.exec(String(value ?? '').trim());
    if (!match) return null;
    const sequence = Number(match[1]);
    return Number.isSafeInteger(sequence) && sequence >= 1 ? sequence : null;
}

export function normalizeGuestSortName(value) {
    return String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es-MX');
}

export function compareGuestsForNumbering(left, right) {
    const leftName = String(left?.data?.nombre ?? left?.nombre ?? '').trim().replace(/\s+/g, ' ');
    const rightName = String(right?.data?.nombre ?? right?.nombre ?? '').trim().replace(/\s+/g, ' ');
    const normalizedComparison = baseCollator.compare(
        normalizeGuestSortName(leftName),
        normalizeGuestSortName(rightName)
    );
    if (normalizedComparison) return normalizedComparison;

    const originalComparison = exactCollator.compare(leftName, rightName);
    if (originalComparison) return originalComparison;

    const leftCode = String(left?.data?.codigoInvitado ?? left?.codigoInvitado ?? '').trim();
    const rightCode = String(right?.data?.codigoInvitado ?? right?.codigoInvitado ?? '').trim();
    const codeComparison = exactCollator.compare(leftCode, rightCode);
    if (codeComparison) return codeComparison;

    return exactCollator.compare(String(left?.id ?? ''), String(right?.id ?? ''));
}

export function buildGuestRenumberPlan(guests, {
    preservedId = 'INV-0001',
    firstSequence = 2
} = {}) {
    const records = (Array.isArray(guests) ? guests : []).map((guest) => ({
        id: String(guest?.id ?? ''),
        data: guest?.data && typeof guest.data === 'object' ? guest.data : {}
    }));
    const errors = [];
    const conflicts = [];
    const preserved = [];
    const occupied = new Map(records.map((guest) => [guest.id, guest]));
    if (preservedId) {
        const reference = occupied.get(preservedId);
        if (!reference) {
            errors.push(`${preservedId} no existe`);
        } else if (reference.data.codigoInvitado !== preservedId) {
            errors.push(`${preservedId}.codigoInvitado debe ser exactamente ${preservedId}`);
        } else {
            preserved.push({ oldId: preservedId, newId: preservedId, data: reference.data, reason: 'referencia protegida' });
        }
    }

    const candidates = records
        .filter((guest) => !preservedId || guest.id !== preservedId)
        .sort(compareGuestsForNumbering);

    const moves = candidates.map((guest, index) => {
        const newId = formatGuestId(firstSequence + index);
        const target = occupied.get(newId);
        if (target && target.id !== guest.id) {
            conflicts.push({
                targetId: newId,
                occupiedBy: target.id,
                incomingId: guest.id,
                message: `${newId} ya existe y está ocupado por ${target.id}`
            });
        }
        if (!String(guest.data.nombre ?? '').trim()) {
            errors.push(`${guest.id} no tiene un nombre utilizable para ordenar`);
        }
        return {
            position: index + 1,
            name: String(guest.data.nombre ?? '').trim(),
            oldId: guest.id,
            oldCode: typeof guest.data.codigoInvitado === 'string' ? guest.data.codigoInvitado.trim() : '',
            newId,
            data: guest.data,
            newData: { ...guest.data, codigoInvitado: newId },
            requiresMove: guest.id !== newId
        };
    });

    const duplicateTokens = duplicateNonEmptyValues(records, (guest) => guest.data.qrToken);
    duplicateTokens.forEach((token) => errors.push(`qrToken duplicado detectado: ${maskToken(token)}`));

    return {
        preserved,
        moves,
        conflicts,
        errors,
        totalGuests: records.length,
        firstSequence,
        finalSequence: records.length ? firstSequence + candidates.length - 1 : 0,
        canApply: errors.length === 0 && conflicts.length === 0
    };
}

export function planCheckinReferenceUpdates(checkins, moves) {
    const byOldId = new Map();
    const byOldCode = new Map();
    moves.forEach((move) => {
        byOldId.set(move.oldId, move);
        if (move.oldCode) addAlias(byOldCode, move.oldCode, move);
        addAlias(byOldCode, move.oldId, move);
    });

    const updates = [];
    const conflicts = [];
    (Array.isArray(checkins) ? checkins : []).forEach((checkin) => {
        const data = checkin?.data && typeof checkin.data === 'object' ? checkin.data : {};
        const matches = new Set();
        for (const field of ['invitadoId', 'guestId']) {
            const move = byOldId.get(String(data[field] ?? '').trim());
            if (move) matches.add(move);
        }
        const codeMatches = byOldCode.get(String(data.codigoInvitado ?? '').trim());
        if (codeMatches) codeMatches.forEach((move) => matches.add(move));

        if (matches.size > 1) {
            conflicts.push({
                id: String(checkin?.id ?? ''),
                message: `checkin ${checkin?.id ?? '(sin id)'} contiene referencias a invitados distintos`
            });
            return;
        }
        if (matches.size === 0) return;

        const [move] = matches;
        const patch = {};
        if (byOldId.has(String(data.invitadoId ?? '').trim()) && data.invitadoId !== move.newId) {
            patch.invitadoId = move.newId;
        }
        if (byOldId.has(String(data.guestId ?? '').trim()) && data.guestId !== move.newId) {
            patch.guestId = move.newId;
        }
        if (Object.hasOwn(data, 'codigoInvitado') && data.codigoInvitado !== move.newId) {
            patch.codigoInvitado = move.newId;
        }
        if (Object.keys(patch).length === 0) return;
        updates.push({
            id: String(checkin?.id ?? ''),
            guestOldId: move.oldId,
            guestNewId: move.newId,
            patch,
            original: data
        });
    });

    return { updates, conflicts };
}

export function selectNextAvailableGuestSequence(currentSequence, occupiedIds, { maxAttempts = 10_000 } = {}) {
    const occupied = occupiedIds instanceof Set ? occupiedIds : new Set(occupiedIds || []);
    let sequence = Number.isSafeInteger(currentSequence) && currentSequence >= 0 ? currentSequence : 0;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        sequence += 1;
        const id = formatGuestId(sequence);
        if (!occupied.has(id)) return { sequence, id };
    }
    throw new Error('guest-numbering/no-available-sequence');
}

export async function findNextAvailableGuestSequence(currentSequence, isOccupied, { maxAttempts = 100 } = {}) {
    if (typeof isOccupied !== 'function') throw new Error('guest-numbering/invalid-occupancy-check');
    let sequence = Number.isSafeInteger(currentSequence) && currentSequence >= 0 ? currentSequence : 0;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        sequence += 1;
        const id = formatGuestId(sequence);
        if (!(await isOccupied(id))) return { sequence, id };
    }
    throw new Error('guest-numbering/no-available-sequence');
}

function addAlias(registry, value, move) {
    const entries = registry.get(value) || new Set();
    entries.add(move);
    registry.set(value, entries);
}

function duplicateNonEmptyValues(records, selector) {
    const counts = new Map();
    records.forEach((record) => {
        const value = selector(record);
        if (typeof value !== 'string' || !value.trim()) return;
        counts.set(value.trim(), (counts.get(value.trim()) || 0) + 1);
    });
    return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function maskToken(value) {
    const text = String(value ?? '');
    return text.length <= 8 ? '********' : `${text.slice(0, 4)}…${text.slice(-4)}`;
}
