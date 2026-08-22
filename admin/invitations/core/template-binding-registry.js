import {
    INVITATION_EDITABLE_FIELDS,
    getDraftValue,
    getTouchedDraftPaths
} from './content-schema.js?v=phase54a-rsvp-time-20260817';
import {
    GENERAL_INFORMATION_FIELDS,
    SECTION_EDITOR_REGISTRY
} from './section-editor-registry.js?v=phase54a-rsvp-time-20260817';
import { applyPhase3TemplateBindings } from './phase3-template-bindings.js?v=phase86-aloha-a2-20260820';
import { applyPhase4MediaBindings } from './phase4-media-bindings.js?v=phase86-aloha-a2-20260820';
import { applyPhase5RsvpBindings } from './phase5-rsvp-bindings.js?v=phase54a-rsvp-time-20260817';

const MEDIA_ADAPTERS = Object.freeze({
    aloha: Object.freeze({ cover: '.hero > img.demo-photo', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'aloha' }),
    luxury: Object.freeze({ cover: '.hero .hero-visual img', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'luxury' }),
    botanical: Object.freeze({ cover: '.hero .hero-art img', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'botanical' }),
    midnight: Object.freeze({ cover: '.hero > img', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'midnight' }),
    romance: Object.freeze({ cover: '.hero .portrait img', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'romance' }),
    minimal: Object.freeze({ cover: '.hero .hero-crop img', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'minimal' }),
    celestial: Object.freeze({ cover: '.hero > img', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'celestial' }),
    vintage: Object.freeze({ cover: '.hero .lead-photo img', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'vintage' }),
    garden: Object.freeze({ cover: '.hero .garden-depth img', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'garden' }),
    champagne: Object.freeze({ cover: '.hero .hero-photo img', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'champagne' }),
    'neon-party': Object.freeze({ cover: '.hero .flash-photo img', gallery: '[data-prestige-feature~="gallery"]', video: '[data-prestige-feature~="welcome-video"]', music: '[data-prestige-feature~="music"]', variant: 'neon' })
});

const adapters = {
    aloha: {
        phase3Variant: 'aloha',
        identity: '.hero-copy h2', identityMode: 'aloha', monogram: null,
        eventType: ['.hero-copy .eyebrow'], eventLine: { selector: '.hero-date' },
        phrase: { anchor: '.hero-date' }, welcome: '.welcome',
        eventSpecificDecorations: ['.guest-ticket'],
        identityEchoes: [{ selector: '.social-strip strong', mode: 'aloha-hashtag' }]
    },
    luxury: {
        phase3Variant: 'luxury',
        identity: '.hero-frame h2', identityMode: 'luxury', monogram: '.editorial-nav b',
        eventType: ['.hero-frame > .eyebrow'], eventLine: { selector: '.editorial-nav span' },
        phrase: { selector: '.hero-frame > p.hero-copy' }, welcome: '.chapter',
        identityEchoes: [{ selector: '.editorial-quote small', mode: 'uppercase' }]
    },
    botanical: {
        phase3Variant: 'botanical',
        identity: '.hero-paper h2', monogram: '.hero nav b',
        eventType: ['.hero-paper > .kicker'], eventLine: { anchor: '.hero-paper h2' },
        phrase: { anchor: '[data-builder-generated="event-line"]' }, welcome: '.intro'
    },
    midnight: {
        phase3Variant: 'midnight',
        identity: '.hero-copy h2', monogram: '.hero nav b',
        eventType: ['.hero-copy > .label'], eventLine: { selector: '.date-lockup', mode: 'midnight' },
        phrase: { selector: '.vertical-title' }, welcome: '.manifesto'
    },
    romance: {
        phase3Variant: 'romance',
        identity: '.hero-copy h2', monogram: '.hero nav b',
        eventType: ['.hero-copy > .overline'], eventLine: { selector: '.hero-copy > .date' },
        phrase: { selector: '.margin-note' }, welcome: '.love-note'
    },
    minimal: {
        phase3Variant: 'minimal',
        identity: '.hero-grid > h2', identityMode: 'minimal', monogram: '.hero nav b',
        eventType: ['.hero nav > span'], eventLine: { selector: '.hero-meta > p:first-child' },
        phrase: { anchor: '.hero-meta > p:first-child' }, welcome: '.statement'
    },
    celestial: {
        phase3Variant: 'celestial',
        identity: '.hero-copy h2', monogram: '.orbit-nav b',
        eventType: ['.hero-copy > .celestial-label'], eventLine: { selector: '.hero-date' },
        phrase: { anchor: '.hero-date' }, welcome: '.vow'
    },
    vintage: {
        phase3Variant: 'vintage',
        identity: '.masthead h2', monogram: null,
        eventType: ['.index-nav > b', '.hero > aside > p:first-child'],
        eventLine: { selector: '.masthead > div', mode: 'vintage' },
        phrase: { selector: '.hero > aside > blockquote' }, welcome: '.front-page'
    },
    garden: {
        phase3Variant: 'garden',
        identity: '.hero-copy h2', monogram: '.garden-nav b',
        eventType: ['.hero-copy > .garden-label'], eventLine: { selector: '.hero-copy > .date' },
        phrase: { anchor: '.hero-copy > .date' }, welcome: '.garden-welcome'
    },
    champagne: {
        phase3Variant: 'champagne',
        identity: '.hero-copy h2', monogram: '.floating-nav b',
        eventType: ['.hero-copy > .champagne-label'], eventLine: { selector: '.hero-date' },
        phrase: { selector: '.vertical-note' }, welcome: '.toast'
    },
    'neon-party': {
        phase3Variant: 'neon-party',
        identity: '.hero-copy h2', monogram: '.poster-nav b',
        eventType: ['.hero-copy > .party-label'], eventSpecificDecorations: ['.hero-copy > .hero-xv'],
        eventLine: { selector: '.party-date', mode: 'neon' },
        phrase: { selector: '.side-copy', allowDemoFallback: false }, welcome: '.party-manifesto'
    }
};

