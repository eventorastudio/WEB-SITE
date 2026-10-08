const setDemoAction = (element, title, message) => {
  if (!element) return;
  element.setAttribute('data-utility-action', '');
  element.dataset.demoTitle = title;
  element.dataset.demoMessage = message;
};

const configureDemoActions = () => {
  document.querySelectorAll('.business-links a[data-demo-action], .demo-actions a[data-demo-action], .demo-footer a[data-demo-action]').forEach((link) => {
    const label = link.textContent.toLowerCase();
    if (label.includes('pedir') || label.includes('whatsapp')) {
      setDemoAction(link, 'Pedido de demostración', 'En el sitio final, este botón abriría WhatsApp con tu pedido preparado.');
      if (label.includes('whatsapp')) link.textContent = 'WhatsApp';
    }
  });
  document.querySelectorAll('.menu-card-action, .game-day-card a.demo-button, .menu-special a.demo-button').forEach((link) => {
    setDemoAction(link, 'Producto agregado', 'El producto se agregó a esta demo. En una web real, aquí se prepararía tu pedido.');
  });
  const downloadLink = document.querySelector('.menu-actions a[data-demo-action]');
  setDemoAction(downloadLink, 'Menú de demostración', 'En el sitio final, aquí podrías consultar o descargar el menú completo.');
  if (downloadLink) downloadLink.textContent = 'Descargar menú de muestra';
  setDemoAction(document.querySelector('.location-card a[data-demo-action]'), 'Ubicación de demostración', 'En el sitio final, este botón abriría la ubicación en Google Maps.');
};

configureDemoActions();

document.addEventListener('DOMContentLoaded', () => {
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
  orderLink.href = '#';
  setDemoAction(orderLink, 'Pedido de demostración', 'En el sitio final, este botón abriría WhatsApp con tu pedido preparado.');
  orderLink.hidden = true;
  orderLink.addEventListener('click', (event) => {
    event.preventDefault();
    globalThis.EventoraDemo?.showDemoAction(orderLink);
  });
  actions?.append(orderLink);

  document.querySelectorAll('[data-order-item]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    order.push(link.closest('article')?.querySelector('h3')?.textContent.trim() || 'Producto de demostración');
    feedback.textContent = `${order.length} opción${order.length === 1 ? '' : 'es'} agregada${order.length === 1 ? '' : 's'} a la demo.`;
    orderLink.dataset.demoMessage = `Pedido preparado en la demo: ${order.join(', ')}. En el sitio final, aquí se abriría WhatsApp con el pedido listo.`;
    orderLink.hidden = false;
  }));
});
