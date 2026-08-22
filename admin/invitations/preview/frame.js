import { PREVIEW_MESSAGE_TYPES } from '../core/builder-events.js?v=phase3-logistics-20260813';
import { INVITATION_CONTENT_SCHEMA_VERSION, PREVIEW_SEMANTIC_FALLBACKS } from '../core/content-schema.js?v=phase94-opening-cover-20260821';
import { applyPreviewSectionVisibility } from '../core/preview-sections.js?v=phase3-logistics-20260813';
import {
    applyTemplateContentBindings,
    applyPhase3ContentBindings,
    applyPhase4ContentBindings,
    applyPhase5ContentBindings,
    formatInvitationEventLine,
    prepareBuilderTemplate
} from '../core/template-binding-registry.js?v=phase86-aloha-a2-20260820';
import { PublicInvitationPage } from '../../../invitacion/public-invitation-page.js?v=phase97-public-rsvp-20260821';
import { applyPublicInvitationPersonalization } from '../../../invitacion/public-invitation-personalization.js?v=phase88-qr2-20260820';
import { generateQrCanvas } from '../../modules/qr/qr-renderer.js?v=phase88-qr2-20260820';
import { getThemeById } from '../core/theme-registry.js?v=phase86-appearance-20260820';
import { normalizeAppearance } from '../core/appearance-schema.js?v=phase86-appearance-20260820';
import { entityHasContent } from '../core/logistics-schema.js?v=phase3-logistics-20260813';

const parentOrigin = window.location.origin;
const previewHost = window.parent !== window ? window.parent : window.opener;
const publicRuntime = document.documentElement.dataset.invitationRuntime === 'public';
const embeddedPreview = new URL(window.location.href).searchParams.get('embedded') === '1';
const previewDeviceFrame = !publicRuntime && !embeddedPreview
    ? document.getElementById('preview-device-frame')
    : null;
if (embeddedPreview) document.documentElement.dataset.previewEmbedded = 'true';
let activeThemeLinks = [];
let latestRequestId = 0;
let currentThemeId = null;
let countdownTimer = null;

