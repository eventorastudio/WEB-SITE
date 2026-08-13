const adapters = {
    aloha: { identity: '.hero-copy h2', identityMode: 'aloha', eventLine: '.hero-date', welcome: '.welcome' },
    luxury: { identity: '.hero-frame h2', identityMode: 'luxury', eventLine: '.editorial-nav span', welcome: '.chapter' },
    botanical: { identity: '.hero-paper h2', eventLine: '.hero-paper .kicker', welcome: '.intro' },
    midnight: { identity: '.hero-copy h2', eventLine: '.date-lockup', welcome: '.manifesto' },
    romance: { identity: '.hero-copy h2', eventLine: '.hero-copy .date', welcome: '.love-note' },
    minimal: { identity: '.hero-grid > h2', identityMode: 'minimal', eventLine: '.hero-meta > p:first-child', welcome: '.statement' },
    celestial: { identity: '.hero-copy h2', eventLine: '.hero-date', welcome: '.vow' },
    vintage: { identity: '.masthead h2', eventLine: '.masthead > div', welcome: '.front-page' },
    garden: { identity: '.hero-copy h2', eventLine: '.hero-copy .date', welcome: '.garden-welcome' },
    champagne: { identity: '.hero-copy h2', eventLine: '.hero-date', welcome: '.toast' },
    'neon-party': { identity: '.hero-copy h2', eventLine: '.party-date', welcome: '.party-manifesto' }
};

export const TEMPLATE_BINDING_REGISTRY = Object.freeze(Object.fromEntries(
    Object.entries(adapters).map(([themeId, adapter]) => [themeId, Object.freeze({ themeId, ...adapter })])
));

const originalContent = new WeakMap();
const SEMANTIC_LABEL_SELECTOR = [
    'p.eyebrow', 'p.kicker', 'p.label', 'p.overline', 'p.script', 'p.postmark',
    'p.section-no', 'p.champagne-label', 'p.garden-label', 'p.celestial-label', 'p.party-label'
].join(',');

function safeQuery(root, selector) {
    if (!root || !selector) return null;
    try { return root.querySelector(selector); }
    catch { return null; }
}

function safeQueryAll(root, selector) {
    if (!root || !selector) return [];
    try { return [...root.querySelectorAll(selector)]; }
    catch { return []; }
}

function remember(element) {
    if (!element || originalContent.has(element)) return;
    originalContent.set(element, [...element.childNodes].map((node) => node.cloneNode(true)));
}

function restore(element) {
    const nodes = originalContent.get(element);
    if (!nodes) return;
    element.replaceChildren(...nodes.map((node) => node.cloneNode(true)));
}

function clean(value) {
    return String(value ?? '').trim();
}

function firstValue(...values) {
    return values.map(clean).find(Boolean) ?? '';
}

function joinCopy(...values) {
    return values.map(clean).filter(Boolean).join(' ');
}

function identityParts(content = {}) {
    const identity = content.identity ?? {};
    let primary = clean(identity.primaryName);
    let secondary = clean(identity.secondaryName);
    if (!secondary) {
        const split = primary.split(/\s*&\s*/);
        if (split.length === 2 && split.every(Boolean)) [primary, secondary] = split;
    }
    return { primary, secondary, display: [primary, secondary].filter(Boolean).join(' & ') };
}

function applyText(element, value) {
    if (!element) return false;
    remember(element);
    const next = clean(value);
    if (!next) restore(element);
    else element.textContent = next;
    return true;
}

