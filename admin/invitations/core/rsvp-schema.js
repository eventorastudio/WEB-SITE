export const RSVP_SCHEMA_VERSION = 1;

export const RSVP_METHODS = Object.freeze(['whatsapp', 'internal']);
export const RSVP_GUEST_POLICIES = Object.freeze(['assigned-only', 'select-up-to-assigned']);
export const RSVP_GUEST_POLICY_PATH = 'content.rsvp.guestPolicy';

export const RSVP_EDITABLE_FIELD_DEFINITIONS = Object.freeze([
    Object.freeze(['content.rsvp.enabled', 'boolean', 0]),
    Object.freeze(['content.rsvp.title', 'text', 120]),
    Object.freeze(['content.rsvp.message', 'text', 500]),
    Object.freeze(['content.rsvp.buttonLabel', 'text', 80]),
    Object.freeze(['content.rsvp.deadline', 'date', 10]),
    Object.freeze(['content.rsvp.deadlineTime', 'time', 5]),
    Object.freeze(['content.rsvp.deadlineTimeZone', 'timezone', 100]),
    Object.freeze(['content.rsvp.method', 'enum', 24]),
    Object.freeze(['content.rsvp.whatsapp.phone', 'phone', 32]),
    Object.freeze(['content.rsvp.whatsapp.message', 'text', 1000]),
    Object.freeze(['content.rsvp.guestPolicy', 'enum', 32]),
    Object.freeze(['content.rsvp.responses.acceptedLabel', 'text', 120]),
    Object.freeze(['content.rsvp.responses.declinedLabel', 'text', 120]),
    Object.freeze(['content.rsvp.responses.confirmationMessage', 'text', 500])
]);

function clean(value, maxLength) {
    return String(value ?? '').slice(0, maxLength);
}

function knownValue(value, allowed, fallback) {
    const candidate = String(value ?? '').trim();
    return allowed.includes(candidate) ? candidate : fallback;
}

export function createRsvpConfig(seed = {}) {
    const whatsapp = seed?.whatsapp ?? {};
    const responses = seed?.responses ?? {};
    return {
        enabled: seed?.enabled !== false,
        title: clean(seed?.title, 120),
        message: clean(seed?.message, 500),
        buttonLabel: clean(seed?.buttonLabel, 80),
        deadline: clean(seed?.deadline, 10).trim(),
        deadlineTime: clean(seed?.deadlineTime, 5).trim(),
        deadlineTimeZone: clean(seed?.deadlineTimeZone, 100).trim(),
        method: knownValue(seed?.method, RSVP_METHODS, 'internal'),
        whatsapp: {
            phone: clean(whatsapp.phone, 32),
            message: clean(whatsapp.message, 1000)
        },
        guestPolicy: knownValue(seed?.guestPolicy, RSVP_GUEST_POLICIES, 'assigned-only'),
        responses: {
            acceptedLabel: clean(responses.acceptedLabel, 120),
            declinedLabel: clean(responses.declinedLabel, 120),
            confirmationMessage: clean(responses.confirmationMessage, 500)
        }
    };
}

// Normaliza tanto el shape de Fase 2 como el contrato completo de Fase 5.1.
export function normalizeRsvpConfig(value = {}) {
    return createRsvpConfig(value);
}

export function isRsvpEnabled(value = {}) {
    return value?.enabled !== false;
}

export function resolveRsvpGuestPolicy(value = {}, { passSelectionAllowed = true } = {}) {
    const configured = RSVP_GUEST_POLICIES.includes(value?.guestPolicy)
        ? value.guestPolicy
        : 'assigned-only';
    const effective = configured === 'select-up-to-assigned' && !passSelectionAllowed
        ? 'assigned-only'
        : configured;
    return Object.freeze({
        configured,
        effective,
        retained: configured !== effective
    });
}
