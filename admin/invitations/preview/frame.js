import { PREVIEW_MESSAGE_TYPES } from '../core/builder-events.js?v=phase3-logistics-20260813';
import { INVITATION_CONTENT_SCHEMA_VERSION, PREVIEW_SEMANTIC_FALLBACKS } from '../core/content-schema.js?v=phase54a-rsvp-time-20260817';
import { applyPreviewSectionVisibility } from '../core/preview-sections.js?v=phase3-logistics-20260813';
import {
    applyTemplateContentBindings,
    applyPhase3ContentBindings,
    applyPhase4ContentBindings,
    applyPhase5ContentBindings,
    formatInvitationEventLine,
    prepareBuilderTemplate
} from '../core/template-binding-registry.js?v=phase54a-rsvp-time-20260817';
import { PublicInvitationPage } from '../../../invitacion/public-invitation-page.js?v=phase64-personalized-invitation-20260817';
import { applyPublicInvitationPersonalization } from '../../../invitacion/public-invitation-personalization.js?v=phase64-personalized-invitation-20260817';
import { getThemeById } from '../core/theme-registry.js?v=phase86-appearance-20260820';
import { normalizeAppearance } from '../core/appearance-schema.js?v=phase86-appearance-20260820';

const parentOrigin = window.location.origin;
const publicRuntime = document.documentElement.dataset.invitationRuntime === 'public';
let activeThemeLinks = [];
let latestRequestId = 0;
let currentThemeId = null;
let countdownTimer = null;

if (publicRuntime) {
    void startPublicInvitation();
} else {
    window.addEventListener('message', handleParentMessage);
    window.addEventListener('click', interceptNavigation, true);
    postToParent({ type: PREVIEW_MESSAGE_TYPES.SHELL_READY });
}
window.addEventListener('submit', (event) => event.preventDefault(), true);
window.addEventListener('beforeunload', () => {
    window.clearInterval(countdownTimer);
    stopMedia();
});

async function startPublicInvitation() {
    const page = new PublicInvitationPage({
        renderer: renderPublicPayload,
        onUnavailable: () => showPublicUnavailable()
    });
    await page.load(window.location);
}

async function renderPublicPayload(payload) {
    const requestId = ++latestRequestId;
    const validated = validatePayload(payload);
    showLoading(validated.theme.name);
    const rendered = validated.theme.id === 'custom'
        ? await renderCustom(validated, requestId)
        : await renderTemplate(validated, requestId);
    if (!rendered || requestId !== latestRequestId) return;
    currentThemeId = validated.theme.id;
}

async function handleParentMessage(event) {
    if (event.origin !== parentOrigin || event.source !== window.parent) return;
    if (![PREVIEW_MESSAGE_TYPES.RENDER, PREVIEW_MESSAGE_TYPES.UPDATE].includes(event.data?.type)) return;

    const requestId = Number(event.data.requestId) || 0;
    latestRequestId = Math.max(latestRequestId, requestId);

    try {
        const payload = validatePayload(event.data.payload);
        const isUpdate = event.data.type === PREVIEW_MESSAGE_TYPES.UPDATE;
        if (isUpdate) {
            if (payload.theme.id !== currentThemeId) return;
            applyPayload(payload);
        } else if (payload.theme.id === currentThemeId) {
            applyPayload(payload);
        } else {
            currentThemeId = null;
            showLoading(payload.theme.name);
            const rendered = payload.theme.id === 'custom'
                ? await renderCustom(payload, requestId)
                : await renderTemplate(payload, requestId);
            if (!rendered) return;
            currentThemeId = payload.theme.id;
        }
        if (requestId !== latestRequestId) return;
        postToParent({
            type: PREVIEW_MESSAGE_TYPES.RENDERED,
            requestId,
            payload: { themeId: payload.theme.id, themeName: payload.theme.name, update: isUpdate }
        });
    } catch (error) {
        if (requestId !== latestRequestId) return;
        if (event.data?.type === PREVIEW_MESSAGE_TYPES.RENDER) {
            currentThemeId = null;
            showError(error);
        } else {
            console.error('[InvitationBuilder Preview] Actualización de contenido rechazada.', error);
        }
        postToParent({
            type: PREVIEW_MESSAGE_TYPES.ERROR,
            requestId,
            payload: { message: error?.message || 'No fue posible renderizar la colección.' }
        });
    }
}