function applyIdentity(element, content, mode = 'text') {
    if (!element) return false;
    remember(element);
    element.dataset.invitationBind = 'identity';
    const parts = identityParts(content);
    if (!parts.display) {
        restore(element);
        return true;
    }

    if (mode === 'aloha') {
        restore(element);
        const brand = element.querySelector('span');
        if (!brand) element.textContent = parts.display;
        else {
            while (brand.nextSibling) brand.nextSibling.remove();
            element.append(` ${parts.display}`);
        }
        return true;
    }

    if (mode === 'luxury') {
        restore(element);
        const names = element.querySelectorAll('span');
        const separator = element.querySelector('i');
        if (names.length >= 2) {
            names[0].textContent = parts.primary || parts.display;
            names[1].textContent = parts.secondary;
            names[1].hidden = !parts.secondary;
            if (separator) separator.hidden = !parts.secondary;
        } else element.textContent = parts.display;
        return true;
    }

    if (mode === 'minimal' && parts.secondary) {
        const ownerDocument = element.ownerDocument;
        const separator = ownerDocument.createElement('span');
        separator.textContent = '&';
        element.replaceChildren(parts.primary.toUpperCase(), ownerDocument.createElement('br'), separator, ` ${parts.secondary.toUpperCase()}`);
        return true;
    }

    element.textContent = parts.display;
    return true;
}

function validDate(value) {
    const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = match ? new Date(`${value}T12:00:00`) : null;
    return date && !Number.isNaN(date.getTime())
        && date.getFullYear() === Number(match[1])
        && date.getMonth() + 1 === Number(match[2])
        && date.getDate() === Number(match[3])
        ? date
        : null;
}

export function formatInvitationDate(value) {
    const date = validDate(value);
    return date
        ? new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
        : '';
}

export function formatInvitationEventLine(content = {}) {
    const date = formatInvitationDate(content.schedule?.date);
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clean(content.schedule?.time)) ? clean(content.schedule.time) : '';
    const place = [clean(content.place?.city), clean(content.place?.state)].filter(Boolean).join(', ');
    return [date, time, place].filter(Boolean).join(' · ').toUpperCase();
}

function sectionElements(container) {
    if (!container) return { heading: null, label: null, bodies: [], cta: null };
    const label = safeQuery(container, SEMANTIC_LABEL_SELECTOR);
    const bodies = safeQueryAll(container, 'p').filter((paragraph) => (
        paragraph !== label
        && !paragraph.matches(SEMANTIC_LABEL_SELECTOR)
        && !paragraph.closest('[data-access-preview]')
        && !paragraph.closest('[data-pass-selector]')
    ));
    return {
        heading: safeQuery(container, 'h1,h2,h3'),
        label,
        bodies,
        cta: container.matches?.('a,button')
            ? container
            : safeQuery(container, 'a[data-demo-action],button[data-demo-action],a,button')
    };
}

function bindWelcome(root, adapter, content) {
    const container = safeQuery(root, adapter.welcome);
    const elements = sectionElements(container);
    const heading = firstValue(content.welcome?.title, content.identity?.phrase);
    const body = joinCopy(content.welcome?.message, content.welcome?.story);
    applyText(elements.label, content.welcome?.eyebrow);
    if (elements.heading) {
        applyText(elements.heading, heading);
        applyText(elements.bodies.at(-1), body);
    } else {
        applyText(elements.bodies.at(-1), joinCopy(heading, body));
    }
}

function bindFeature(root, feature, values = {}) {
    const container = safeQuery(root, `[data-prestige-feature~="${feature}"]`);
    const elements = sectionElements(container);
    applyText(elements.label, values.label);
    if (elements.heading) applyText(elements.heading, values.title);
    else if (values.title) applyText(elements.bodies[0], values.title);
    const bodyTarget = elements.heading ? elements.bodies[0] : (elements.bodies[1] ?? null);
    applyText(bodyTarget, values.body);
    applyText(values.ctaSelector ? safeQuery(container, values.ctaSelector) : elements.cta, values.cta);
}

function bindLocation(root, draft) {
    const container = safeQuery(root, '[data-prestige-feature~="multiple-locations"]');
    const elements = sectionElements(container);
    const firstLocation = draft.locations?.[0] ?? {};
    applyText(elements.label, draft.content.location?.title);
    applyText(elements.heading, firstLocation.name);
    applyText(elements.bodies[0], joinCopy(firstLocation.address, firstLocation.description, draft.content.location?.intro));
}