export const TEMPLATE_BINDING_REGISTRY = Object.freeze(Object.fromEntries(
    Object.entries(adapters).map(([themeId, adapter]) => [themeId, Object.freeze({
        themeId,
        ...adapter,
        media: MEDIA_ADAPTERS[themeId]
    })])
));

const SECTION_BINDINGS = Object.freeze({
    'welcome-story': {
        root: ({ welcome }) => welcome,
        fields: [
            ['content.welcome.eyebrow', 'eyebrow'],
            ['content.welcome.title', 'title'],
            ['content.welcome.message', 'body'],
            ['content.welcome.story', 'story']
        ]
    },
    countdown: {
        root: '[data-prestige-feature~="countdown"]',
        fields: [
            ['content.countdown.preMessage', 'eyebrow'],
            ['content.countdown.title', 'title'],
            ['content.countdown.arrivedMessage', 'runtime']
        ]
    },
    location: {
        root: '[data-prestige-feature~="multiple-locations"]', replaceDemoChildren: true,
        fields: [
            ['content.location.title', 'eyebrow'],
            ['content.location.intro', 'body']
        ]
    },
    'dress-code': {
        root: '[data-prestige-feature~="dress-code"]',
        fields: [
            ['content.dressCode.title', 'eyebrow'],
            ['content.dressCode.name', 'title'],
            ['content.dressCode.description', 'body'],
            ['content.dressCode.note', 'note']
        ]
    },
    rsvp: {
        root: '[data-prestige-feature~="guest-control"]',
        fields: [
            ['content.rsvp.title', 'title'],
            ['content.rsvp.message', 'body'],
            ['content.rsvp.deadline', 'deadline'],
            ['content.rsvp.deadlineTime', 'runtime'],
            ['content.rsvp.deadlineTimeZone', 'runtime'],
            ['content.rsvp.buttonLabel', 'cta'],
            ['content.rsvp.enabled', 'runtime'],
            ['content.rsvp.method', 'runtime'],
            ['content.rsvp.whatsapp.phone', 'runtime'],
            ['content.rsvp.whatsapp.message', 'runtime'],
            ['content.rsvp.guestPolicy', 'runtime'],
            ['content.rsvp.responses.acceptedLabel', 'runtime'],
            ['content.rsvp.responses.declinedLabel', 'runtime'],
            ['content.rsvp.responses.confirmationMessage', 'runtime']
        ],
        ctaSelector: '[data-demo-action="rsvp"]'
    },
    music: {
        root: '[data-prestige-feature~="music"]',
        fields: [
            ['content.music.title', 'title'],
            ['content.music.text', 'body']
        ]
    },
    'welcome-video': {
        root: '[data-prestige-feature~="welcome-video"]',
        fields: [
            ['content.video.subtitle', 'eyebrow'],
            ['content.video.title', 'title'],
            ['content.video.intro', 'body']
        ]
    },
    gallery: {
        root: '[data-prestige-feature~="gallery"]',
        fields: [
            ['content.gallery.subtitle', 'eyebrow'],
            ['content.gallery.title', 'title'],
            ['content.gallery.description', 'body']
        ]
    },
    'gift-registry': {
        root: '[data-prestige-feature~="gift-registry"]',
        fields: [
            ['content.gifts.title', 'title'],
            ['content.gifts.description', 'body'],
            ['content.gifts.ctaLabel', 'cta']
        ],
        ctaSelector: '[data-demo-action="gifts"]'
    },
    'pass-selection': {
        root: '[data-pass-selector]',
        fields: [
            ['content.passes.title', 'title'],
            ['content.passes.instructions', 'body']
        ]
    },
    itinerary: {
        root: '[data-prestige-feature~="itinerary"]', replaceDemoChildren: true,
        fields: [
            ['content.itinerary.title', 'title'],
            ['content.itinerary.intro', 'body']
        ]
    },
    'access-preview': {
        root: '[data-access-preview]', replaceDemoChildren: true,
        fields: [
            ['content.access.label', 'eyebrow'],
            ['content.access.title', 'title'],
            ['content.access.description', 'body']
        ]
    }
});