if (publicRuntime) {
    void startPublicInvitation();
} else if (embeddedPreview) {
    window.addEventListener('message', handleParentMessage);
    window.addEventListener('click', interceptNavigation, true);
    postToParent({ type: PREVIEW_MESSAGE_TYPES.SHELL_READY });
} else {
    setupPreviewShell();
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
    if (event.origin !== parentOrigin || event.source !== previewHost) return;
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

function setupPreviewShell() {
    if (!previewDeviceFrame) return;
    const stage = document.getElementById('preview-stage');
    const viewport = document.getElementById('preview-device-viewport');
    const dimension = document.getElementById('preview-viewport-dimension');
    const tabs = [...document.querySelectorAll('[data-preview-viewport]')];
    const devices = {
        desktop: { label: 'PC', width: 1440, height: 900 },
        tablet: { label: 'TABLET', width: 820, height: 1024 },
        mobile: { label: 'MÃ“VIL', width: 390, height: 844 }
    };
    let childReady = false;
    let queuedMessage = null;
    let currentDevice = 'desktop';

    const resize = (deviceId) => {
        const device = devices[deviceId] || devices.desktop;
        currentDevice = deviceId;
        viewport.dataset.device = deviceId;
        viewport.style.width = `${device.width}px`;
        viewport.style.minHeight = `${device.height}px`;
        previewDeviceFrame.style.width = `${device.width}px`;
        previewDeviceFrame.style.height = `${device.height}px`;
        const availableWidth = Math.max(0, (stage?.clientWidth ?? device.width) - 32);
        const scale = deviceId === 'desktop' && availableWidth < device.width
            ? Math.max(.55, availableWidth / device.width)
            : 1;
        viewport.style.transform = `scale(${scale})`;
        viewport.style.marginBottom = `${Math.max(0, device.height * scale - device.height)}px`;
        if (dimension) dimension.textContent = `${device.label} Â· ${device.width} px`;
        tabs.forEach((tab) => {
            const active = tab.dataset.previewViewport === deviceId;
            tab.setAttribute('aria-selected', String(active));
        });
    };
    const sendToChild = (message) => {
        if (!message || !childReady || !previewDeviceFrame.contentWindow) {
            queuedMessage = message;
            return;
        }
        previewDeviceFrame.contentWindow.postMessage(message, parentOrigin);
    };
    const bridgeMessage = (event) => {
        if (event.origin !== parentOrigin) return;
        if (event.source === previewDeviceFrame.contentWindow) {
            if (event.data?.type === PREVIEW_MESSAGE_TYPES.SHELL_READY) {
                childReady = true;
                postToParent(event.data);
                if (queuedMessage) {
                    const pending = queuedMessage;
                    queuedMessage = null;
                    sendToChild(pending);
                }
            } else if ([PREVIEW_MESSAGE_TYPES.RENDERED, PREVIEW_MESSAGE_TYPES.ERROR].includes(event.data?.type)) {
                postToParent(event.data);
            }
            return;
        }
        if (event.source === previewHost && [PREVIEW_MESSAGE_TYPES.RENDER, PREVIEW_MESSAGE_TYPES.UPDATE].includes(event.data?.type)) {
            sendToChild(event.data);
        }
    };
    tabs.forEach((tab) => tab.addEventListener('click', () => resize(tab.dataset.previewViewport)));
    window.addEventListener('resize', () => resize(currentDevice));
    window.addEventListener('message', bridgeMessage);
    resize('desktop');
    previewDeviceFrame.src = './frame.html?embedded=1';
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
    const renderRoot = embeddedPreview
        ? document.body
        : (document.getElementById('preview-device-viewport') || document.body);
    renderRoot.innerHTML = parsed.body.innerHTML;
    sanitizeRealInvitationChrome(document);

    const invitation = document.getElementById('invitation');
    if (invitation) {
        invitation.inert = false;
        invitation.removeAttribute('inert');
        invitation.setAttribute('aria-hidden', 'false');
    }
    prepareBuilderTemplate(document, payload.theme.id);
    applyPayload(payload);
    setupOpening(payload);
    if (payload.theme.id !== 'aloha') document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));
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
    } else applyTemplateContentBindings(document, payload.theme.id, payload.draft);
    applySectionVisibility(payload.sections, payload.enabledSections, payload.sectionGroups);
    // Aloha sanitization is deliberately last so section visibility cannot
    // re-expose demo content when a section is enabled without real data.
    if (payload.theme.id === 'aloha') {
        sanitizeAlohaRealContent(payload);
        syncOpeningData(payload);
    }
    if (payload.theme.id === 'aloha') setupAlohaInteractions(payload);
    renderAccessPass(payload);
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
    opening.hidden = false;
    openButton.hidden = false;
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
        if (payload.theme.id === 'aloha') setupAlohaReveal(document);
        if (musicButton) musicButton.hidden = false;
        if (audio?.src) {
            try { await audio.play(); } catch { /* El navegador puede requerir otra interacción. */ }
        }
        window.setTimeout(() => opening.remove(), prefersReducedMotion() ? 0 : 950);
    }, { once: true });
    if (payload.theme.id !== 'aloha') {
        musicButton?.addEventListener('click', async () => {
            if (!audio) return;
            if (audio.paused) {
                try { await audio.play(); } catch { /* Reproducción bloqueada. */ }
            } else audio.pause();
        });
        return;
    }
    const syncMusicControl = () => {
        if (!musicButton || !audio) return;
        const playing = !audio.paused && !audio.ended;
        musicButton.setAttribute('aria-pressed', String(playing));
        musicButton.setAttribute('aria-label', playing ? 'Pausar música' : 'Reproducir música');
        const label = musicButton.querySelector('.music-label');
        if (label) label.textContent = playing ? 'Pausar' : 'Reproducir';
    };
    audio?.addEventListener('play', syncMusicControl);
    audio?.addEventListener('pause', syncMusicControl);
    audio?.addEventListener('ended', syncMusicControl);
    syncMusicControl();
    musicButton?.addEventListener('click', async () => {
        if (!audio) return;
        if (audio.paused) {
            try { await audio.play(); } catch { /* Reproducción bloqueada. */ }
        } else audio.pause();
        syncMusicControl();
    });
}

