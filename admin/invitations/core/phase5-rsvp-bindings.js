import { buildWhatsAppUrl } from './safe-url.js?v=phase51-rsvp-20260816';
import { isSectionAllowed } from './section-registry.js?v=phase3-logistics-20260813';
import { isRsvpEnabled, resolveRsvpGuestPolicy } from './rsvp-schema.js?v=phase51-rsvp-20260816';

const CONFIG_PATHS = Object.freeze([
    'content.rsvp.enabled',
    'content.rsvp.method',
    'content.rsvp.whatsapp.phone',
    'content.rsvp.whatsapp.message',
    'content.rsvp.guestPolicy',
    'content.rsvp.responses.acceptedLabel',
    'content.rsvp.responses.declinedLabel',
    'content.rsvp.responses.confirmationMessage'
]);

const CUSTOM_FIELDS = Object.freeze([
    ['title', 'h2', 'Confirma tu asistencia'],
    ['message', 'p', 'Indica si podrás acompañarnos.'],
    ['deadline', 'small', ''],
    ['buttonLabel', 'a', 'Responder invitación']
]);

function clean(value, maxLength = 1800) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function touchedPaths(draft) {
    return new Set(Array.isArray(draft?.meta?.touchedPaths) ? draft.meta.touchedPaths : []);
}

function formatDeadline(value) {
    const match = clean(value, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = match ? new Date(`${value}T12:00:00`) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return `Confirma antes del ${new Intl.DateTimeFormat('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric'
    }).format(date)}.`;
}

function findRoot(documentRoot) {
    return documentRoot.querySelector('[data-builder-semantic-section="rsvp"]')
        ?? documentRoot.querySelector('[data-custom-section="rsvp"]')
        ?? documentRoot.querySelector('[data-demo-action="rsvp"]')?.closest('[data-prestige-feature~="guest-control"]')
        ?? null;
}

function ensureCustomFields(documentRoot, draft) {
    const root = documentRoot.querySelector('[data-custom-section="rsvp"]');
    if (!root) return;
    root.classList.add('builder-phase5-rsvp', 'builder-phase5-rsvp-custom');
    let wrapper = root.querySelector(':scope > [data-builder-semantic-section="rsvp"]');
    if (!wrapper) {
        wrapper = documentRoot.createElement('div');
        wrapper.className = 'builder-semantic-copy';
        wrapper.dataset.builderSemanticSection = 'rsvp';
        wrapper.dataset.prestigeFeature = 'rsvp';
        CUSTOM_FIELDS.forEach(([field, tagName]) => {
            const element = documentRoot.createElement(tagName);
            element.dataset.builderRsvpField = field;
            if (field === 'buttonLabel') element.dataset.demoAction = 'rsvp';
            wrapper.append(element);
        });
        root.append(wrapper);
    }

    const rsvp = draft.content?.rsvp ?? {};
    const touched = touchedPaths(draft);
    CUSTOM_FIELDS.forEach(([field, , fallback]) => {
        const path = `content.rsvp.${field}`;
        const element = wrapper.querySelector(`[data-builder-rsvp-field="${field}"]`);
        if (!element) return;
        const source = field === 'deadline' ? formatDeadline(rsvp[field]) : clean(rsvp[field]);
        const value = source || (touched.has(path) ? '' : fallback);
        element.textContent = value;
        element.hidden = !value;
    });
}

function ensureConfigurationSummary(documentRoot, root, draft) {
    const touched = touchedPaths(draft);
    const rsvp = draft.content?.rsvp ?? {};
    const shouldRender = root?.matches('[data-custom-section="rsvp"]')
        || CONFIG_PATHS.some((path) => touched.has(path));
    root?.querySelector('[data-builder-rsvp-config]')?.remove();
    if (!root || !shouldRender || !isRsvpEnabled(rsvp)) return null;

    const policy = resolveRsvpGuestPolicy(rsvp, {
        passSelectionAllowed: isSectionAllowed('pass-selection', draft.packageId)
    });
    const summary = documentRoot.createElement('div');
    summary.className = 'builder-phase5-rsvp-config';
    summary.dataset.builderRsvpConfig = 'true';

    const meta = documentRoot.createElement('p');
    meta.className = 'builder-phase5-rsvp-meta';
    const methodLabel = rsvp.method === 'whatsapp' ? 'WhatsApp' : 'Confirmación interna';
    const policyLabel = policy.effective === 'select-up-to-assigned'
        ? 'Selección hasta el límite asignado'
        : 'Únicamente pases asignados';
    meta.textContent = `${methodLabel} · ${policyLabel}${policy.retained ? ' · Configuración conservada para upgrade' : ''}`;
    summary.append(meta);

    const accepted = clean(rsvp.responses?.acceptedLabel, 120);
    const declined = clean(rsvp.responses?.declinedLabel, 120);
    if (accepted || declined) {
        const choices = documentRoot.createElement('div');
        choices.className = 'builder-phase5-rsvp-choices';
        [accepted, declined].filter(Boolean).forEach((label) => {
            const choice = documentRoot.createElement('span');
            choice.textContent = label;
            choices.append(choice);
        });
        summary.append(choices);
    }

    const confirmation = clean(rsvp.responses?.confirmationMessage, 500);
    if (confirmation) {
        const message = documentRoot.createElement('p');
        message.className = 'builder-phase5-rsvp-confirmation';
        message.textContent = confirmation;
        summary.append(message);
    }
    root.append(summary);
    return summary;
}

function bindAction(documentRoot, draft) {
    const rsvp = draft.content?.rsvp ?? {};
    const action = documentRoot.querySelector('[data-builder-rsvp-field="buttonLabel"]')
        ?? documentRoot.querySelector('[data-builder-field-path="content.rsvp.buttonLabel"]')
        ?? documentRoot.querySelector('[data-demo-action="rsvp"]');
    if (!action) return { method: rsvp.method, url: '' };

    const whatsappUrl = rsvp.method === 'whatsapp' ? buildWhatsAppUrl(rsvp.whatsapp) : '';
    action.dataset.builderAction = rsvp.method === 'whatsapp' ? 'whatsapp' : 'rsvp';
    action.dataset.rsvpMethod = rsvp.method === 'whatsapp' ? 'whatsapp' : 'internal';
    action.removeAttribute('target');
    action.removeAttribute('rel');
    if (whatsappUrl) action.setAttribute('href', whatsappUrl);
    else action.removeAttribute('href');
    return { method: action.dataset.rsvpMethod, url: whatsappUrl };
}

export function applyPhase5RsvpBindings(documentRoot, adapter, draft = {}) {
    if (!documentRoot || !draft.content?.rsvp) return { applied: false, themeId: adapter?.themeId ?? 'custom' };
    let root = findRoot(documentRoot);
    if (!root) return { applied: false, themeId: adapter?.themeId ?? 'custom' };
    ensureCustomFields(documentRoot, draft);
    root = findRoot(documentRoot) ?? root;
    const summary = ensureConfigurationSummary(documentRoot, root, draft);
    const action = bindAction(documentRoot, draft);
    root.dataset.builderRsvpEnabled = String(isRsvpEnabled(draft.content.rsvp));
    return {
        applied: true,
        themeId: adapter?.themeId ?? 'custom',
        method: action.method,
        whatsappUrl: action.url,
        renderedSummary: Boolean(summary)
    };
}
