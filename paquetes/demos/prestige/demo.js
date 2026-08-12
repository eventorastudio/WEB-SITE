const EVENT_CONFIG = Object.freeze({
  demoMode: true,
  guest: Object.freeze({ defaultName: 'Invitado especial', defaultPasses: 1 }),
  event: Object.freeze({
    title: 'la boda de María y Fernando',
    date: '2027-10-18T17:00:00-06:00',
    time: '17:00'
  }),
  locations: Object.freeze([
    Object.freeze({ type: 'ceremony', name: 'Templo de San Francisco', city: 'Saltillo' }),
    Object.freeze({ type: 'reception', name: 'Casa Madero', city: 'Parras' }),
    Object.freeze({ type: 'after-party', name: 'Terraza de la Viña', city: 'Parras' })
  ]),
  music: '../../../principal/demos/xv-renatta/musica.mp3',
  links: Object.freeze({
    maps: 'https://www.google.com/maps/search/?api=1&query=Parras+Coahuila',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Maria+y+Fernando',
    gifts: 'https://www.amazon.com.mx/',
    contact: 'https://wa.me/5215638830691?text=Hola,%20me%20interesa%20el%20Paquete%20Prestige.'
  })
});

(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const guestName = cleanText(params.get('nombre')) || EVENT_CONFIG.guest.defaultName;
  const authorizedPasses = normalizePasses(params.get('pases'), EVENT_CONFIG.guest.defaultPasses);
  const state = { guestName, authorizedPasses, selectedPasses: authorizedPasses, musicPlaying: false };
  const invitation = document.getElementById('invitation');
  const opening = document.getElementById('opening');
  const openButton = document.getElementById('open-invitation');
  const music = document.getElementById('event-music');
  const musicButton = document.getElementById('music-control');
  const floatingNav = document.getElementById('floating-nav');

  personalize();
  setupOpening();
  setupMusic();
  setupCountdown();
  setupVideo();
  setupPassSelector();
  setupAccessPreview();
  setupRsvp();
  setupDemoMode();
  setupScrollEffects();
  setupReveals();

  function personalize() {
    setText('[data-opening-guest]', `Una edición reservada para ${guestName}.`);
    setText('[data-guest-message]', `${guestName}, esta experiencia fue preparada especialmente para ti.`);
    setText('[data-pass-message]', authorizedPasses === 1 ? 'Un acceso personalizado.' : `${authorizedPasses} accesos personalizados.`);
    setText('[data-access-guest]', guestName);
    setText('[data-access-passes]', authorizedPasses === 1 ? '1 pase personalizado' : `${authorizedPasses} pases personalizados`);
  }

  function setupOpening() {
    invitation.inert = true;
    invitation.setAttribute('tabindex', '-1');
    openButton.focus({ preventScroll: true });
    opening.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      openButton.focus();
    });
    openButton.addEventListener('click', async () => {
      opening.classList.add('opened');
      document.body.classList.remove('locked');
      invitation.inert = false;
      invitation.setAttribute('aria-hidden', 'false');
      floatingNav.hidden = false;
      musicButton.hidden = false;
      state.musicPlaying = await playAudio();
      syncMusicButton();
      window.setTimeout(() => {
        opening.remove();
        invitation.focus({ preventScroll: true });
      }, reducedMotion() ? 0 : 950);
    }, { once: true });
  }

  function setupMusic() {
    music.src = EVENT_CONFIG.music;
    musicButton.addEventListener('click', async () => {
      if (state.musicPlaying) {
        music.pause();
        state.musicPlaying = false;
      } else {
        state.musicPlaying = await playAudio();
      }
      syncMusicButton();
    });
    window.addEventListener('pagehide', () => {
      music.pause();
      music.currentTime = 0;
    }, { once: true });
  }

  async function playAudio() {
    try {
      await music.play();
      return true;
    } catch {
      return false;
    }
  }

  function syncMusicButton() {
    musicButton.classList.toggle('is-playing', state.musicPlaying);
    musicButton.setAttribute('aria-label', state.musicPlaying ? 'Pausar música' : 'Reproducir música');
    musicButton.querySelector('.music-label').textContent = state.musicPlaying ? 'Pausar' : 'Reproducir';
  }

  function setupCountdown() {
    const target = document.querySelector('[data-countdown]');
    const targetTime = new Date(EVENT_CONFIG.event.date).getTime();
    const render = () => {
      const distance = Math.max(targetTime - Date.now(), 0);
      if (!distance) {
        target.textContent = 'El gran día ha llegado.';
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
    const timer = window.setInterval(() => { if (!render()) window.clearInterval(timer); }, 1000);
    window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
  }

  function setupVideo() {
    const button = document.getElementById('video-control');
    const status = document.getElementById('video-status');
    const section = button.closest('.film');
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const playing = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(playing));
      button.textContent = playing ? 'Pausar vista previa' : 'Reproducir vista previa';
      status.textContent = playing ? 'Vista previa audiovisual en reproducción.' : 'Vista previa audiovisual en pausa.';
      section.classList.toggle('is-playing', playing);
    });
  }

  function setupPassSelector() {
    const target = document.querySelector('[data-pass-selector]');
    const label = document.createElement('p');
    label.textContent = authorizedPasses === 1 ? 'Pase personalizado' : 'Selecciona cuántos pases utilizarás';
    const options = document.createElement('div');
    options.className = 'pass-options';
    const summary = document.createElement('span');
    summary.setAttribute('aria-live', 'polite');
    for (let count = 1; count <= authorizedPasses; count += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(count);
      button.setAttribute('aria-label', `${count} ${count === 1 ? 'pase' : 'pases'}`);
      button.setAttribute('aria-pressed', String(count === state.selectedPasses));
      button.addEventListener('click', () => {
        state.selectedPasses = count;
        options.querySelectorAll('button').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
        updateSummary();
      });
      options.append(button);
    }
    const updateSummary = () => {
      summary.textContent = state.selectedPasses === 1 ? 'Confirmarás 1 pase autorizado.' : `Confirmarás ${state.selectedPasses} pases autorizados.`;
    };
    updateSummary();
    target.replaceChildren(label, options, summary);
  }

  function setupAccessPreview() {
    const preview = document.querySelector('[data-access-preview]');
    const buttons = [...preview.querySelectorAll('[data-access-mode]')];
    const views = [...preview.querySelectorAll('[data-access-view]')];
    buttons.forEach((button) => button.addEventListener('click', () => {
      buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      views.forEach((view) => { view.hidden = view.dataset.accessView !== button.dataset.accessMode; });
    }));
  }

  function setupRsvp() {
    const status = document.getElementById('rsvp-status');
    document.getElementById('confirm-rsvp').addEventListener('click', () => {
      status.textContent = state.selectedPasses === 1
        ? 'Vista demo: confirmarías 1 pase. En la invitación real se registraría para los anfitriones.'
        : `Vista demo: confirmarías ${state.selectedPasses} pases. En la invitación real se registrarían para los anfitriones.`;
    });
    document.getElementById('decline-rsvp').addEventListener('click', () => {
      status.textContent = 'Vista demo: en la invitación real se registraría que no podrás asistir.';
    });
  }

  function setupDemoMode() {
    const actions = [...document.querySelectorAll('[data-demo-action]')];
    const notice = createNotice();
    let trigger = null;
    const messages = {
      maps: 'En una invitación real, este botón abrirá Google Maps con la ubicación correspondiente.',
      calendar: 'En una invitación real, esta opción guardará el evento en el calendario.',
      gifts: 'En una invitación real, este botón llevará a la mesa de regalos configurada por los anfitriones.',
      contact: 'Esta demostración no te sacará de la invitación. En el sitio comercial, esta acción permite solicitar el paquete Prestige.'
    };
    actions.forEach((element) => {
      const url = EVENT_CONFIG.links[element.dataset.demoAction];
      if (EVENT_CONFIG.demoMode) {
        element.setAttribute('href', '#demo-notice');
        element.setAttribute('aria-haspopup', 'dialog');
      } else if (url) {
        element.setAttribute('href', url);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener');
      }
    });
    document.addEventListener('click', (event) => {
      const action = event.target.closest('[data-demo-action]');
      if (!action || !EVENT_CONFIG.demoMode) return;
      event.preventDefault();
      trigger = action;
      notice.message.textContent = messages[action.dataset.demoAction] || 'En una invitación real, esta función abrirá la opción configurada.';
      notice.overlay.hidden = false;
      document.body.classList.add('notice-open');
      notice.close.focus({ preventScroll: true });
    });
    notice.close.addEventListener('click', closeNotice);
    notice.overlay.addEventListener('click', (event) => { if (event.target === notice.overlay) closeNotice(); });
    document.addEventListener('keydown', (event) => {
      if (notice.overlay.hidden) return;
      if (event.key === 'Escape') closeNotice();
      if (event.key === 'Tab') {
        event.preventDefault();
        notice.close.focus();
      }
    });
    function closeNotice() {
      notice.overlay.hidden = true;
      document.body.classList.remove('notice-open');
      if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    }
  }

  function createNotice() {
    const overlay = document.createElement('div');
    overlay.className = 'notice-overlay';
    overlay.id = 'demo-notice';
    overlay.hidden = true;
    const dialog = document.createElement('section');
    dialog.className = 'notice';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'notice-title');
    dialog.setAttribute('aria-describedby', 'notice-message');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'Eventora Studio · Prestige';
    const title = document.createElement('h2');
    title.id = 'notice-title';
    title.textContent = 'Vista de demostración · Prestige';
    const message = document.createElement('p');
    message.id = 'notice-message';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Entendido';
    dialog.append(eyebrow, title, message, close);
    overlay.append(dialog);
    document.body.append(overlay);
    return { overlay, message, close };
  }

  function setupScrollEffects() {
    const progress = document.getElementById('progress-bar');
    window.addEventListener('scroll', () => {
      const maximum = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      progress.style.width = `${Math.min(window.scrollY / maximum * 100, 100)}%`;
    }, { passive: true });
  }

  function setupReveals() {
    const elements = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || reducedMotion()) {
      elements.forEach((element) => element.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }), { threshold: .12 });
    elements.forEach((element) => observer.observe(element));
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
  }

  function cleanText(value) {
    return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function normalizePasses(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 20 ? parsed : fallback;
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}());
