document.addEventListener("DOMContentLoaded", () => {
  const paletteControl = document.createElement("div");
  paletteControl.className = "palette-control";
  paletteControl.setAttribute("role", "group");
  paletteControl.setAttribute("aria-label", "Cambiar combinación de color");
  paletteControl.innerHTML = '<span>Color</span><div class="palette-options"></div>';
  const palettes = [
    { id: "nova", label: "Verde y lima" },
    { id: "amber", label: "Azul y ámbar" },
    { id: "clay", label: "Terracota y crema" },
    { id: "signal", label: "Grafito y rojo" }
  ];
  const options = paletteControl.querySelector(".palette-options");
  palettes.forEach((palette) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.theme = palette.id;
    button.setAttribute("aria-label", palette.label);
    button.setAttribute("aria-pressed", palette.id === "nova" ? "true" : "false");
    button.innerHTML = "<span></span>";
    button.addEventListener("click", () => {
      document.body.dataset.theme = palette.id;
      options.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    });
    options.append(button);
  });
  document.querySelector(".hero-copy")?.append(paletteControl);

  const revealItems = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      currentObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  revealItems.forEach((item) => observer.observe(item));
});
