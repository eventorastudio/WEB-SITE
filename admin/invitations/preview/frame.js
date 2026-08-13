import { PREVIEW_MESSAGE_TYPES } from '../core/builder-events.js';
import { applyPreviewSectionVisibility } from '../core/preview-sections.js';

const parentOrigin = window.location.origin;
let activeThemeLinks = [];
let latestRequestId = 0;
let currentThemeId = null;

window.addEventListener('message', handleParentMessage);
window.addEventListener('click', interceptNavigation, true);
window.addEventListener('submit', (event) => event.preventDefault(), true);
window.addEventListener('beforeunload', stopMedia);

postToParent({ type: PREVIEW_MESSAGE_TYPES.SHELL_READY });

async function handleParentMessage(event) {
    if (event.origin !== parentOrigin || event.source !== window.parent) return;
    if (event.data?.type !== PREVIEW_MESSAGE_TYPES.RENDER) return;

    const requestId = Number(event.data.requestId) || 0;
    latestRequestId = Math.max(latestRequestId, requestId);

    try {
        const payload = validatePayload(event.data.payload);
        if (payload.theme.id === currentThemeId) {
            applyContent(payload.theme.previewBindings, payload.content);
            applySectionVisibility(payload.sections, payload.enabledSections);
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
            payload: { themeId: payload.theme.id, themeName: payload.theme.name }
        });
    } catch (error) {
        if (requestId !== latestRequestId) return;
        currentThemeId = null;
        showError(error);
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

    applyContent(payload.theme.previewBindings, payload.content);
    applySectionVisibility(payload.sections, payload.enabledSections);
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
    title.textContent = safeText(payload.content?.title, 'Tu evento');
    const date = document.createElement('p');
    date.className = 'custom-preview-date';
    date.textContent = formatEventLine(payload.content);
    const note = document.createElement('p');
    note.className = 'custom-preview-note';
    note.textContent = 'La configuración visual avanzada del tema Personalizada se añadirá en una fase posterior.';
    content.append(eyebrow, title, date, note);
    card.append(content);
    document.body.append(card);
    return true;
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

function applyContent(bindings = {}, content = {}) {
    setText(bindings.name, safeText(content.title, 'Evento sin título'));
    setText(bindings.date, formatEventLine(content));
    document.title = `${safeText(content.title, 'Evento')} · Preview Builder`;
}

function applySectionVisibility(sections = [], enabledSections = []) {
    return applyPreviewSectionVisibility(document, sections, enabledSections, {
        onBindingError: ({ sectionId, selector, error }) => {
            console.error(`[InvitationBuilder Preview] Binding inválido en "${sectionId}" (${selector}).`, error);
        }
    });
}

function setText(selector, value) {
    if (!selector) return;
    safeQueryAll(selector).forEach((element) => { element.textContent = value; });
}

function safeQueryAll(selector) {
    try { return [...document.querySelectorAll(selector)]; }
    catch { return []; }
}

function formatEventLine(content = {}) {
    const parts = [];
    const dateValue = String(content.date ?? '');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? new Date(`${dateValue}T12:00:00`) : null;
    if (date && !Number.isNaN(date.getTime())) {
        parts.push(new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }).format(date));
    } else {
        parts.push('Fecha por definir');
    }
    if (content.time) parts.push(String(content.time));
    if (content.city) parts.push(safeText(content.city));
    return parts.join(' · ').toUpperCase();
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

function safeText(value, fallback = '') {
    const result = String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
    return result || fallback;
}

function showLoading(themeName) {
    document.body.className = 'builder-preview-loading';
    document.body.innerHTML = '<main class="preview-placeholder"><i class="preview-loader" aria-hidden="true"></i><span>EVENTORA STUDIO</span><strong>Cargando colección</strong><p></p></main>';
    document.querySelector('.preview-placeholder p').textContent = `Preparando ${themeName} en modo Builder…`;
}

function showError(error) {
    clearThemeStyles();
    document.body.className = 'builder-preview-error';
    document.body.innerHTML = '<main class="preview-placeholder"><span>PREVIEW NO DISPONIBLE</span><strong>Error controlado</strong><p></p></main>';
    document.querySelector('.preview-placeholder p').textContent = error?.message || 'No fue posible cargar esta colección.';
}

function postToParent(message) {
    window.parent.postMessage(message, parentOrigin);
}