const ALOHA_NATIVE_SECTIONS = new Set(['location', 'itinerary', 'dress-code', 'gift-registry', 'gallery']);

const GENERAL_BINDING_PATHS = Object.freeze([
    'content.identity.primaryName',
    'content.identity.secondaryName',
    'content.identity.eventType',
    'content.identity.phrase',
    'content.schedule.date',
    'content.schedule.time',
    'content.place.city',
    'content.place.state'
]);

const originalContent = new WeakMap();
const EVENT_SPECIFIC_COPY = /(?:\bXV\b|\bquince(?:añera| años?)?\b|\bboda\b|\bwedding\b|\bbride\b|\bbridal\b|\bgroom\b|\bnovi[ao]\b|\bmarriage\b|\bbirthday\b|\bcumpleaños\b)/iu;
const COPY_CANDIDATE_SELECTOR = 'h1,h2,h3,p,blockquote,small,span,em,strong,b,a,button';
const LABEL_SELECTOR = [
    'p.eyebrow', 'p.kicker', 'p.label', 'p.overline', 'p.script', 'p.postmark',
    'p.section-no', 'p.champagne-label', 'p.garden-label', 'p.celestial-label', 'p.party-label'
].join(',');

function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

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

function claim(element, owner, collisions) {
    if (!element) return false;
    const previous = element.dataset.builderBindingOwner;
    if (previous && previous !== owner) collisions.push({ previous, next: owner, element });
    element.dataset.builderBindingOwner = owner;
    return true;
}

function fieldState(draft, path) {
    const value = clean(getDraftValue(draft, path));
    return { path, value, touched: getTouchedDraftPaths(draft).includes(path), hasValue: Boolean(value) };
}

