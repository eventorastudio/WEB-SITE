const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#site-nav');
const formatNaturalList = (items) => {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
};

if (menuToggle && siteNav) {
  const closeMenu = () => {
    siteNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  };

  menuToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  siteNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
}

const currentYear = document.querySelector('#current-year');
if (currentYear) currentYear.textContent = new Date().getFullYear();

const menuDialog = document.querySelector('#menu-dialog');
const menuTrigger = document.querySelector('.menu-trigger');
const dialogClose = document.querySelector('.dialog-close');

if (menuDialog && menuTrigger && dialogClose) {
  let lastFocusedElement = null;

  const closeDialog = () => {
    if (!menuDialog.open) return;
    menuDialog.close();
    lastFocusedElement?.focus();
  };

  menuTrigger.addEventListener('click', () => {
    lastFocusedElement = document.activeElement;
    menuDialog.showModal();
    dialogClose.focus();
  });

  dialogClose.addEventListener('click', closeDialog);
  menuDialog.addEventListener('click', (event) => {
    if (event.target === menuDialog) closeDialog();
  });
  menuDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog();
  });
}

const cupOrderButton = document.querySelector('#cup-order-button');
const fruitInputs = [...document.querySelectorAll('input[name="fruits"]')];
const toppingInputs = [...document.querySelectorAll('input[name="toppings"]')];
const cupFeedback = document.querySelector('#cup-feedback');

if (cupOrderButton && fruitInputs.length && cupFeedback) {
  cupOrderButton.addEventListener('click', () => {
    const selectedFruits = fruitInputs.filter((input) => input.checked).map((input) => input.value);
    const selectedToppings = toppingInputs.filter((input) => input.checked).map((input) => input.value);

    if (!selectedFruits.length) {
      cupFeedback.textContent = 'Selecciona al menos una fruta para armar tu vaso.';
      fruitInputs[0].focus();
      return;
    }

    cupFeedback.textContent = '';
    const toppingMessage = selectedToppings.length ? ` También quiero ${formatNaturalList(selectedToppings)}.` : '';
    const message = `Hola, me gustaría pedir un Vaso de Yogurt de 10 oz con ${formatNaturalList(selectedFruits)}.${toppingMessage}`;
    const url = `https://wa.me/528447801458?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

document.querySelectorAll('.flavor-order').forEach((link) => {
  const name = link.dataset.orderName;
  const fruits = (link.dataset.orderFruits || '').split('|').filter(Boolean);
  if (!name || !fruits.length) return;
  const message = `Hola, me gustaría pedir un Vaso de Yogurt de 10 oz ${name} con ${formatNaturalList(fruits)}.`;
  link.href = `https://wa.me/528447801458?text=${encodeURIComponent(message)}`;
});

const revealItems = document.querySelectorAll('.reveal');
document.documentElement.classList.add('has-reveal');
if ('IntersectionObserver' in window && revealItems.length) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}
