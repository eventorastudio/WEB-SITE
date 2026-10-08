const setDemoAction = (element, title, message) => {
  if (!element) return;
  element.setAttribute('data-utility-action', '');
  element.dataset.demoTitle = title;
  element.dataset.demoMessage = message;
};

const configureDemoActions = () => {
  document.querySelectorAll('.business-links a[data-demo-action], .demo-actions a[data-demo-action], .demo-footer a[data-demo-action]').forEach((link) => {
    const label = link.textContent.toLowerCase();
    if (label.includes('personalizar') || label.includes('disponibilidad') || label.includes('whatsapp')) {
      setDemoAction(link, 'Consulta floral de demostración', 'En el sitio final, aquí podrías enviar por WhatsApp el arreglo y sus opciones seleccionadas.');
      if (label.includes('whatsapp')) link.textContent = 'WhatsApp';
    }
  });
  setDemoAction(document.querySelector('.configurable-card a[data-demo-action]'), 'Arreglo configurable', 'En el sitio final, aquí podrías enviar por WhatsApp el tamaño, envoltura y precio preparados.');
  document.querySelectorAll('.flower-card:not(.configurable-card) a[data-demo-action]').forEach((link) => setDemoAction(link, 'Consulta floral de demostración', 'En el sitio final, aquí podrías consultar disponibilidad y solicitar este arreglo.'));
  const download = document.querySelector('.occasion-banner a[data-demo-action]');
  setDemoAction(download, 'Catálogo de demostración', 'En el sitio final, aquí podrías consultar o descargar el catálogo completo.');
  if (download) download.textContent = 'Descargar catálogo de muestra';
  const mapsCandidate = [...document.querySelectorAll('.demo-card a[data-demo-action]')].find((link) => link.textContent.toLowerCase().includes('cobertura'));
  setDemoAction(mapsCandidate, 'Cobertura de demostración', 'En el sitio final, aquí se mostraría la cobertura en Google Maps.');
};

configureDemoActions();

document.addEventListener('DOMContentLoaded', () => {
  const card = document.querySelector('.configurable-card');
  const size = card?.querySelector('[data-size]');
  const wrap = card?.querySelector('[data-wrap]');
  const price = card?.querySelector('[data-price]');
  const configureLink = card?.querySelector('[data-utility-action]');
  const getPrice = () => 480 + Number(size?.value || 0) + Number(wrap?.value || 0);
  const update = () => {
    if (price) price.textContent = `$${getPrice()} MXN`;
    if (configureLink) configureLink.dataset.demoMessage = `En el sitio final, aquí se enviaría por WhatsApp Brisa de jardín (${size?.selectedOptions[0]?.textContent.trim() || 'tamaño estándar'}, ${wrap?.selectedOptions[0]?.textContent.trim() || 'envoltura natural'}) por $${getPrice()} MXN.`;
  };
  size?.addEventListener('change', update);
  wrap?.addEventListener('change', update);
  update();

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