function validatePayload(payload) {
    if (!payload || !['builder', 'public'].includes(payload.renderMode)) throw new Error('Modo de invitación no válido.');
    if (!payload.theme?.id || !payload.theme?.name) throw new Error('Tema no encontrado.');
    if (payload.theme.id !== 'custom' && !payload.theme.templatePath) throw new Error('La colección no tiene una plantilla disponible.');
    if (!payload.draft?.content || payload.draft.contentSchemaVersion !== INVITATION_CONTENT_SCHEMA_VERSION) throw new Error('Contrato de contenido no válido.');
    if (!payload.draft.media || !Array.isArray(payload.draft.media.gallery)) throw new Error('Contrato multimedia no válido.');
    if (!Array.isArray(payload.enabledSections) || !Array.isArray(payload.sections)) throw new Error('Contrato de secciones no válido.');
    return payload;
}

async function renderTemplate(payload, requestId) {
    const templateUrl = sameOriginUrl(payload.theme.templatePath);
    const response = await fetch(templateUrl, { credentials: 'same-origin', cache: 'no-cache' });
    if (!response.ok) throw new Error(`Preview no disponible (${response.status}).`);
    if (requestId !== latestRequestId) return false;

    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    parsed.querySelectorAll('script').forEach((element) => element.remove());
    sanitizeTemplate(parsed, templateUrl);

    await installThemeStyles(parsed, templateUrl);
    if (requestId !== latestRequestId) return false;
    document.body.className = `${parsed.body.className} builder-preview-rendered${publicRuntime ? ' public-invitation-rendered' : ''}`.trim();
    document.body.innerHTML = parsed.body.innerHTML;
    sanitizeRealInvitationChrome(document);

    const invitation = document.getElementById('invitation');
    if (invitation) {
        invitation.inert = false;
        invitation.removeAttribute('inert');
        invitation.setAttribute('aria-hidden', 'false');
    }
    prepareBuilderTemplate(document, payload.theme.id);
    document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));
    setupOpening(payload);
    applyPayload(payload);
    stopMedia();
    return true;
}

function sanitizeRealInvitationChrome(documentRoot) {
    documentRoot.querySelectorAll('.demo-legend').forEach((legend) => {
        legend.replaceChildren();
        const brand = documentRoot.createElement('strong');
        brand.textContent = 'EVENTORA STUDIO';
        legend.append(brand, documentRoot.createTextNode(' Momentos especiales, diseñados para compartir.'));
    });
    documentRoot.querySelectorAll('.prestige-badge').forEach((badge) => {
        badge.textContent = 'EVENTORA STUDIO';
    });
}

async function renderCustom(payload, requestId) {
    if (requestId !== latestRequestId) return false;
    clearThemeStyles();
    document.body.className = publicRuntime ? 'builder-preview-custom public-invitation-rendered' : 'builder-preview-custom';
    document.body.replaceChildren();

    const card = document.createElement('main');
    card.className = 'custom-preview';
    const content = document.createElement('div');
    content.className = 'custom-preview-content';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'custom-preview-eyebrow';
    eyebrow.textContent = 'TEMA PERSONALIZADO · BASE FLEXIBLE';
    const title = document.createElement('h1');
    title.dataset.customBind = 'identity';
    const date = document.createElement('p');
    date.className = 'custom-preview-date';
    date.dataset.customBind = 'event-line';
    const phrase = document.createElement('p');
    phrase.className = 'custom-preview-phrase';
    phrase.dataset.customBind = 'phrase';
    const note = document.createElement('p');
    note.className = 'custom-preview-note';
    note.textContent = 'La configuración visual avanzada del tema Personalizada se añadirá en una fase posterior.';
    const cover = document.createElement('img');
    cover.className = 'custom-preview-cover';
    cover.dataset.customMedia = 'cover';
    cover.alt = '';
    cover.hidden = true;
    content.append(cover, eyebrow, title, date, phrase, note);
    card.append(content);
    [
        ['location', 'multiple-locations'],
        ['dress-code', 'dress-code'],
        ['itinerary', 'itinerary'],
        ['gift-registry', 'gift-registry'],
        ['gallery', 'gallery'],
        ['welcome-video', 'welcome-video'],
        ['music', 'music'],
        ['rsvp', 'rsvp']
    ].forEach(([sectionId, feature]) => {
        const section = document.createElement('section');
        section.className = 'custom-preview-section';
        section.dataset.customSection = sectionId;
        section.dataset.prestigeFeature = feature;
        card.append(section);
    });
    document.body.append(card);
    applyPayload(payload);
    return true;
}