function setupAlohaReveal(documentRoot) {
    const elements = [...documentRoot.querySelectorAll('.reveal')];
    if (!elements.length) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
        elements.forEach((element) => element.classList.add('visible'));
        return;
    }
    if (documentRoot.body.dataset.alohaRevealReady === 'true') return;
    documentRoot.body.dataset.alohaRevealReady = 'true';
    const observer = new IntersectionObserver((entries, instance) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('visible');
            instance.unobserve(entry.target);
        });
    }, { threshold: 0.16 });
    elements.forEach((element) => observer.observe(element));
}

function setupAlohaInteractions(payload) {
    setupAlohaPassTabs(payload);
    setupAlohaVideo();
}

let qrLibraryPromise = null;
function ensureQrLibrary() {
    if (typeof window.qrcode === 'function') return Promise.resolve();
    qrLibraryPromise ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // Resolve from this module, not the document base. Public invitations
        // live under /invitacion/ while the shared QR library lives in /admin/vendor/.
        script.src = new URL('../../vendor/qrcode-generator.js', import.meta.url).toString();
        script.onload = resolve;
        script.onerror = () => reject(new Error('qr/library-unavailable'));
        document.head.append(script);
    });
    return qrLibraryPromise;
}

function renderAccessPass(payload) {
    const access = document.querySelector('[data-access-preview]');
    if (!access) return;
    const config = payload.draft?.content?.access ?? {};
    const personalization = payload.personalization;
    const builderPreview = payload.renderMode === 'builder';
    const hasPersonalizedAccess = builderPreview || Boolean(personalization);
    access.hidden = !hasPersonalizedAccess;
    if (!hasPersonalizedAccess) return;
    const valid = builderPreview || (personalization && personalization.displayName && Number.isInteger(personalization.passLimit));
    const displayName = valid ? (personalization?.displayName || 'Invitado de muestra') : '';
    const passLimit = valid ? (personalization?.passLimit || 2) : 0;
    access.querySelectorAll('[data-access-guest]').forEach((node) => { node.textContent = displayName; });
    access.querySelectorAll('[data-access-passes]').forEach((node) => {
        node.textContent = valid ? `${passLimit} ${config.passesLabel || 'pase(s) asignado(s)'}` : '';
        node.hidden = !valid;
    });
    access.querySelectorAll('[data-pass-selector]').forEach((node) => { node.hidden = true; });
    const qrToken = builderPreview ? 'PREVIEW-QR-NO-OPERATIVO' : personalization?.qrToken;
    access.querySelectorAll('[data-access-view]').forEach((view) => {
        let qrHost = view.querySelector('[data-builder-access-qr]') || view.querySelector('.island-code');
        if (!qrHost) {
            qrHost = document.createElement('div');
            view.append(qrHost);
        }
        qrHost.dataset.builderAccessQr = 'true';
        qrHost.classList.add('builder-access-qr');
        qrHost.hidden = !(valid && config.showQr !== false && qrToken);
        if (!qrHost.hidden && qrHost.dataset.qrRendered !== 'true') {
            qrHost.replaceChildren();
            const label = document.createElement('small');
            label.textContent = builderPreview ? 'QR de vista previa · no operativo' : 'Pase de acceso';
            qrHost.append(label);
            void ensureQrLibrary().then(() => {
                if (qrHost.hidden || qrHost.dataset.qrRendered === 'true') return;
                const canvas = generateQrCanvas(qrToken, { size: 220 });
                canvas.setAttribute('aria-label', 'Código QR de acceso');
                qrHost.append(canvas);
                // Never persist the QR token in a DOM attribute.
                qrHost.dataset.qrRendered = 'true';
            }).catch(() => { qrHost.textContent = 'QR no disponible'; });
        }
    });
    const printEnabled = valid && config.showPrintPass !== false;
    const printButton = ensureAccessPrintButton(access, config, printEnabled);
    printButton?.replaceWith(printButton.cloneNode(true));
    const currentPrintButton = access.querySelector('[data-access-print]');
    currentPrintButton?.addEventListener('click', () => openPrintablePass(payload, config));

    let optionsNote = access.querySelector('[data-access-options-note]');
    if (!optionsNote && (config.showQr !== false || config.showPrintPass !== false)) {
        optionsNote = document.createElement('p');
        optionsNote.dataset.accessOptionsNote = 'true';
        optionsNote.className = 'access-options-note';
        access.append(optionsNote);
    }
    if (optionsNote) {
        optionsNote.hidden = !printEnabled && !(valid && config.showQr !== false && qrToken);
        optionsNote.textContent = config.showQr !== false && config.showPrintPass !== false
            ? 'Puedes presentar este cÃ³digo QR desde tu celular o imprimir tu pase fÃ­sico.'
            : config.showQr !== false
                ? 'Presenta este cÃ³digo QR desde tu celular al llegar.'
                : 'Imprime tu pase y llÃ©valo contigo el dÃ­a del evento.';
    }
}

