document.addEventListener("DOMContentLoaded", () => {
  const cards = document.querySelectorAll(".template-card");
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  cards.forEach((card) => {
    card.classList.add("is-reveal-ready");
    card.style.setProperty("--reveal-delay", `${Array.from(cards).indexOf(card) * 80}ms`);
  });

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      currentObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  cards.forEach((card) => observer.observe(card));
});