function applyPayload(payload) {
    syncOpeningData(payload);
    applyAppearance(payload);
    if (payload.theme.id === 'custom') {
        applyCustomContent(payload.draft);
        applyPhase3ContentBindings(document, payload.theme.id, payload.draft);
        applyPhase4ContentBindings(document, payload.theme.id, payload.draft);
        applyPhase5ContentBindings(document, payload.theme.id, payload.draft);
    }
    else applyTemplateContentBindings(document, payload.theme.id, payload.draft);
    applySectionVisibility(payload.sections, payload.enabledSections, payload.sectionGroups);
    if (publicRuntime && payload.personalization) {
        applyPublicInvitationPersonalization(document, payload.personalization, payload.rsvpUrl);
    }
    renderCountdown(payload.draft);
    const title = resolveIdentity(payload.draft.content);
    document.title = publicRuntime
        ? `${title || PREVIEW_SEMANTIC_FALLBACKS.primaryName} · Invitación`
        : `${title || PREVIEW_SEMANTIC_FALLBACKS.primaryName} · Preview Builder`;
}

function setupOpening(payload) {
    const opening = document.getElementById('opening');
    const invitation = document.getElementById('invitation');
    const openButton = document.getElementById('open-invitation');
    const audio = document.getElementById('event-music');
    const musicButton = document.getElementById('music-control');
    if (!opening || !invitation || !openButton) return;
    syncOpeningData(payload);
    if (audio) {
        const source = payload.draft?.media?.music?.previewUrl || payload.draft?.media?.music?.downloadUrl || '';
        if (source) audio.src = source;
    }
    invitation.inert = true;
    invitation.setAttribute('aria-hidden', 'true');
    document.body.classList.add('locked');
    openButton.addEventListener('click', async () => {
        opening.classList.add('opened');
        document.body.classList.remove('locked');
        document.body.classList.add('invitation-open');
        invitation.inert = false;
        invitation.setAttribute('aria-hidden', 'false');
        if (musicButton) musicButton.hidden = false;
        if (audio?.src) {
            try { await audio.play(); } catch { /* El navegador puede requerir otra interacción. */ }
        }
        window.setTimeout(() => opening.remove(), prefersReducedMotion() ? 0 : 950);
    }, { once: true });
    musicButton?.addEventListener('click', async () => {
        if (!audio) return;
        if (audio.paused) {
            try { await audio.play(); } catch { /* Reproducción bloqueada. */ }
        } else audio.pause();
    });
}

function syncOpeningData(payload) {
    const opening = document.getElementById('opening');
    if (!opening) return;
    const displayName = payload.personalization?.displayName
        || [payload.draft?.content?.identity?.primaryName, payload.draft?.content?.identity?.secondaryName].filter(Boolean).join(' & ')
        || 'Invitado especial';
    opening.querySelectorAll('[data-opening-guest]').forEach((element) => { element.textContent = displayName; });
    const date = payload.draft?.content?.schedule?.date;
    if (date) opening.querySelector('.opening-date')?.replaceChildren(document.createTextNode(formatOpeningDate(date)));
}

function formatOpeningDate(value) {
    const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
        .format(parsed).replace('.', '').toUpperCase().replace(/ /g, ' · ');
}