function applyField(element, draft, path, collisions, { allowDemoFallback = true, transform = null } = {}) {
    if (!element) return false;
    remember(element);
    claim(element, path, collisions);
    element.dataset.builderBoundPath = path;
    const state = fieldState(draft, path);
    if (state.hasValue) {
        element.textContent = transform ? transform(state.value) : state.value;
        element.hidden = false;
    } else if (state.touched || !allowDemoFallback) {
        element.textContent = '';
        element.hidden = true;
    } else {
        restore(element);
        element.hidden = false;
    }
    return true;
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

function identityTouched(draft) {
    const touched = getTouchedDraftPaths(draft);
    return ['content.identity.primaryName', 'content.identity.secondaryName'].some((path) => touched.includes(path));
}

function fitTextToContainer(element, {
    minimumSize = 14,
    marker = 'data-builder-text-fitted',
    variable = '--builder-text-font-size'
} = {}) {
    const view = element.ownerDocument?.defaultView;
    if (!view || !element.clientWidth) return;
    element.removeAttribute(marker);
    element.style.removeProperty(variable);
    const baseSize = Number.parseFloat(view.getComputedStyle(element).fontSize);
    if (!Number.isFinite(baseSize)) return;
    element.setAttribute(marker, 'true');
    const resolvedMinimum = Math.min(baseSize, minimumSize);
    let fittedSize = baseSize;
    element.style.setProperty(variable, `${fittedSize}px`);
    while (element.scrollWidth > element.clientWidth + 1 && fittedSize > resolvedMinimum) {
        fittedSize = Math.max(resolvedMinimum, fittedSize - 2);
        element.style.setProperty(variable, `${fittedSize}px`);
    }
}

function fitIdentityToContainer(element) {
    fitTextToContainer(element, {
        minimumSize: 28,
        marker: 'data-builder-identity-fitted',
        variable: '--builder-identity-font-size'
    });
}

function applyIdentity(element, draft, adapter, collisions) {
    if (!element) return;
    remember(element);
    claim(element, 'identity', collisions);
    element.dataset.builderBoundPaths = 'content.identity.primaryName content.identity.secondaryName';
    element.dataset.invitationBind = 'identity';
    const parts = identityParts(draft.content);
    if (!parts.display) {
        if (identityTouched(draft)) {
            element.textContent = '';
            element.hidden = true;
        } else restore(element);
        return;
    }
    element.hidden = false;

    if (adapter.identityMode === 'aloha') {
        restore(element);
        const brand = element.querySelector('span');
        if (!brand) element.textContent = parts.display;
        else {
            while (brand.nextSibling) brand.nextSibling.remove();
            element.append(` ${parts.display}`);
        }
        fitIdentityToContainer(element);
        return;
    }
    if (adapter.identityMode === 'luxury') {
        restore(element);
        const names = element.querySelectorAll('span');
        const separator = element.querySelector('i');
        if (names.length >= 2) {
            names[0].textContent = parts.primary || parts.display;
            names[1].textContent = parts.secondary;
            names[1].hidden = !parts.secondary;
            if (separator) {
                separator.hidden = !parts.secondary;
                if (!parts.secondary) separator.textContent = '';
            }
        } else element.textContent = parts.display;
        fitIdentityToContainer(element);
        return;
    }
    if (adapter.identityMode === 'minimal' && parts.secondary) {
        const separator = element.ownerDocument.createElement('span');
        separator.textContent = '&';
        element.replaceChildren(parts.primary.toUpperCase(), element.ownerDocument.createElement('br'), separator, ` ${parts.secondary.toUpperCase()}`);
        fitIdentityToContainer(element);
        return;
    }
    element.textContent = parts.display;
    fitIdentityToContainer(element);
}

function applyIdentityEchoes(root, adapter, draft, collisions) {
    const parts = identityParts(draft.content);
    (adapter.identityEchoes ?? []).forEach(({ selector, mode }) => {
        const element = safeQuery(root, selector);
        if (!element) return;
        remember(element);
        claim(element, 'identity-echo', collisions);
        element.dataset.builderBoundPaths = 'content.identity.primaryName content.identity.secondaryName';
        if (!parts.display) {
            if (identityTouched(draft)) {
                element.textContent = '';
                element.hidden = true;
            } else restore(element);
            return;
        }
        element.hidden = false;
        if (mode === 'aloha-hashtag') {
            const slug = clean(parts.primary || parts.display).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '');
            element.textContent = `#ALOHA${slug}`;
        } else if (mode === 'uppercase') element.textContent = parts.display.toUpperCase();
        else element.textContent = parts.display;
    });
}

function applyMonogram(root, adapter, draft, collisions) {
    const element = safeQuery(root, adapter.monogram);
    if (!element) return;
    remember(element);
    claim(element, 'identity-monogram', collisions);
    const parts = identityParts(draft.content);
    const initials = [parts.primary, parts.secondary]
        .filter(Boolean)
        .map((part) => part.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase())
        .filter(Boolean)
        .join(' · ');
    if (initials) {
        element.textContent = initials;
        element.hidden = false;
    } else if (identityTouched(draft)) {
        element.textContent = '';
        element.hidden = true;
    } else restore(element);
}