function ensureAccessPrintButton(access, config, visible) {
    let button = access.querySelector('[data-access-print]');
    if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.accessPrint = 'true';
        button.textContent = config.printButtonLabel || 'Imprimir pase';
        access.append(button);
    }
    button.hidden = !visible;
    button.textContent = config.printButtonLabel || 'Imprimir pase';
    return button;
}

function openPrintablePass(payload, config) {
    if (payload.renderMode !== 'public') return;
    const personalization = payload.personalization;
    if (!personalization?.qrToken) return;
    let sheet = document.getElementById('builder-print-pass');
    if (!sheet) { sheet = document.createElement('section'); sheet.id = 'builder-print-pass'; document.body.append(sheet); }
    sheet.replaceChildren();
    sheet.className = 'access-print-ticket';
    const header = document.createElement('header');
    const badge = document.createElement('small'); badge.textContent = config.label || 'PASE DE ACCESO';
    const title = document.createElement('h1'); title.textContent = config.printTitle || 'Pase de acceso';
    const subtitle = document.createElement('p'); subtitle.textContent = config.description || 'Presenta este pase al llegar.';
    header.append(badge, title, subtitle);
    const body = document.createElement('div'); body.className = 'access-print-ticket-body';
    const guestBlock = document.createElement('div'); guestBlock.className = 'access-print-ticket-guest';
    const guestLabel = document.createElement('small'); guestLabel.textContent = config.guestLabel || 'INVITADO';
    const guest = document.createElement('h2'); guest.textContent = personalization.displayName;
    const passes = document.createElement('p'); passes.textContent = `${personalization.passLimit} ${config.passesLabel || 'pase(s) asignado(s)'}`;
    const qr = generateQrCanvas(personalization.qrToken, { size: 420 });
    qr.className = 'access-print-ticket-qr';
    guestBlock.append(guestLabel, guest, passes);
    body.append(guestBlock, qr);
    const footer = document.createElement('footer'); footer.textContent = config.printFooter || 'Presenta este pase al llegar.';
    sheet.append(header, body, footer);
    document.body.dataset.printPass = 'true';
    window.addEventListener('afterprint', () => { delete document.body.dataset.printPass; sheet.replaceChildren(); }, { once: true });
    window.print();
}

function setupAlohaPassTabs(payload) {
    const access = document.querySelector('[data-access-preview]');
    if (!access || access.dataset.alohaTabsReady === 'true') return;
    const buttons = [...access.querySelectorAll('[data-access-mode]')];
    const views = [...access.querySelectorAll('[data-access-view]')];
    if (buttons.length < 2 || views.length < 2) return;
    access.dataset.alohaTabsReady = 'true';
    const activate = (mode) => {
        buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.accessMode === mode)));
        views.forEach((view) => { view.hidden = view.dataset.accessView !== mode; });
    };
    buttons.forEach((button) => button.addEventListener('click', () => activate(button.dataset.accessMode)));
    activate(buttons.find((button) => button.getAttribute('aria-pressed') === 'true')?.dataset.accessMode || 'digital');
    void payload;
}

function setupAlohaVideo() {
    const root = document.querySelector('[data-prestige-feature~="welcome-video"]');
    const trigger = root?.querySelector('[data-demo-video]');
    if (!root || !trigger || trigger.dataset.alohaVideoReady === 'true') return;
    trigger.dataset.alohaVideoReady = 'true';
    trigger.addEventListener('click', async () => {
        const video = root.querySelector('video[data-builder-phase4], video');
        if (!video) return;
        if (video.paused) {
            try { await video.play(); } catch { /* El navegador puede requerir interacción adicional. */ }
            trigger.setAttribute('aria-pressed', 'true');
            trigger.textContent = 'Pausar video';
        } else {
            video.pause();
            trigger.setAttribute('aria-pressed', 'false');
            trigger.textContent = 'Reproducir video';
        }
        video.addEventListener('ended', () => {
            trigger.setAttribute('aria-pressed', 'false');
            trigger.textContent = 'Reproducir video';
        }, { once: true });
    });
}