function prefersReducedMotion() {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function applyAppearance(payload) {
    const root = document.documentElement;
    root.style.removeProperty('--demo-accent');
    root.style.removeProperty('--demo-focus');
    const definition = getThemeById(payload.theme?.id)?.appearance?.accentColor;
    const appearance = normalizeAppearance(payload.draft?.appearance);
    if (!definition || !appearance.accentColor) return;
    root.style.setProperty('--demo-accent', appearance.accentColor);
    root.style.setProperty('--demo-focus', appearance.accentColor);
}

function applyCustomContent(draft) {
    const identityValue = resolveIdentity(draft.content);
    const eventLineValue = formatInvitationEventLine(draft.content);
    const identityCleared = ['content.identity.primaryName', 'content.identity.secondaryName'].some((path) => draftPathTouched(draft, path));
    const eventLineCleared = ['content.schedule.date', 'content.schedule.time', 'content.place.city', 'content.place.state']
        .some((path) => draftPathTouched(draft, path));
    const identity = identityValue || (identityCleared ? '' : PREVIEW_SEMANTIC_FALLBACKS.primaryName);
    const eventLine = eventLineValue || (eventLineCleared ? '' : PREVIEW_SEMANTIC_FALLBACKS.eventLine);
    const phrase = cleanText(draft.content.identity?.phrase);
    setText('[data-custom-bind="identity"]', identity);
    setText('[data-custom-bind="event-line"]', eventLine);
    setText('[data-custom-bind="phrase"]', phrase);
    const phraseElement = document.querySelector('[data-custom-bind="phrase"]');
    if (phraseElement) phraseElement.hidden = !phrase;
    const identityElement = document.querySelector('[data-custom-bind="identity"]');
    if (identityElement) identityElement.hidden = !identity;
    const eventLineElement = document.querySelector('[data-custom-bind="event-line"]');
    if (eventLineElement) eventLineElement.hidden = !eventLine;
}

function resolveIdentity(content = {}) {
    const primary = cleanText(content.identity?.primaryName);
    const secondary = cleanText(content.identity?.secondaryName);
    return [primary, secondary].filter(Boolean).join(' & ');
}

function renderCountdown(draft = {}) {
    const content = draft.content ?? {};
    window.clearInterval(countdownTimer);
    countdownTimer = null;
    const targets = [...document.querySelectorAll('[data-countdown]')];
    if (!targets.length) return;
    const date = cleanText(content.schedule?.date);
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cleanText(content.schedule?.time))
        ? cleanText(content.schedule.time)
        : '00:00';
    const targetTime = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T${time}:00`).getTime() : Number.NaN;
    if (!Number.isFinite(targetTime)) return;

    const update = () => {
        const distance = Math.max(targetTime - Date.now(), 0);
        targets.forEach((target) => {
            if (distance === 0) {
                const configured = cleanText(content.countdown?.arrivedMessage);
                const explicitlyCleared = draftPathTouched(draft, 'content.countdown.arrivedMessage');
                if (!configured && explicitlyCleared) {
                    target.replaceChildren();
                    return;
                }
                const message = document.createElement('p');
                message.className = 'countdown-message';
                message.textContent = configured || PREVIEW_SEMANTIC_FALLBACKS.countdownArrived;
                target.replaceChildren(message);
                return;
            }
            const units = [
                ['Días', Math.floor(distance / 86400000)],
                ['Horas', Math.floor(distance / 3600000) % 24],
                ['Minutos', Math.floor(distance / 60000) % 60],
                ['Segundos', Math.floor(distance / 1000) % 60]
            ];
            target.replaceChildren(...units.map(([label, value]) => {
                const item = document.createElement('div');
                const number = document.createElement('strong');
                const caption = document.createElement('span');
                number.textContent = String(value).padStart(2, '0');
                caption.textContent = label;
                item.append(number, caption);
                return item;
            }));
        });
        return distance > 0;
    };
    if (update()) countdownTimer = window.setInterval(update, 1000);
}

function draftPathTouched(draft, path) {
    return Array.isArray(draft?.meta?.touchedPaths) && draft.meta.touchedPaths.includes(path);
}

function sanitizeTemplate(parsed, templateUrl) {
    parsed.querySelectorAll('*').forEach((element) => {
        [...element.attributes].forEach((attribute) => {
            if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
        });

        ['src', 'poster'].forEach((attribute) => {
            const value = element.getAttribute(attribute);
            if (value) element.setAttribute(attribute, sameOriginUrl(value, templateUrl).href);
        });

        if (element.tagName === 'A') {
            const href = element.getAttribute('href');
            if (href && !href.startsWith('#')) element.setAttribute('href', sameOriginUrl(href, templateUrl).href);
            element.removeAttribute('target');
            element.removeAttribute('rel');
        }
    });
}

async function installThemeStyles(parsed, templateUrl) {
    clearThemeStyles();
    const hrefs = [...parsed.querySelectorAll('link[rel="stylesheet"][href]')]
        .map((link) => sameOriginUrl(link.getAttribute('href'), templateUrl).href);

    const pending = [];
    activeThemeLinks = hrefs.map((href) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.builderThemeStyle = 'true';
        pending.push(new Promise((resolve) => {
            const timeout = window.setTimeout(resolve, 1500);
            const settle = () => {
                window.clearTimeout(timeout);
                resolve();
            };
            link.addEventListener('load', settle, { once: true });
            link.addEventListener('error', settle, { once: true });
        }));
        document.head.append(link);
        return link;
    });

    await Promise.all(pending);
}

function clearThemeStyles() {
    activeThemeLinks.forEach((link) => link.remove());
    activeThemeLinks = [];
}

function applySectionVisibility(sections = [], enabledSections = [], groups = []) {
    return applyPreviewSectionVisibility(document, sections, enabledSections, {
        groups,
        onBindingError: ({ sectionId, selector, error }) => {
            console.error(`[InvitationBuilder Preview] Binding inválido en "${sectionId}" (${selector}).`, error);
        }
    });
}

function setText(selector, value) {
    safeQueryAll(selector).forEach((element) => { element.textContent = value; });
}

function safeQueryAll(selector) {
    try { return [...document.querySelectorAll(selector)]; }
    catch { return []; }
}

function interceptNavigation(event) {
    const anchor = event.target.closest?.('a');
    const action = event.target.closest?.('[data-builder-action],[data-demo-action]');
    if (!anchor && !action) return;
    event.preventDefault();
    const href = anchor?.getAttribute('href') || '';
    if (!action && href.startsWith('#') && href.length > 1) {
        document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
        return;
    }
    showBuilderActionNotice(action?.dataset.builderAction || action?.dataset.demoAction || 'external');
}

function showBuilderActionNotice(actionType) {
    document.querySelector('[data-builder-action-notice]')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'builder-action-notice-overlay';
    overlay.dataset.builderActionNotice = 'true';
    const dialog = document.createElement('section');
    dialog.className = 'builder-action-notice';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const eyebrow = document.createElement('span');
    eyebrow.textContent = 'VISTA DEL EDITOR';
    const title = document.createElement('strong');
    title.textContent = 'Acción externa interceptada';
    const messages = {
        maps: 'Este botón abrirá Google Maps en la invitación publicada.',
        waze: 'Este botón abrirá Waze en la invitación publicada.',
        gifts: 'Este botón abrirá la opción de regalo en la invitación publicada.',
        hotel: 'Este botón abrirá la reservación o información del hotel en la invitación publicada.',
        calendar: 'Esta acción agregará los datos centrales del evento al calendario.',
        whatsapp: 'Este botón abrirá WhatsApp con el mensaje configurado cuando la invitación esté publicada.',
        rsvp: 'La confirmación interna se habilitará cuando exista el runtime público RSVP.'
    };
    const message = document.createElement('p');
    message.textContent = messages[actionType] || 'Este enlace se habilitará únicamente en la invitación publicada.';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Continuar editando';
    close.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
    dialog.append(eyebrow, title, message, close);
    overlay.append(dialog);
    document.body.append(overlay);
    close.focus({ preventScroll: true });
}

function stopMedia() {
    document.querySelectorAll('audio, video').forEach((media) => {
        try { media.pause(); } catch { /* El modo Builder nunca depende de reproducción. */ }
    });
}

function sameOriginUrl(value, base = window.location.href) {
    const url = new URL(value, base);
    if (url.origin !== window.location.origin) throw new Error('La preview rechazó un recurso externo.');
    return url;
}

function cleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 1800);
}

function showLoading(themeName) {
    window.clearInterval(countdownTimer);
    document.body.className = 'builder-preview-loading';
    document.body.innerHTML = '<main class="preview-placeholder"><i class="preview-loader" aria-hidden="true"></i><span>EVENTORA STUDIO</span><strong>Cargando colección</strong><p></p></main>';
    document.querySelector('.preview-placeholder p').textContent = publicRuntime
        ? `Preparando ${themeName}…`
        : `Preparando ${themeName} en modo Builder…`;
}

function showError(error) {
    clearThemeStyles();
    window.clearInterval(countdownTimer);
    document.body.className = 'builder-preview-error';
    document.body.innerHTML = '<main class="preview-placeholder"><span>PREVIEW NO DISPONIBLE</span><strong>Error controlado</strong><p></p></main>';
    document.querySelector('.preview-placeholder p').textContent = error?.message || 'No fue posible cargar esta colección.';
}

function showPublicUnavailable() {
    clearThemeStyles();
    window.clearInterval(countdownTimer);
    document.title = 'Invitación no disponible | Eventora Studio';
    document.body.className = 'builder-preview-error public-invitation-unavailable';
    document.body.innerHTML = '<main class="preview-placeholder"><span>EVENTORA STUDIO</span><strong>Invitación no disponible</strong><p>Verifica el enlace o solicita uno nuevo.</p></main>';
}

function postToParent(message) {
    window.parent.postMessage(message, parentOrigin);
}
