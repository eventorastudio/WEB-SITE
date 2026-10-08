const setDemoAction = (element, title, message) => {
  if (!element) return;
  element.setAttribute('data-utility-action', '');
  element.dataset.demoTitle = title;
  element.dataset.demoMessage = message;
};

const configureDemoActions = () => {
  document.querySelectorAll('.business-links a[data-demo-action], .demo-actions a[data-demo-action]').forEach((link) => {
    if (link.textContent.toLowerCase().includes('agendar')) setDemoAction(link, 'Cita de demostración', 'En el sitio final, este botón abriría el calendario para agendar un servicio.');
  });
  document.querySelectorAll('.tech-card a[data-demo-action]').forEach((link) => setDemoAction(link, 'Servicio de demostración', 'En el sitio final, aquí podrías consultar este servicio por WhatsApp.'));
  const diagnostic = [...document.querySelectorAll('[data-demo-action]')].find((link) => link.textContent.toLowerCase().includes('diagnóstico'));
  setDemoAction(diagnostic, 'Diagnóstico de demostración', 'En el sitio final, aquí podrías solicitar un diagnóstico por WhatsApp.');
  const maps = [...document.querySelectorAll('.contact-card a[data-demo-action]')].find((link) => link.textContent.toLowerCase().includes('maps'));
  setDemoAction(maps, 'Ubicación de demostración', 'En el sitio final, este botón abriría la ubicación en Google Maps.');
  document.querySelectorAll('.demo-footer a[data-demo-action]').forEach((link) => {
    if (link.textContent.toLowerCase().includes('whatsapp')) setDemoAction(link, 'Contacto de demostración', 'En el sitio final, aquí podrías consultar una cita por WhatsApp.');
  });
};

configureDemoActions();

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

  const contact = document.querySelector('.contact-card');
  if (contact) {
    const calendarActions = document.createElement('div');
    calendarActions.className = 'car-calendar-actions';
    calendarActions.setAttribute('aria-label', 'Opciones de calendario');
    const calendarLink = document.createElement('a');
    calendarLink.className = 'text-link';
    calendarLink.href = '#';
    calendarLink.textContent = 'Añadir cita al calendario ↗';
    setDemoAction(calendarLink, 'Calendario de demostración', 'En el sitio final, aquí podrías abrir Google Calendar para agendar el servicio.');
    const icsLink = document.createElement('a');
    icsLink.className = 'text-link';
    icsLink.href = '#';
    icsLink.textContent = 'Descargar cita .ics ↗';
    setDemoAction(icsLink, 'Archivo de calendario de demostración', 'En el sitio final, aquí podrías descargar una cita .ics para tu calendario.');
    calendarActions.append(calendarLink, icsLink);
    contact.append(calendarActions);
    [calendarLink, icsLink].forEach((link) => link.addEventListener('click', (event) => {
      event.preventDefault();
      globalThis.EventoraDemo?.showDemoAction(link);
    }));
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