function validDate(value) {
    const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = match ? new Date(`${value}T12:00:00`) : null;
    return date && !Number.isNaN(date.getTime())
        && date.getFullYear() === Number(match[1])
        && date.getMonth() + 1 === Number(match[2])
        && date.getDate() === Number(match[3]) ? date : null;
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

function eventLineTouched(draft) {
    const touched = getTouchedDraftPaths(draft);
    return ['content.schedule.date', 'content.schedule.time', 'content.place.city', 'content.place.state']
        .some((path) => touched.includes(path));
}

function dateParts(content = {}) {
    const date = validDate(content.schedule?.date);
    return {
        day: date ? String(date.getDate()).padStart(2, '0') : '',
        weekday: date ? new Intl.DateTimeFormat('es-MX', { weekday: 'long' }).format(date).toUpperCase() : '',
        month: date ? new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(date).toUpperCase() : '',
        year: date ? String(date.getFullYear()) : '',
        time: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clean(content.schedule?.time)) ? clean(content.schedule.time) : '',
        place: [clean(content.place?.city), clean(content.place?.state)].filter(Boolean).join(', ').toUpperCase()
    };
}

function ensureGeneratedNode(root, descriptor, key, tagName = 'p') {
    if (descriptor.selector) return safeQuery(root, descriptor.selector);
    const existing = safeQuery(root, `[data-builder-generated="${key}"]`);
    if (existing) return existing;
    const anchor = safeQuery(root, descriptor.anchor);
    if (!anchor) return null;
    const element = anchor.ownerDocument.createElement(tagName);
    element.className = `builder-template-${key}`;
    element.dataset.builderGenerated = key;
    anchor.insertAdjacentElement('afterend', element);
    return element;
}

function applyEventLine(root, adapter, draft, collisions) {
    const descriptor = adapter.eventLine;
    const element = ensureGeneratedNode(root, descriptor, 'event-line');
    if (!element) return;
    remember(element);
    claim(element, 'event-line', collisions);
    element.dataset.builderBoundPaths = 'content.schedule.date content.schedule.time content.place.city content.place.state';
    const line = formatInvitationEventLine(draft.content);
    if (!line) {
        if (eventLineTouched(draft) || !descriptor.selector) {
            element.textContent = '';
            element.hidden = true;
        } else restore(element);
        return;
    }
    element.hidden = false;
    const parts = dateParts(draft.content);
    if (descriptor.mode === 'midnight') {
        const day = safeQuery(element, 'strong');
        const month = safeQuery(element, 'p');
        const time = safeQuery(element, 'i');
        if (day && month && time) {
            day.textContent = parts.day;
            month.textContent = [parts.month, parts.year].filter(Boolean).join(' ');
            time.textContent = [parts.time, parts.place].filter(Boolean).join(' · ');
            return;
        }
    }
    if (descriptor.mode === 'vintage') {
        const spans = safeQueryAll(element, ':scope > span');
        const day = safeQuery(element, ':scope > strong');
        if (spans.length >= 2 && day) {
            spans[0].textContent = parts.weekday;
            day.textContent = parts.day;
            spans[1].textContent = [parts.month, parts.year, parts.time, parts.place].filter(Boolean).join(' · ');
            return;
        }
    }
    if (descriptor.mode === 'neon') {
        const day = safeQuery(element, ':scope > strong');
        const month = safeQuery(element, ':scope > p');
        const detail = safeQuery(element, ':scope > span');
        if (day && month && detail) {
            day.textContent = parts.day;
            month.textContent = [parts.month, parts.year].filter(Boolean).join(' ');
            detail.textContent = [parts.time, parts.place].filter(Boolean).join(' · ');
            return;
        }
    }
    element.textContent = line;
}

function sectionPaths(definition) {
    return definition.fields.map(([path]) => path);
}

export function sectionHasRealContent(draft, sectionId) {
    const definition = SECTION_BINDINGS[sectionId];
    if (!definition) return false;
    const touched = new Set(getTouchedDraftPaths(draft));
    return definition.fields.some(([path, role]) => (
        touched.has(path) || (role !== 'runtime' && clean(getDraftValue(draft, path)))
    ));
}

