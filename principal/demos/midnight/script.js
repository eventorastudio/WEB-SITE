const EVENT = Object.freeze({
  title: "los XV de Valentina",
  date: "2027-12-04T20:00:00-06:00",
  locationUrl: "https://www.google.com/maps/search/?api=1&query=Centro+Convex+Monterrey",
  whatsapp: "528443884334",
  music: '../xv-renatta/musica.mp3'
});

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const guestName = cleanText(params.get('nombre')) || 'Invitado especial';
  const passes = normalizePasses(params.get('pases'));
  const opening = document.getElementById('opening');
  const invitation = document.getElementById('invitation');
  const openButton = document.getElementById('open-invitation');
  const audio = document.getElementById('event-music');
  audio.src = EVENT.music;
  const musicButton = document.getElementById('music-control');
  let playing = false;

  document.getElementById('opening-guest').textContent = `${guestName}, esta noche también es para ti.`;
  document.querySelectorAll('[data-guest-message]').forEach((element) => {
    element.textContent = `${guestName}, esta noche también es para ti.`;
  });
  document.querySelectorAll('[data-pass-message]').forEach((element) => {
    element.textContent = passes === 1 ? "Acceso individual confirmado." : `${passes} accesos forman parte de tu invitación.`;
  });

  document.querySelectorAll('[data-location]').forEach((link) => {
    link.href = EVENT.locationUrl;
  });
  document.querySelectorAll('[data-rsvp]').forEach((link) => {
    const message = `Hola, confirmo mi asistencia a ${EVENT.title}. Soy ${guestName} y la invitación contempla ${passes} ${passes === 1 ? 'lugar' : 'lugares'}.`;
    link.href = `https://wa.me/${EVENT.whatsapp}?text=${encodeURIComponent(message)}`;
  });

  openButton.addEventListener('click', async () => {
    opening.classList.add('opened');
    document.body.classList.remove('locked');
    invitation.setAttribute('aria-hidden', 'false');
    musicButton.hidden = false;
    playing = await playAudio(audio);
    syncMusicButton(musicButton, playing);
    window.setTimeout(() => opening.remove(), 900);
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

  startCountdown(EVENT.date, document.querySelector('[data-countdown]'));
  observeReveals();
  window.addEventListener('pagehide', () => {
    audio.pause();
    audio.currentTime = 0;
  }, { once: true });
});

function cleanText(value) {
  return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
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
  if (label) label.textContent = playing ? 'Pausar' : 'Reproducir';
}

function startCountdown(dateValue, target) {
  if (!target) return;
  const targetTime = new Date(dateValue).getTime();
  const render = () => {
    const distance = Math.max(targetTime - Date.now(), 0);
    if (distance === 0) {
      target.innerHTML = '<p class="countdown-message">El gran día ha llegado.</p>';
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
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
