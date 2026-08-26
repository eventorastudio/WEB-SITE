const ALOHA_DEMO_DATA = Object.freeze({
  names: 'Mariana & Diego',
  date: '18 · OCT · 2027',
  guestName: 'Invitado Especial',
  passes: 2,
  story: 'Nos encontramos sin buscarlo y desde entonces hemos elegido caminar juntos. Hoy queremos celebrar este nuevo capítulo rodeados de quienes forman parte de nuestra historia.',
  rsvpDeadline: 'Confirma antes del 18 de septiembre.',
  videoCopy: 'Una escena breve para compartir la emoción de este día.',
  poolNotes: ['Flores tropicales', 'Atardecer junto al mar', 'Actitud aloha'],
  footer: 'ALOHA COLLECTION · DEMO 2027'
});

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function setMarkup(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.innerHTML = value;
  });
}

function installAlohaDemoContent() {
  document.body.classList.add('locked', 'public-invitation-rendered');
  document.body.dataset.builderTheme = 'aloha';

  setText('[data-demo-story]', ALOHA_DEMO_DATA.story);
  setText('[data-demo-video-copy]', ALOHA_DEMO_DATA.videoCopy);
  setText('[data-demo-rsvp-deadline]', ALOHA_DEMO_DATA.rsvpDeadline);
  setText('[data-demo-footer]', ALOHA_DEMO_DATA.footer);
  setText('[data-demo-pool-note="one"]', ALOHA_DEMO_DATA.poolNotes[0]);
  setText('[data-demo-pool-note="two"]', ALOHA_DEMO_DATA.poolNotes[1]);
  setText('[data-demo-pool-note="three"]', ALOHA_DEMO_DATA.poolNotes[2]);
  setText('[data-access-guest]', ALOHA_DEMO_DATA.guestName);
  setText('[data-access-passes]', ALOHA_DEMO_DATA.passes + ' pases');
  setText('.rsvp > .section-no', '07 · RSVP');
  setMarkup('.rsvp > h2', '¿Te unes<br />a la ola?');
  setText('.social-strip .aloha-actions-copy p', 'Comparte el color del día');
  setText('.aloha-action-card .aloha-action-label', 'Galería');
  setText('.opening-date', '18 · OCT · 2027');
  setText('.hero-date', '18 OCTUBRE 2027 · 16:30 H');

  document.querySelectorAll('.aloha-actions-copy strong').forEach((element) => {
    element.hidden = true;
  });

  document.querySelector('.island-pass-tabs')?.remove();
  document.querySelectorAll('[data-access-view]:not([data-access-view="digital"])').forEach((element) => {
    element.remove();
  });

  const qrDemo = document.querySelector('.island-code');
  if (qrDemo) {
    qrDemo.setAttribute('aria-label', 'EVENTORA-DEMO-ALOHA');
    qrDemo.setAttribute('title', 'EVENTORA-DEMO-ALOHA');
  }
}

function installAlohaOpeningLock() {
  document.documentElement.classList.add('aloha-opening-locked');
  document.getElementById('open-invitation')?.addEventListener('click', () => {
    document.documentElement.classList.remove('aloha-opening-locked');
  }, { once: true });
}

const EVENT = {
  title: 'Mariana & Diego',
  date: '2027-10-18T16:30:00-06:00',
  timezone: 'America/Mexico_City',
  location: 'Jardín Coral · Terraza del Mar',
  coverUrl: '',
  gallery: [],
  music: 'musica.mp3',
  demoMode: true,
  links: {
    maps: '',
    calendar: '',
    gifts: '',
    instagram: '',
    rsvp: null
  },
  copy: {
    guest: ALOHA_DEMO_DATA.guestName,
    passes: ALOHA_DEMO_DATA.passes + ' pases',
    rsvpDeadline: ALOHA_DEMO_DATA.rsvpDeadline
  },
  messages: {
    demoNotice: 'Esta acción está deshabilitada en la demostración.'
  }
};

installAlohaDemoContent();
installAlohaOpeningLock();
EventoraDemo.mount(EVENT);
