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
    if (label.includes('personalizar') || label.includes('disponibilidad') || label.includes('whatsapp')) {
      markUtility(link, 'data-flower-whatsapp');
      if (label.includes('whatsapp')) link.textContent = 'WhatsApp';
    }
  });
  markUtility(document.querySelector('.configurable-card a[data-demo-action]'), 'data-flower-configure');
  document.querySelectorAll('.flower-card:not(.configurable-card) a[data-demo-action]').forEach((link) => markUtility(link, 'data-flower-whatsapp', link.closest('article')?.querySelector('h3')?.textContent.trim() || 'un arreglo'));
  const download = document.querySelector('.occasion-banner a[data-demo-action]');
  markUtility(download, 'data-flower-download');
  if (download) download.textContent = 'Descargar catálogo de muestra';
  const mapsCandidate = [...document.querySelectorAll('.demo-card a[data-demo-action]')].find((link) => link.textContent.toLowerCase().includes('cobertura'));
  markUtility(mapsCandidate, 'data-flower-maps');
};

configureActions();

document.addEventListener('DOMContentLoaded', () => {
  const card = document.querySelector('.configurable-card');
  const size = card?.querySelector('[data-size]');
  const wrap = card?.querySelector('[data-wrap]');
  const price = card?.querySelector('[data-price]');
  const getPrice = () => 480 + Number(size?.value || 0) + Number(wrap?.value || 0);
  const update = () => { if (price) price.textContent = `$${getPrice()} MXN`; };
  size?.addEventListener('change', update);
  wrap?.addEventListener('change', update);

  document.querySelectorAll('[data-flower-whatsapp]').forEach((link) => {
    link.href = buildWhatsAppUrl(WHATSAPP, `Hola, quiero consultar disponibilidad de ${link.dataset.flowerWhatsapp || 'un arreglo'} en My Love Flowers.`);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
  document.querySelector('[data-flower-configure]')?.addEventListener('click', (event) => {
    event.preventDefault();
    const selectedSize = size?.selectedOptions[0]?.textContent.trim() || 'tamaño estándar';
    const selectedWrap = wrap?.selectedOptions[0]?.textContent.trim() || 'envoltura natural';
    window.open(buildWhatsAppUrl(WHATSAPP, `Hola, quiero solicitar Brisa de jardín (${selectedSize}, ${selectedWrap}) por $${getPrice()} MXN.`), '_blank', 'noopener,noreferrer');
  });
  document.querySelector('[data-flower-maps]')?.addEventListener('click', (event) => {
    event.preventDefault();
    const url = buildGoogleMapsUrl({ query: 'My Love Flowers, Saltillo, Coahuila' });
    window.open(url, '_blank', 'noopener,noreferrer');
  });
  document.querySelector('[data-flower-download]')?.addEventListener('click', (event) => {
    event.preventDefault();
    downloadText('My Love Flowers — Catálogo de demostración\n\nBrisa de jardín\nRosa para ti\nPequeño detalle', 'my-love-flowers-catalogo-demo.txt');
  });

  const reveal = document.querySelectorAll('.demo-section,.demo-cta');
  reveal.forEach((item) => item.classList.add('editorial-reveal'));
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveal.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries, current) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    current.unobserve(entry.target);
  }), { threshold: 0.14 });
  reveal.forEach((item) => observer.observe(item));
});