function syncOpeningData(payload) {
    const opening = document.getElementById('opening');
    if (!opening) return;
    const identity = payload.draft?.content?.identity ?? {};
    const schedule = payload.draft?.content?.schedule ?? {};
    const config = payload.draft?.content?.welcome?.opening ?? {};
    const canonicalName = [identity.primaryName, identity.secondaryName].filter(Boolean).join(' & ');
    const displayName = payload.personalization?.displayName || canonicalName || 'Invitado especial';
    opening.querySelectorAll('[data-opening-guest]').forEach((element) => { element.textContent = displayName; });
    if (payload.theme?.id !== 'aloha') {
        const date = schedule.date;
        if (date) opening.querySelector('.opening-date')?.replaceChildren(document.createTextNode(formatOpeningDate(date)));
        return;
    }
    const title = opening.querySelector('#opening-title');
    const openingTitle = config.title || 'ALOHA';
    const openingName = config.name || canonicalName;
    if (title) {
        title.replaceChildren(document.createTextNode(openingTitle));
        if (openingName) {
            title.append(document.createElement('br'));
            const name = document.createElement('span');
            name.textContent = openingName;
            title.append(name);
        }
    }
    const label = opening.querySelector('.prestige-badge');
    if (label) {
        label.textContent = config.label || '';
        label.hidden = !config.label;
    }
    const kicker = opening.querySelector('.opening-kicker');
    if (kicker) {
        kicker.textContent = config.kicker || '';
        kicker.hidden = config.showKicker === false || !config.kicker;
    }
    const visibleDate = config.date || schedule.date;
    const dateElement = opening.querySelector('.opening-date');
    if (dateElement) {
        dateElement.textContent = visibleDate ? formatOpeningDate(visibleDate) : '';
        dateElement.hidden = !visibleDate;
    }
    const stamp = opening.querySelector('.postcard-stamp');
    const stampLine1 = config.stampLine1 || identity.eventType || '';
    const stampLine2 = config.stampLine2 || String(visibleDate || '').match(/^(\d{4})/)?.[1] || '';
    if (stamp) {
        stamp.replaceChildren();
        if (stampLine1) stamp.append(document.createTextNode(stampLine1));
        if (stampLine1 && stampLine2) stamp.append(document.createElement('br'));
        if (stampLine2) stamp.append(document.createTextNode(stampLine2));
        stamp.hidden = config.showStamp === false || !(stampLine1 || stampLine2);
    }
    let secondary = opening.querySelector('.opening-secondary');
    if (!secondary) {
        secondary = document.createElement('p');
        secondary.className = 'opening-guest opening-secondary';
        opening.querySelector('[data-opening-guest]')?.before(secondary);
    }
    secondary.textContent = config.secondary || '';
    secondary.hidden = config.showSecondary === false || !config.secondary;
    const button = opening.querySelector('#open-invitation');
    if (button) button.textContent = config.buttonLabel || 'Abrir invitación';
    const footer = opening.querySelector('.resort-card > small');
    if (footer) {
        footer.textContent = config.footer || '';
        footer.hidden = config.showFooter === false || !config.footer;
    }
}

