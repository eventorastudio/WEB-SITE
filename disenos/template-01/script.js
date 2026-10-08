import { buildGoogleMapsUrl } from '../../shared/utils/maps.js';
import { downloadText } from '../../shared/utils/downloads.js';
import { buildWhatsAppUrl } from '../../shared/utils/whatsapp.js';

const WHATSAPP = '+52 844 123 4567';
const markUtility = (element, name, value = '') => {
  if (!element) return;
  element.setAttribute('data-utility-action', '');
  element.setAttribute(name, value);
};

const configureActions = () => {
  document.querySelectorAll('.business-links a[data-demo-action], .demo-actions a[data-demo-action], .demo-footer a[data-demo-action]').forEach((link) => {
    const label = link.textContent.toLowerCase();
    if (label.includes('pedir') || label.includes('whatsapp')) {
      markUtility(link, 'data-whatsapp-action');
      if (label.includes('whatsapp')) link.textContent = 'WhatsApp';
    }
  });
  document.querySelectorAll('.menu-card-action, .game-day-card a.demo-button, .menu-special a.demo-button').forEach((link) => markUtility(link, 'data-order-item', link.closest('article')?.querySelector('h3')?.textContent.trim() || 'Pedido de demostración'));
  const downloadLink = document.querySelector('.menu-actions a[data-demo-action]');
  markUtility(downloadLink, 'data-menu-download');
  if (downloadLink) downloadLink.textContent = 'Descargar menú de muestra';
  markUtility(document.querySelector('.location-card a[data-demo-action]'), 'data-maps-action');
};

configureActions();

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-whatsapp-action]').forEach((link) => {
    link.href = buildWhatsAppUrl(WHATSAPP, 'Hola, quiero hacer un pedido en Eagles Burger.');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
  document.querySelectorAll('[data-maps-action]').forEach((link) => {
    link.href = buildGoogleMapsUrl({ address: 'Calzada de los Sabores 125, Saltillo, Coahuila' });
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });

  const order = [];
  const actions = document.querySelector('.menu-actions');
  const feedback = document.createElement('p');
  feedback.className = 'burger-order-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  actions?.append(feedback);
  const orderLink = document.createElement('a');
  orderLink.className = 'demo-button alt burger-order-whatsapp';
  orderLink.textContent = 'Enviar pedido por WhatsApp';
  orderLink.hidden = true;
  actions?.append(orderLink);
  const updateOrderLink = () => {
    orderLink.href = buildWhatsAppUrl(WHATSAPP, `Hola, quiero pedir en Eagles Burger: ${order.join(', ')}.`);
    orderLink.target = '_blank';
    orderLink.rel = 'noopener noreferrer';
    orderLink.hidden = order.length === 0;
    feedback.textContent = order.length ? `${order.length} opción${order.length === 1 ? '' : 'es'} lista${order.length === 1 ? '' : 's'} para pedir por WhatsApp.` : '';
  };
  document.querySelectorAll('[data-order-item]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    order.push(link.dataset.orderItem);
    updateOrderLink();
  }));
  document.querySelector('[data-menu-download]')?.addEventListener('click', (event) => {
    event.preventDefault();
    downloadText('Eagles Burger — Menú de demostración\n\nLas clásicas · Desde $129\nLas intensas · Desde $159\nCombos · Desde $189\nLa Eagle · $179', 'eagles-burger-menu-demo.txt');
  });
});
