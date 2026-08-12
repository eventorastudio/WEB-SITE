(function () {
  'use strict';

  const DEFAULT_MESSAGES = Object.freeze({
    maps: 'En la invitación real, este botón abrirá la ubicación del evento en Google Maps.',
    rsvp: 'En la invitación real, este botón permitirá confirmar asistencia directamente por WhatsApp.',
    gifts: 'En la invitación real, este botón llevará a la mesa de regalos configurada por los anfitriones.',
    hotel: 'En la invitación real, este botón abrirá la información o reservación del hotel.',
    instagram: 'En la invitación final, este enlace podrá dirigir al perfil o hashtag del evento.',
    calendar: 'En la invitación real, esta opción permitirá guardar el evento en el calendario.',
    transport: 'En la invitación real, esta opción abrirá la información de transporte preparada por los anfitriones.'
  });

  function mount(eventConfig) {
    const config = eventConfig || {};
    const params = new URLSearchParams(window.location.search);
    const guestName = cleanText(params.get('nombre')) || 'Invitado especial';
    const passes = normalizePasses(params.get('pases'));
    const context = { guestName, passes, authorizedPasses: passes, selectedPasses: passes, event: config };

    personalize(config, context);
    setupOpening(config);
    setupCountdown(config.date, document.querySelector('[data-countdown]'));
    setupPassSelection(context);
    setupVideoPreviews();
    setupDemoActions(config, context);
    observeReveals();
  }

  function personalize(config, context) {
    const copy = config.copy || {};
    setText('[data-opening-guest]', resolveCopy(copy.opening, context, `Para ${context.guestName}`));
    setText('[data-guest-message]', resolveCopy(copy.guest, context, `Para ${context.guestName}`));
    const fallbackPasses = context.passes === 1
      ? 'Un lugar reservado especialmente para ti.'
      : `${context.passes} lugares reservados especialmente para ustedes.`;
    setText('[data-pass-message]', resolveCopy(copy.passes, context, fallbackPasses));
  }

  function setupOpening(config) {
    const opening = document.getElementById('opening');
    const invitation = document.getElementById('invitation');
    const openButton = document.getElementById('open-invitation');
    const audio = document.getElementById('event-music');
    const musicButton = document.getElementById('music-control');
    if (!opening || !invitation || !openButton || !audio || !musicButton) return;

    audio.src = config.music || '';
    let playing = false;
    invitation.inert = true;
    invitation.setAttribute('tabindex', '-1');
    openButton.focus({ preventScroll: true });

    opening.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        openButton.focus();
      }
    });

    openButton.addEventListener('click', async () => {
      opening.classList.add('opened');
      document.body.classList.remove('locked');
      document.body.classList.add('invitation-open');
      invitation.setAttribute('aria-hidden', 'false');
      invitation.inert = false;
      musicButton.hidden = false;
      playing = await playAudio(audio);
      syncMusicButton(musicButton, playing);
      window.setTimeout(() => {
        opening.remove();
        invitation.focus({ preventScroll: true });
      }, prefersReducedMotion() ? 0 : 950);
    }, { once: true });

    musicButton.addEventListener('click', async () => {
      if (playing) {
        audio.pause();
        playing = false;
      } else {
        playing = await playAudio(audio);
      }
      syncMusicButton(musicButton, playing);
    });

    window.addEventListener('pagehide', () => {
      audio.pause();
      audio.currentTime = 0;
    }, { once: true });
  }

  function setupDemoActions(config, context) {
    const actions = [...document.querySelectorAll('[data-demo-action]')];
    if (!actions.length) return;
    const notice = createDemoNotice();
    let trigger = null;

    actions.forEach((element) => {
      const action = element.dataset.demoAction;
      const url = resolveLinks(config.links || {}, actionContext(context))[action];
      element.setAttribute('aria-haspopup', config.demoMode === true ? 'dialog' : 'false');
      if (config.demoMode === true) {
        element.setAttribute('href', '#demo-notice');
        element.removeAttribute('target');
        element.removeAttribute('rel');
      } else if (url) {
        element.setAttribute('href', url);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener');
      }
    });

    document.addEventListener('click', (event) => {
      const actionElement = event.target.closest('[data-demo-action]');
      if (!actionElement) return;
      if (config.demoMode !== true) {
        const liveUrl = resolveLinks(config.links || {}, actionContext(context))[actionElement.dataset.demoAction];
        if (liveUrl) actionElement.setAttribute('href', liveUrl);
        return;
      }
      event.preventDefault();
      trigger = actionElement;
      const action = actionElement.dataset.demoAction;
      const configuredMessage = config.messages && config.messages[action];
      openNotice(notice, configuredMessage || DEFAULT_MESSAGES[action] || 'En la invitación real, esta función abrirá la opción configurada por los anfitriones.');
    });

    notice.closeButton.addEventListener('click', close);
    notice.overlay.addEventListener('click', (event) => {
      if (event.target === notice.overlay) close();
    });
    document.addEventListener('keydown', (event) => {
      if (notice.overlay.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        notice.closeButton.focus();
      }
    });

    function close() {
      notice.overlay.classList.remove('is-visible');
      document.body.classList.remove('demo-notice-open');
      window.setTimeout(() => {
        notice.overlay.hidden = true;
        if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
      }, prefersReducedMotion() ? 0 : 220);
    }
  }

  function createDemoNotice() {
    const overlay = document.createElement('div');
    overlay.className = 'demo-notice-overlay';
    overlay.hidden = true;
    overlay.id = 'demo-notice';

    const dialog = document.createElement('section');
    dialog.className = 'demo-notice';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'demo-notice-title');
    dialog.setAttribute('aria-describedby', 'demo-notice-message');

    const mark = document.createElement('span');
    mark.className = 'demo-notice-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '↗';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'demo-notice-eyebrow';
    eyebrow.textContent = 'EVENTORA STUDIO · PRESTIGE';
    const title = document.createElement('h2');
    title.id = 'demo-notice-title';
    title.textContent = 'Vista de demostración · Prestige';
    const message = document.createElement('p');
    message.id = 'demo-notice-message';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'demo-notice-close';
    closeButton.textContent = 'Entendido';
    dialog.append(mark, eyebrow, title, message, closeButton);
    overlay.append(dialog);
    document.body.append(overlay);
    return { overlay, dialog, message, closeButton };
  }

  function openNotice(notice, message) {
    notice.message.textContent = message;
    notice.overlay.hidden = false;
    document.body.classList.add('demo-notice-open');
    window.requestAnimationFrame(() => notice.overlay.classList.add('is-visible'));
    notice.closeButton.focus({ preventScroll: true });
  }

  function resolveLinks(links, context) {
    return Object.fromEntries(Object.entries(links).map(([key, value]) => [
      key,
      typeof value === 'function' ? value(context) : value
    ]));
  }

  function actionContext(context) {
    return {
      ...context,
      passes: context.selectedPasses,
      authorizedPasses: context.authorizedPasses
    };
  }

  function setupPassSelection(context) {
    document.querySelectorAll('[data-pass-selector]').forEach((target) => {
      const label = document.createElement('p');
      label.textContent = context.authorizedPasses === 1
        ? 'Pase personalizado'
        : 'Selecciona cuántos pases utilizarás';
      const options = document.createElement('div');
      options.className = 'prestige-pass-options';
      const summary = document.createElement('span');
      summary.className = 'prestige-pass-summary';
      summary.setAttribute('aria-live', 'polite');

      for (let count = 1; count <= context.authorizedPasses; count += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = String(count);
        button.setAttribute('aria-label', `${count} ${count === 1 ? 'pase' : 'pases'}`);
        button.setAttribute('aria-pressed', String(count === context.selectedPasses));
        button.addEventListener('click', () => {
          context.selectedPasses = count;
          options.querySelectorAll('button').forEach((option) => {
            option.setAttribute('aria-pressed', String(option === button));
          });
          renderSummary();
        });
        options.append(button);
      }

      const renderSummary = () => {
        summary.textContent = context.selectedPasses === 1
          ? 'Confirmarás 1 pase autorizado.'
          : `Confirmarás ${context.selectedPasses} pases autorizados.`;
      };
      renderSummary();
      target.classList.add('prestige-pass-selector');
      target.replaceChildren(label, options, summary);
    });
  }

  function setupVideoPreviews() {
    document.querySelectorAll('[data-demo-video]').forEach((button) => {
      const status = button.parentElement && button.parentElement.querySelector('[data-video-status]');
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        const playing = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(playing));
        button.textContent = playing ? 'Pausar vista previa' : 'Reproducir vista previa';
        if (status) {
          status.textContent = playing
            ? 'Vista previa audiovisual en reproducción.'
            : 'Vista previa audiovisual en pausa.';
        }
        const frame = button.closest('[data-prestige-feature="welcome-video"]');
        if (frame) frame.classList.toggle('is-playing', playing);
      });
    });
  }

  function resolveCopy(value, context, fallback) {
    if (typeof value === 'function') return value(context);
    return typeof value === 'string' ? value : fallback;
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  function cleanText(value) {
    return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function normalizePasses(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 20 ? parsed : 1;
  }

  async function playAudio(audio) {
    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  function syncMusicButton(button, playing) {
    button.setAttribute('aria-label', playing ? 'Pausar música' : 'Reproducir música');
    const label = button.querySelector('.music-label');
    if (label) label.textContent = playing ? (button.dataset.pauseLabel || 'Pausar') : (button.dataset.playLabel || 'Reproducir');
    button.classList.toggle('is-playing', playing);
  }

  function setupCountdown(dateValue, target) {
    if (!target) return;
    const targetTime = new Date(dateValue).getTime();
    const render = () => {
      const distance = Math.max(targetTime - Date.now(), 0);
      if (distance === 0) {
        const message = document.createElement('p');
        message.className = 'countdown-message';
        message.textContent = 'El gran día ha llegado.';
        target.replaceChildren(message);
        return false;
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
      return true;
    };
    if (!render()) return;
    const timer = window.setInterval(() => {
      if (!render()) window.clearInterval(timer);
    }, 1000);
    window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
  }

  function observeReveals() {
    const elements = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
      elements.forEach((element) => element.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    elements.forEach((element) => observer.observe(element));
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  window.EventoraDemo = Object.freeze({ mount });
}());
