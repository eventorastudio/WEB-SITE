export const hostingMaintenancePromotion = Object.freeze({
  id: 'hosting-maintenance-60-free-2026',
  label: '60 días de Hosting + mantenimiento GRATIS',
  validUntil: '2026-12-31',
  durationDays: 60,
  endDateText: '31 de diciembre de 2026'
});

const mexicoDeadline = new Date(`${hostingMaintenancePromotion.validUntil}T23:59:59-06:00`);

export function isPromotionActive(now = new Date()) {
  return now.getTime() <= mexicoDeadline.getTime();
}

export function promotionEndDate(startDate) {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + hostingMaintenancePromotion.durationDays);
  return date.toISOString().slice(0, 10);
}

export function applyPromotionVisibility(root = document) {
  root.querySelectorAll('[data-promotion]').forEach((element) => {
    element.hidden = !isPromotionActive();
  });
}

function addPromotionMarkup() {
  if (!isPromotionActive()) return;
  const path = window.location.pathname;
  const makeCallout = (className, title, text, href = '/solicitar/') => {
    const box = document.createElement('aside');
    box.className = className;
    box.dataset.promotion = '';
    box.innerHTML = `<strong>${title}</strong><span>${text}</span><a href="${href}">Comenzar proyecto ↗</a>`;
    return box;
  };

  if (path === '/principal/' || path === '/principal') {
    const packages = document.querySelector('.packages-grid');
    if (packages) packages.before(makeCallout('promotion-card', hostingMaintenancePromotion.label, `Contrataciones hasta el ${hostingMaintenancePromotion.endDateText}. El periodo comienza al publicar tu sitio.`));
    const hosting = document.querySelector('.hosting-grid');
    if (hosting) hosting.after(makeCallout('promotion-callout', 'Promoción para nuevos proyectos', 'Incluye 60 días sin costo y no se renueva automáticamente.'));
  }

}

if (typeof document !== 'undefined') {
  applyPromotionVisibility();
  addPromotionMarkup();
}
