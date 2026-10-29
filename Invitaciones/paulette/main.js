import { EVENT } from './event-data.js';

const PUBLIC_URL = 'https://eventorastudio-d6d95.web.app/invitaciones/paulette/';
const isInvitationEnabled = document.documentElement.dataset.experience === 'invitation';
const audio = {
  intro: document.querySelector('#intro-audio'),
  invitation: document.querySelector('#invitation-audio')
};
let activeAudio = null;

function updateAudioControls(kind, isPlaying) {
  const label = kind === 'intro' ? document.querySelector('#entry-audio-label') : document.querySelector('#audio-label');
  const button = kind === 'intro' ? document.querySelector('#entry-audio-toggle') : document.querySelector('#audio-toggle');
  if (label) label.textContent = isPlaying ? 'AUDIO ON' : 'AUDIO OFF';
  button?.setAttribute('aria-pressed', String(isPlaying));
}

function stopAudio(kind) {
  const player = audio[kind];
  if (!player) return;
  player.pause();
  player.currentTime = 0;
  updateAudioControls(kind, false);
  if (activeAudio === kind) activeAudio = null;
}

async function playAudio(kind) {
  const player = audio[kind];
  const config = EVENT.audio?.[kind];
  if (!player || !config?.enabled || !config.src) return false;
  if (activeAudio && activeAudio !== kind) stopAudio(activeAudio);
  if (!player.src) {
    const sourceUrl = new URL(config.src, window.location.href).toString();
    player.preload = 'none';
    player.src = sourceUrl;
    player.addEventListener('error', () => {
      // Missing MP3s are an expected preparation state; keep the invitation usable.
      updateAudioControls(kind, false);
      if (activeAudio === kind) activeAudio = null;
    }, { once: true });
  }
  try {
    await player.play();
    activeAudio = kind;
    updateAudioControls(kind, true);
    return true;
  } catch {
    updateAudioControls(kind, false);
    return false;
  }
}

function toggleAudio(kind) {
  const player = audio[kind];
  if (!player) return;
  if (activeAudio === kind && !player.paused) stopAudio(kind);
  else void playAudio(kind);
}

function stopAllAudio() {
  stopAudio('intro');
  stopAudio('invitation');
}

function setupCopyLink() {
  const button = document.querySelector('#copy-link');
  const status = document.querySelector('#copy-status');
  if (!button || !status) return;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(PUBLIC_URL);
      status.textContent = 'Enlace copiado';
    } catch {
      status.textContent = PUBLIC_URL;
    }
    window.setTimeout(() => { status.textContent = ''; }, 3200);
  });
}

setupCopyLink();

if (!isInvitationEnabled) {
  document.querySelector('#desktop-gate')?.removeAttribute('aria-hidden');
} else {
  document.body.classList.add('entry-lock');
  document.querySelector('#entry-audio-toggle')?.addEventListener('click', () => toggleAudio('intro'));
  document.querySelector('#audio-toggle')?.addEventListener('click', () => toggleAudio('invitation'));

  const entry = document.querySelector('#entry');
  const site = document.querySelector('#invitation');
  const enterButton = document.querySelector('#enter-button');
  const countdown = document.querySelector('#countdown');
  document.querySelector('.hero__date').textContent = EVENT.dateLabel;

  enterButton.addEventListener('click', () => {
    stopAudio('intro');
    document.body.classList.remove('entry-lock');
    entry.classList.add('is-hidden');
    site.classList.add('is-visible');
    site.removeAttribute('aria-hidden');
    site.focus({ preventScroll: true });
    void playAudio('invitation');
    window.setTimeout(() => document.querySelector('#top .reveal')?.classList.add('is-revealed'), 220);
  });

  const revealObserver = new IntersectionObserver((items) => {
    items.forEach((item) => {
      if (item.isIntersecting) {
        item.target.classList.add('is-revealed');
        revealObserver.unobserve(item.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

  const target = new Date(EVENT.targetUtc).getTime();
  const units = ['days', 'hours', 'minutes', 'seconds'];
  function updateCountdown() {
    const remaining = Math.max(0, target - Date.now());
    const values = [
      Math.floor(remaining / 86400000),
      Math.floor((remaining / 3600000) % 24),
      Math.floor((remaining / 60000) % 60),
      Math.floor((remaining / 1000) % 60)
    ];
    units.forEach((unit, index) => {
      const node = countdown.querySelector(`[data-unit="${unit}"]`);
      node.textContent = String(values[index]).padStart(2, '0');
    });
    if (remaining === 0) {
      countdown.setAttribute('aria-label', 'La celebración ya comenzó');
      document.querySelector('.countdown__note')?.remove();
    }
  }
  updateCountdown();
  window.setInterval(updateCountdown, 1000);
}

window.addEventListener('pagehide', stopAllAudio, { once: true });
