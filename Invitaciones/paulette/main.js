import { EVENT } from './event-data.js';

const entry = document.querySelector('#entry');
const site = document.querySelector('#invitation');
const enterButton = document.querySelector('#enter-button');
const countdown = document.querySelector('#countdown');

document.querySelector('.hero__date').textContent = EVENT.dateLabel;

enterButton.addEventListener('click', () => {
  entry.classList.add('is-hidden');
  site.classList.add('is-visible');
  site.removeAttribute('aria-hidden');
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
    countdown.querySelector('.countdown__note')?.remove();
  }
}
updateCountdown();
window.setInterval(updateCountdown, 1000);

// Audio is intentionally disabled until an authorized file is supplied.
document.querySelector('#audio-label').textContent = 'AUDIO OFF';