function sourceForRole(root, role, path = '') {
    const label = safeQuery(root, LABEL_SELECTOR);
    const headings = safeQueryAll(root, 'h1,h2,h3,blockquote');
    const paragraphs = safeQueryAll(root, 'p').filter((node) => node !== label && !node.matches(LABEL_SELECTOR));
    if (path === 'content.rsvp.message') return null;
    if (path === 'content.rsvp.title') return safeQuery(root, ':scope > h1,:scope > h2,:scope > h3') ?? headings[0];
    if (path === 'content.rsvp.deadline') {
        return safeQuery(root, ':scope > p:not([class*="label"]):not([class*="kicker"]):not([class*="eyebrow"]):not([class*="script"]):not([class*="postmark"]):not([class*="section-no"])')
            ?? paragraphs[0];
    }
    if (role === 'eyebrow') return label ?? safeQuery(root, 'small');
    if (role === 'title') return headings[0] ?? paragraphs[0];
    if (role === 'meta' || role === 'deadline' || role === 'note') return safeQuery(root, 'small') ?? paragraphs.at(-1);
    return paragraphs[0] ?? safeQuery(root, 'blockquote');
}

function cloneRoleNode(root, role, path) {
    const source = sourceForRole(root, role, path);
    const tagName = role === 'title' ? 'h2' : 'p';
    const node = source?.cloneNode(false) ?? root.ownerDocument.createElement(tagName);
    [...node.attributes].forEach((attribute) => {
        if (attribute.name !== 'class') node.removeAttribute(attribute.name);
    });
    node.classList.add('builder-semantic-field', `builder-semantic-${role}`);
    node.dataset.builderFieldPath = path;
    return node;
}

function belongsToSectionRoot(node, root) {
    return node.parentElement === root
        || node.closest('[data-prestige-feature]') === root
        || (!root.hasAttribute('data-prestige-feature') && root.contains(node));
}

function hideDemoSectionCopy(root, definition) {
    if (definition.replaceDemoChildren) {
        // Access contains live digital/printed pass surfaces rendered later by
        // renderAccessPass(). Keep those nodes mounted; only the semantic copy
        // wrapper should be added for editable access text.
        if (root.matches('[data-access-preview]')) return;
        [...root.children].forEach((child) => {
            child.hidden = true;
            child.dataset.builderDemoContainer = 'hidden';
        });
        return;
    }
    safeQueryAll(root, COPY_CANDIDATE_SELECTOR).forEach((node) => {
        if (!belongsToSectionRoot(node, root)) return;
        if (node.closest('[data-countdown]')) return;
        if (node.matches('[data-demo-action="video-preview"]')) return;
        node.hidden = true;
        node.dataset.builderDemoCopy = 'hidden';
    });
}

function resolveSectionRoot(documentRoot, adapter, definition) {
    const selector = typeof definition.root === 'function' ? definition.root(adapter) : definition.root;
    const candidate = safeQuery(documentRoot, selector);
    if (!candidate?.matches?.('a,button')) return candidate;
    const container = candidate.closest('section') ?? candidate.parentElement;
    if (!container) return candidate;
    const features = new Set(clean(container.dataset.prestigeFeature).split(' ').filter(Boolean));
    const candidateFeatures = clean(candidate.dataset.prestigeFeature).split(' ').filter(Boolean);
    candidateFeatures.forEach((feature) => features.add(feature));
    container.dataset.prestigeFeature = [...features].join(' ');
    return container;
}

