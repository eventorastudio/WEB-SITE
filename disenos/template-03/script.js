import { buildGoogleCalendarUrl, buildIcsEvent } from '../../shared/utils/calendar.js';
import { buildGoogleMapsUrl } from '../../shared/utils/maps.js';
import { downloadText } from '../../shared/utils/downloads.js';
import { buildWhatsAppUrl } from '../../shared/utils/whatsapp.js';

const WHATSAPP = '+52 844 123 4567';
const APPOINTMENT = {
  title: 'Diagnóstico Premium Car',
  start: '2026-11-07T10:00:00-06:00',
  end: '2026-11-07T11:00:00-06:00',
  location: 'Av. Industria 480, Saltillo, Coahuila',
  description: 'Cita de demostración para diagnóstico y cuidado automotriz.'
};

const markUtility = (element, name, value = '') => {
  if (!element) return;
  element.setAttribute('data-utility-action', '');
  element.setAttribute(name, value);
};

const configureActions = () => {
  document.querySelectorAll('.business-links a[data-demo-action], .demo-actions a[data-demo-action]').forEach((link) => {
    if (link.textContent.toLowerCase().includes('agendar')) markUtility(link, 'data-car-calendar');
  });
  document.querySelectorAll('.tech-card a[data-demo-action]').forEach((link) => markUtility(link, 'data-car-whatsapp', link.closest('article')?.querySelector('h3')?.textContent.trim() || 'un servicio'));
  const diagnostic = [...document.querySelectorAll('[data-demo-action]')].find((link) => link.textContent.toLowerCase().includes('diagnóstico'));
  markUtility(diagnostic, 'data-car-whatsapp', 'un diagnóstico');
  const maps = [...document.querySelectorAll('.contact-card a[data-demo-action]')].find((link) => link.textContent.toLowerCase().includes('maps'));
  markUtility(maps, 'data-car-maps');
  document.querySelectorAll('.demo-footer a[data-demo-action]').forEach((link) => {
    if (link.textContent.toLowerCase().includes('whatsapp')) markUtility(link, 'data-car-whatsapp', 'una cita');
  });
};

configureActions();

document.addEventListener('DOMContentLoaded', () => {
  const frame = document.querySelector('.comparison-frame');
  const before = document.querySelector('[data-before]');
  const handle = document.querySelector('[data-handle]');
  const nav = document.querySelector('.car-nav');
  let dragging = false;
  const clamp = (value) => Math.min(100, Math.max(0, value));
  const valueFromPoint = (clientX) => {
    if (!frame) return 50;
    const rect = frame.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * 100);
  };
  const update = (value) => {
    if (!before || !handle) return;
    const next = clamp(value);
    before.style.width = `${next}%`;
    handle.style.left = `${next}%`;
    handle.setAttribute('aria-valuenow', String(Math.round(next)));
  };
  const start = (event, target) => {
    if (!frame) return;
    dragging = true;
    target.classList.add('is-dragging');
    target.setPointerCapture?.(event.pointerId);
    if (event.currentTarget === handle) event.preventDefault();
    update(valueFromPoint(event.clientX));
  };
  const move = (event) => { if (dragging) update(valueFromPoint(event.clientX)); };
  const end = (event) => {
    if (!dragging) return;
    dragging = false;
    handle?.classList.remove('is-dragging');
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  frame?.addEventListener('pointerdown', (event) => { if (!event.target.closest('[data-handle]')) start(event, frame); });
  handle?.addEventListener('pointerdown', (event) => start(event, handle));
  frame?.addEventListener('pointermove', move);
  handle?.addEventListener('pointermove', move);
  frame?.addEventListener('pointerup', end);
  handle?.addEventListener('pointerup', end);
  frame?.addEventListener('pointercancel', end);
  handle?.addEventListener('pointercancel', end);
  frame?.addEventListener('lostpointercapture', end);
  handle?.addEventListener('lostpointercapture', end);
  handle?.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 10 : 2;
    const current = Number(handle.getAttribute('aria-valuenow')) || 50;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); update(current - step); }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); update(current + step); }
    if (event.key === 'Home') { event.preventDefault(); update(0); }
    if (event.key === 'End') { event.preventDefault(); update(100); }
  });
  update(50);

  const syncNav = () => nav?.classList.toggle('is-scrolled', window.scrollY > 24);
  syncNav();
  window.addEventListener('scroll', syncNav, { passive: true });

  document.querySelectorAll('[data-car-whatsapp]').forEach((link) => {
    link.href = buildWhatsAppUrl(WHATSAPP, `Hola, quiero consultar ${link.dataset.carWhatsapp || 'un servicio'} en Premium Car.`);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
  document.querySelectorAll('[data-car-maps]').forEach((link) => {
    link.href = buildGoogleMapsUrl({ address: APPOINTMENT.location });
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
  document.querySelectorAll('[data-car-calendar]').forEach((link) => {
    link.href = buildGoogleCalendarUrl(APPOINTMENT);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
  const contact = document.querySelector('.contact-card');
  if (contact) {
    const calendarActions = document.createElement('div');
    calendarActions.className = 'car-calendar-actions';
    calendarActions.setAttribute('aria-label', 'Opciones de calendario');
    const icsLink = document.createElement('a');
    icsLink.className = 'text-link';
    icsLink.href = '#';
    icsLink.textContent = 'Descargar cita .ics ↗';
    icsLink.setAttribute('data-utility-action', '');
    icsLink.setAttribute('data-car-ics', '');
    calendarActions.append(icsLink);
    contact.append(calendarActions);
    icsLink.addEventListener('click', (event) => {
      event.preventDefault();
      downloadText(buildIcsEvent(APPOINTMENT), 'premium-car-cita.ics', 'text/calendar;charset=utf-8');
    });
  }

  const reveal = document.querySelectorAll('.lab-section,.demo-cta');
  reveal.forEach((item) => item.classList.add('lab-reveal'));
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveal.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries, current) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    current.unobserve(entry.target);
  }), { threshold: 0.12 });
  reveal.forEach((item) => observer.observe(item));
});
