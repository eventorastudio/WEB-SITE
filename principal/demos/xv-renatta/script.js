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

function installAlohaDemoRuntime() {
  document.body.classList.add('locked', 'public-invitation-rendered');
  document.body.dataset.builderTheme = 'aloha';

  if (!document.querySelector('[data-aloha-demo-runtime-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('../../../admin/invitations/preview/frame.css?v=phase169-aloha-opening-scroll-lock-20260825', document.baseURI).href;
    link.dataset.alohaDemoRuntimeCss = 'true';
    document.head.append(link);
  }

  document.querySelector('[data-demo-story]')?.replaceChildren(document.createTextNode(ALOHA_DEMO_DATA.story));
  document.querySelector('[data-demo-rsvp-deadline]')?.replaceChildren(document.createTextNode(ALOHA_DEMO_DATA.rsvpDeadline));
  document.querySelector('[data-demo-video-copy]')?.replaceChildren(document.createTextNode(ALOHA_DEMO_DATA.videoCopy));
  document.querySelectorAll('[data-demo-pool-note]').forEach((node, index) => {
    node.textContent = ALOHA_DEMO_DATA.poolNotes[index] || '';
  });
  document.querySelector('[data-demo-footer]')?.replaceChildren(document.createTextNode(ALOHA_DEMO_DATA.footer));

  document.documentElement.classList.add('aloha-opening-locked');
  document.getElementById('open-invitation')?.addEventListener('click', () => {
    document.documentElement.classList.remove('aloha-opening-locked');
  }, { once: true });
}

const EVENT = Object.freeze({
  demoMode: true,
  title: 'la boda de Mariana y Diego',
  date: '2027-10-18T16:30:00-06:00',
  music: 'musica.mp3',
  links: {
    maps: '',
    calendar: '',
    gifts: '',
    instagram: '',
    rsvp: null
  },
  copy: {
    opening: ({ guestName }) => `Una postal reservada para ${guestName}.`,
    guest: ({ guestName }) => `Aloha, ${guestName}. Esta celebración tiene tu nombre en la lista.`,
    passes: ({ passes }) => passes === 1 ? '1 acceso reservado para ti' : `${passes} accesos reservados para ustedes`
  },
  messages: {
    maps: 'Esta es una ubicación ficticia de demostración.',
    calendar: 'Esta acción de calendario está simulada.',
    gifts: 'Esta mesa de regalos es ficticia y sólo muestra el diseño.',
    instagram: 'Esta galería es una acción simulada de demostración.',
    rsvp: 'La confirmación de asistencia está simulada y no envía datos.'
  }
});

installAlohaDemoRuntime();
EventoraDemo.mount(EVENT);