function sanitizeAlohaRealContent(payload) {
    const draft = payload.draft ?? {};
    const content = draft.content ?? {};
    const hasIdentity = Boolean(content.identity?.primaryName || content.identity?.secondaryName);
    const hasDate = Boolean(content.schedule?.date);
    const hasLocations = meaningfulAlohaEntities(draft.locations);
    const hasAccommodations = meaningfulAlohaEntities(draft.accommodations);
    const hasLinks = meaningfulAlohaEntities(draft.links);
    const hasLogistics = hasLocations || hasAccommodations || hasLinks;
    const hasItinerary = meaningfulAlohaEntities(draft.itinerary);
    const hasGifts = meaningfulAlohaEntities(draft.gifts);
    const hasGallery = Array.isArray(draft.media?.gallery) && draft.media.gallery.some((asset) => asset?.downloadUrl || asset?.previewUrl);
    const hasVideo = Boolean(draft.media?.video?.downloadUrl || draft.media?.video?.previewUrl);
    const hasCover = Boolean(draft.media?.cover?.downloadUrl || draft.media?.cover?.previewUrl);
    const hasDressCode = ['title', 'name', 'description', 'note'].some((key) => content.dressCode?.[key])
        || Boolean(content.dressCode?.recommendedColors?.length || content.dressCode?.avoidedColors?.length);

    if (!hasIdentity) {
        const heroIdentity = document.querySelector('.hero-copy h2');
        if (heroIdentity) {
            const brand = heroIdentity.querySelector('span');
            heroIdentity.replaceChildren(brand || document.createTextNode('ALOHA'));
            if (brand) brand.textContent = 'ALOHA';
        }
        document.querySelector('.social-strip strong')?.replaceChildren();
    }
    if (!hasDate) {
        document.querySelector('.hero-copy .hero-date')?.setAttribute('hidden', 'true');
    }
    if (!hasCover) document.querySelector('.hero > img.demo-photo')?.setAttribute('hidden', 'true');
    if (!hasLogistics) document.querySelector('[data-prestige-feature~="multiple-locations"]')?.setAttribute('hidden', 'true');
    if (!hasItinerary) document.querySelector('[data-prestige-feature~="itinerary"]')?.setAttribute('hidden', 'true');
    if (!hasGifts) document.querySelector('[data-prestige-feature~="gift-registry"]')?.setAttribute('hidden', 'true');
    if (!hasGallery) document.querySelector('[data-prestige-feature~="gallery"]')?.setAttribute('hidden', 'true');
    if (!hasVideo) document.querySelector('[data-prestige-feature~="welcome-video"]')?.setAttribute('hidden', 'true');
    if (!hasDressCode) document.querySelector('[data-prestige-feature~="dress-code"]')?.setAttribute('hidden', 'true');
    const staticDeadline = [...document.querySelectorAll('.rsvp p')]
        .find((element) => /confirma antes del 20 de mayo/i.test(element.textContent ?? ''));
    if (!content.rsvp?.deadline) staticDeadline?.setAttribute('hidden', 'true');
    const ticket = document.querySelector('.guest-ticket');
    const personalization = payload.personalization;
    const hasValidPersonalization = personalization
        && Number.isInteger(personalization.passLimit)
        && personalization.passLimit > 0;
    if (ticket && hasValidPersonalization) {
        ticket.hidden = false;
        ticket.querySelector('[data-guest-message]')?.replaceChildren(document.createTextNode(`Para ${personalization.displayName}`));
        const passMessage = `${personalization.passLimit} pase${personalization.passLimit === 1 ? '' : 's'} reservado${personalization.passLimit === 1 ? '' : 's'} para ti.`;
        ticket.querySelector('[data-pass-message]')?.replaceChildren(document.createTextNode(passMessage));
        document.querySelectorAll('[data-access-passes]').forEach((element) => {
            element.textContent = passMessage;
            element.hidden = false;
        });
        document.querySelectorAll('[data-access-guest]').forEach((element) => {
            element.textContent = personalization.displayName || '';
        });
    } else if (ticket) ticket.hidden = true;
    if (!hasValidPersonalization) {
        document.querySelectorAll('[data-access-passes]').forEach((element) => {
            element.textContent = '';
            element.hidden = true;
        });
        document.querySelectorAll('[data-access-guest]').forEach((element) => { element.textContent = ''; });
    }

    if (hasVideo) {
        const videoRoot = document.querySelector('[data-prestige-feature~="welcome-video"]');
        videoRoot?.querySelectorAll('p, [data-video-status]').forEach((element) => {
            if (element.hasAttribute('data-builder-field-path')) return;
            if (/demostraci[oó]n|vista previa|esta escena muestra|integrarse un video|paquete contratado|funcionalidades disponibles/i.test(element.textContent ?? '')) {
                element.hidden = true;
            }
        });
    }
}

function meaningfulAlohaEntities(items) {
    return Array.isArray(items) && items.some((item) => entityHasContent(item));
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
    previewHost?.postMessage(message, parentOrigin);
}