function applySectionBinding(documentRoot, adapter, sectionId, definition, draft, collisions) {
    const root = resolveSectionRoot(documentRoot, adapter, definition);
    if (!root || !sectionHasRealContent(draft, sectionId)) return;
    let wrapper = safeQuery(root, `:scope > [data-builder-semantic-section="${sectionId}"]`);
    if (!wrapper) {
        const roleSources = Object.fromEntries(definition.fields.map(([path, role]) => [path, cloneRoleNode(root, role, path)]));
        hideDemoSectionCopy(root, definition);
        wrapper = root.ownerDocument.createElement('div');
        wrapper.className = 'builder-semantic-copy';
        wrapper.dataset.builderSemanticSection = sectionId;
        if (sectionId === 'rsvp') wrapper.dataset.prestigeFeature = 'rsvp';
        definition.fields.forEach(([path, role]) => {
            if (role !== 'runtime' && role !== 'cta') wrapper.append(roleSources[path]);
        });
        const cta = safeQuery(root, definition.ctaSelector);
        if (cta) {
            cta.hidden = false;
            delete cta.dataset.builderDemoCopy;
            delete cta.dataset.builderDemoContainer;
            delete cta.dataset.builderEventSpecificDemo;
            cta.dataset.builderFieldPath = definition.fields.find(([, role]) => role === 'cta')?.[0] ?? '';
            wrapper.append(cta);
        }
        root.prepend(wrapper);
    }

    definition.fields.forEach(([path, role]) => {
        if (role === 'runtime') return;
        const target = role === 'cta'
            ? safeQuery(wrapper, `[data-builder-field-path="${path}"]`)
            : safeQuery(wrapper, `[data-builder-field-path="${path}"]`);
        const transform = role === 'deadline'
            ? (value) => `Confirma antes del ${formatInvitationDate(value) || value}.`
            : null;
        applyField(target, draft, path, collisions, { allowDemoFallback: sectionId === 'rsvp', transform });
        if (target && !target.hidden) fitTextToContainer(target, { minimumSize: role === 'title' ? 24 : 14 });
    });
}

function ensureMusicSection(documentRoot, adapter) {
    if (safeQuery(documentRoot, '[data-prestige-feature~="music"]')) return;
    const section = documentRoot.createElement('section');
    const welcome = safeQuery(documentRoot, adapter.welcome);
    section.className = `${welcome?.className ?? ''} builder-generated-feature`.trim();
    section.dataset.prestigeFeature = 'music';
    const guest = safeQuery(documentRoot, '[data-prestige-feature~="guest-control"]');
    (guest ?? safeQuery(documentRoot, 'footer') ?? documentRoot.body).before(section);
}

function bindAccessIdentity(documentRoot, draft, collisions) {
    const display = identityParts(draft.content).display;
    safeQueryAll(documentRoot, '[data-access-guest]').forEach((element) => {
        remember(element);
        claim(element, 'access-identity', collisions);
        if (display) {
            element.textContent = display;
            element.hidden = false;
        } else if (identityTouched(draft)) {
            element.textContent = '';
            element.hidden = true;
        } else restore(element);
    });
}

function neutralizeEventSpecificDemoCopy(documentRoot) {
    safeQueryAll(documentRoot, COPY_CANDIDATE_SELECTOR).forEach((node) => {
        if (node.dataset.builderBindingOwner || node.querySelector('[data-builder-binding-owner]')) return;
        if (!EVENT_SPECIFIC_COPY.test(clean(node.textContent))) return;
        node.hidden = true;
        node.dataset.builderEventSpecificDemo = 'hidden';
    });
}

export function prepareBuilderTemplate(documentRoot, themeId) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId];
    if (!adapter || !documentRoot?.body) return { prepared: false, themeId };
    documentRoot.body.dataset.builderTemplateMode = 'true';
    ensureMusicSection(documentRoot, adapter);
    const guestControl = safeQuery(documentRoot, '[data-prestige-feature~="guest-control"]');
    if (guestControl) {
        safeQueryAll(guestControl, ':scope > h1,:scope > h2,:scope > h3,:scope > p').forEach((element) => {
            const features = new Set(clean(element.dataset.prestigeFeature).split(' ').filter(Boolean));
            features.add('rsvp');
            element.dataset.prestigeFeature = [...features].join(' ');
        });
    }
    return { prepared: true, themeId };
}

