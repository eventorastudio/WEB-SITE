import { PREVIEW_MESSAGE_TYPES } from '../core/builder-events.js?v=phase2-content-20260813';
import { PREVIEW_SEMANTIC_FALLBACKS } from '../core/content-schema.js?v=phase2-content-20260813';
import { applyPreviewSectionVisibility } from '../core/preview-sections.js?v=phase2-content-20260813';
import {
    applyTemplateContentBindings,
    formatInvitationEventLine
} from '../core/template-binding-registry.js?v=phase2-content-20260813';

const parentOrigin = window.location.origin;
let activeThemeLinks = [];
let latestRequestId = 0;
let currentThemeId = null;
let countdownTimer = null;

window.addEventListener('message', handleParentMessage);
window.addEventListener('click', interceptNavigation, true);
window.addEventListener('submit', (event) => event.preventDefault(), true);
window.addEventListener('beforeunload', () => {
    window.clearInterval(countdownTimer);
    stopMedia();
});

postToParent({ type: PREVIEW_MESSAGE_TYPES.SHELL_READY });

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
    if (!payload || payload.renderMode !== 'builder') throw new Error('Modo de preview no válido.');
    if (!payload.theme?.id || !payload.theme?.name) throw new Error('Tema no encontrado.');
    if (payload.theme.id !== 'custom' && !payload.theme.templatePath) throw new Error('La colección no tiene una plantilla disponible.');
    if (!payload.draft?.content || payload.draft.contentSchemaVersion !== 1) throw new Error('Contrato de contenido no válido.');
    if (!Array.isArray(payload.enabledSections) || !Array.isArray(payload.sections)) throw new Error('Contrato de secciones no válido.');
    return payload;
}

async function renderTemplate(payload, requestId) {
    const templateUrl = sameOriginUrl(payload.theme.templatePath);
    const response = await fetch(templateUrl, { credentials: 'same-origin', cache: 'no-cache' });
    if (!response.ok) throw new Error(`Preview no disponible (${response.status}).`);
    if (requestId !== latestRequestId) return false;

    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    parsed.querySelectorAll('script, audio, #event-music, #music-control, #opening').forEach((element) => element.remove());
    sanitizeTemplate(parsed, templateUrl);

    await installThemeStyles(parsed, templateUrl);
    if (requestId !== latestRequestId) return false;
    document.body.className = `${parsed.body.className.replace(/\blocked\b/g, '')} invitation-open builder-preview-rendered`.trim();
    document.body.innerHTML = parsed.body.innerHTML;

    const invitation = document.getElementById('invitation');
    if (invitation) {
        invitation.inert = false;
        invitation.removeAttribute('inert');
        invitation.setAttribute('aria-hidden', 'false');
    }
    document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));
    applyPayload(payload);
    stopMedia();
    return true;
}

async function renderCustom(payload, requestId) {
    if (requestId !== latestRequestId) return false;
    clearThemeStyles();
    document.body.className = 'builder-preview-custom';
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
    content.append(eyebrow, title, date, phrase, note);
    card.append(content);
    document.body.append(card);
    applyPayload(payload);
    return true;
}

function applyPayload(payload) {
    if (payload.theme.id === 'custom') applyCustomContent(payload.draft);
    else applyTemplateContentBindings(document, payload.theme.id, payload.draft);
    applySectionVisibility(payload.sections, payload.enabledSections, payload.sectionGroups);
    renderCountdown(payload.draft.content);
    const title = resolveIdentity(payload.draft.content);
    document.title = `${title || PREVIEW_SEMANTIC_FALLBACKS.primaryName} · Preview Builder`;
}

function applyCustomContent(draft) {
    const identity = resolveIdentity(draft.content) || PREVIEW_SEMANTIC_FALLBACKS.primaryName;
    const eventLine = formatInvitationEventLine(draft.content) || PREVIEW_SEMANTIC_FALLBACKS.eventLine;
    const phrase = cleanText(draft.content.identity?.phrase);
    setText('[data-custom-bind="identity"]', identity);
    setText('[data-custom-bind="event-line"]', eventLine);
    setText('[data-custom-bind="phrase"]', phrase);
    const phraseElement = document.querySelector('[data-custom-bind="phrase"]');
    if (phraseElement) phraseElement.hidden = !phrase;
}

function resolveIdentity(content = {}) {
    const primary = cleanText(content.identity?.primaryName);
    const secondary = cleanText(content.identity?.secondaryName);
    return [primary, secondary].filter(Boolean).join(' & ');
}

function renderCountdown(content = {}) {
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
                const message = document.createElement('p');
                message.className = 'countdown-message';
                message.textContent = cleanText(content.countdown?.arrivedMessage) || PREVIEW_SEMANTIC_FALLBACKS.countdownArrived;
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
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#') && href.length > 1) document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
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
    document.querySelector('.preview-placeholder p').textContent = `Preparando ${themeName} en modo Builder…`;
}

function showError(error) {
    clearThemeStyles();
    window.clearInterval(countdownTimer);
    document.body.className = 'builder-preview-error';
    document.body.innerHTML = '<main class="preview-placeholder"><span>PREVIEW NO DISPONIBLE</span><strong>Error controlado</strong><p></p></main>';
    document.querySelector('.preview-placeholder p').textContent = error?.message || 'No fue posible cargar esta colección.';
}

function postToParent(message) {
    window.parent.postMessage(message, parentOrigin);
}