function bindPassCopy(root, content) {
    safeQueryAll(root, '[data-pass-selector]').forEach((target) => {
        const title = clean(content.passes?.title);
        const instructions = clean(content.passes?.instructions);
        remember(target);
        if (!title && !instructions) {
            restore(target);
            return;
        }
        const heading = target.ownerDocument.createElement('p');
        heading.textContent = title;
        const copy = target.ownerDocument.createElement('span');
        copy.className = 'prestige-pass-summary';
        copy.textContent = instructions;
        target.classList.add('prestige-pass-selector');
        target.replaceChildren(...[title ? heading : null, instructions ? copy : null].filter(Boolean));
    });
}

function bindAccessCopy(root, draft) {
    const display = identityParts(draft.content).display;
    safeQueryAll(root, '[data-access-guest]').forEach((element) => applyText(element, display));
    const label = firstValue(draft.content.access?.label, draft.content.access?.description, draft.content.access?.title);
    safeQueryAll(root, '[data-access-passes]').forEach((element) => applyText(element, label));
}

export function applyTemplateContentBindings(root, themeId, draft = {}) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId];
    if (!adapter || !root || !draft.content) return { applied: false, themeId };
    const content = draft.content;

    applyIdentity(safeQuery(root, adapter.identity), content, adapter.identityMode);
    applyText(safeQuery(root, adapter.eventLine), formatInvitationEventLine(content));
    bindWelcome(root, adapter, content);
    bindFeature(root, 'countdown', {
        label: content.countdown?.preMessage,
        title: content.countdown?.title
    });
    bindLocation(root, draft);
    bindFeature(root, 'dress-code', {
        label: content.dressCode?.title,
        title: content.dressCode?.name,
        body: joinCopy(content.dressCode?.description, content.dressCode?.note)
    });
    bindFeature(root, 'welcome-video', {
        label: content.video?.subtitle,
        title: content.video?.title,
        body: content.video?.intro
    });
    bindFeature(root, 'gallery', {
        label: content.gallery?.subtitle,
        title: content.gallery?.title,
        body: content.gallery?.description
    });
    bindFeature(root, 'gift-registry', {
        title: content.gifts?.title,
        body: content.gifts?.description,
        cta: content.gifts?.ctaLabel
    });
    bindFeature(root, 'itinerary', {
        title: content.itinerary?.title,
        body: content.itinerary?.intro
    });
    bindFeature(root, 'guest-control', {
        title: content.rsvp?.title,
        body: joinCopy(content.rsvp?.message, content.rsvp?.deadline ? `Confirma antes del ${formatInvitationDate(content.rsvp.deadline)}.` : ''),
        cta: content.rsvp?.buttonLabel,
        ctaSelector: '[data-demo-action="rsvp"]'
    });
    bindPassCopy(root, content);
    bindAccessCopy(root, draft);
    return { applied: true, themeId };
}

export function createTemplateSectionContract(themeId, sections = []) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId];
    return {
        sections: sections.map((section) => ({
            id: section.id,
            previewSelectors: section.id === 'welcome-story'
                ? (adapter?.welcome ? [adapter.welcome] : [])
                : section.id === 'rsvp'
                    ? [
                        '[data-prestige-feature~="guest-control"] > h2',
                        '[data-prestige-feature~="guest-control"] > p',
                        '[data-prestige-feature~="rsvp"]'
                    ]
                    : [...section.previewSelectors]
        })),
        groups: [{
            id: 'guest-experience',
            selector: '[data-prestige-feature~="guest-control"]',
            anyOf: ['rsvp', 'pass-selection', 'access-preview']
        }]
    };
}

export function validateTemplateBindingAdapter(root, themeId) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId];
    if (!adapter) return { valid: false, missing: ['adapter'] };
    const missing = ['identity', 'eventLine', 'welcome'].filter((key) => !safeQuery(root, adapter[key]));
    return { valid: missing.length === 0, missing };
}