export function applyTemplateContentBindings(documentRoot, themeId, draft = {}) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId];
    if (!adapter || !documentRoot || !draft.content) return { applied: false, themeId, collisions: [] };
    const collisions = [];
    prepareBuilderTemplate(documentRoot, themeId);

    applyIdentity(safeQuery(documentRoot, adapter.identity), draft, adapter, collisions);
    applyIdentityEchoes(documentRoot, adapter, draft, collisions);
    applyMonogram(documentRoot, adapter, draft, collisions);
    (adapter.eventSpecificDecorations ?? []).forEach((selector) => {
        const element = safeQuery(documentRoot, selector);
        if (!element) return;
        element.hidden = true;
        element.dataset.builderEventSpecificDemo = 'hidden';
    });
    adapter.eventType.forEach((selector) => applyField(
        safeQuery(documentRoot, selector), draft, 'content.identity.eventType', collisions
    ));
    applyEventLine(documentRoot, adapter, draft, collisions);
    const phrase = ensureGeneratedNode(documentRoot, adapter.phrase, 'phrase');
    applyField(phrase, draft, 'content.identity.phrase', collisions, {
        allowDemoFallback: Boolean(adapter.phrase.selector) && adapter.phrase.allowDemoFallback !== false
    });

    Object.entries(SECTION_BINDINGS).filter(([sectionId]) => (
        themeId !== 'aloha' || !ALOHA_NATIVE_SECTIONS.has(sectionId)
    )).forEach(([sectionId, definition]) => {
        applySectionBinding(documentRoot, adapter, sectionId, definition, draft, collisions);
    });
    applyPhase3TemplateBindings(documentRoot, adapter, draft);
    applyPhase4MediaBindings(documentRoot, adapter, draft);
    applyPhase5RsvpBindings(documentRoot, adapter, draft);
    bindAccessIdentity(documentRoot, draft, collisions);
    neutralizeEventSpecificDemoCopy(documentRoot);
    return { applied: true, themeId, collisions };
}

export function applyPhase3ContentBindings(documentRoot, themeId, draft = {}) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId] ?? { themeId: 'custom', phase3Variant: 'custom' };
    return applyPhase3TemplateBindings(documentRoot, adapter, draft);
}

export function applyPhase4ContentBindings(documentRoot, themeId, draft = {}) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId] ?? {
        themeId: 'custom',
        media: {
            cover: '[data-custom-media="cover"]',
            gallery: '[data-prestige-feature~="gallery"]',
            video: '[data-prestige-feature~="welcome-video"]',
            music: '[data-prestige-feature~="music"]',
            variant: 'custom'
        }
    };
    return applyPhase4MediaBindings(documentRoot, adapter, draft);
}

export function applyPhase5ContentBindings(documentRoot, themeId, draft = {}) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId] ?? { themeId: 'custom' };
    return applyPhase5RsvpBindings(documentRoot, adapter, draft);
}

export function createTemplateSectionContract(themeId, sections = []) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId];
    return {
        sections: sections.map((section) => ({
            id: section.id,
            previewSelectors: section.id === 'welcome-story'
                ? (adapter?.welcome ? [adapter.welcome] : [])
                : section.id === 'rsvp'
                    ? ['[data-prestige-feature~="rsvp"]']
                    : [...section.previewSelectors]
        })),
        groups: [{
            id: 'guest-experience',
            selector: '[data-prestige-feature~="guest-control"]',
            anyOf: ['rsvp', 'pass-selection', 'access-preview']
        }]
    };
}

export function getPhase2BindingCoverage(themeId) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId];
    if (!adapter) return null;
    const editorPaths = new Set([
        ...GENERAL_INFORMATION_FIELDS.map(({ path }) => path),
        ...Object.values(SECTION_EDITOR_REGISTRY).flatMap(({ fields }) => fields.map(({ path }) => path))
    ]);
    const bindingPaths = new Set([
        ...GENERAL_BINDING_PATHS,
        ...Object.values(SECTION_BINDINGS).flatMap(({ fields }) => fields.map(([path]) => path))
    ]);
    const editable = Object.keys(INVITATION_EDITABLE_FIELDS);
    const paths = Object.fromEntries(editable.map((path) => [
        path,
        editorPaths.has(path) && bindingPaths.has(path) ? 'PASS' : 'NOT_SUPPORTED'
    ]));
    return Object.freeze({
        themeId,
        total: editable.length,
        bound: Object.values(paths).filter((status) => status === 'PASS').length,
        paths: Object.freeze(paths)
    });
}

export function validateTemplateBindingAdapter(documentRoot, themeId) {
    const adapter = TEMPLATE_BINDING_REGISTRY[themeId];
    if (!adapter) return { valid: false, missing: ['adapter'] };
    const required = {
        identity: adapter.identity,
        eventType: adapter.eventType[0],
        welcome: adapter.welcome
    };
    if (adapter.eventLine.selector) required.eventLine = adapter.eventLine.selector;
    else required.eventLineAnchor = adapter.eventLine.anchor;
    const missing = Object.entries(required).filter(([, selector]) => !safeQuery(documentRoot, selector)).map(([key]) => key);
    return { valid: missing.length === 0, missing };
}
