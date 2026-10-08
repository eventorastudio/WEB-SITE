document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".primary-nav");
  const modal = document.querySelector("[data-demo-modal]");
  const showDemoAction = (control) => {
    if (!modal) return;
    const title = modal.querySelector("h2");
    const message = modal.querySelector("p");
    if (title) title.textContent = control.dataset.demoTitle || "Función de demostración";
    if (message) message.textContent = control.dataset.demoMessage || "Esta función estará disponible en el sitio final.";
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modal.querySelector("button")?.focus();
  };
  globalThis.EventoraDemo = { showDemoAction };
  const closeModal = () => {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  };

  menuButton?.addEventListener("click", () => {
    const open = body.classList.toggle("menu-open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    body.classList.remove("menu-open");
    menuButton?.setAttribute("aria-expanded", "false");
  }));

  document.querySelectorAll("[data-demo-action]").forEach((control) => {
    if (control.hasAttribute("data-utility-action")) return;
    control.addEventListener("click", (event) => {
      event.preventDefault();
      showDemoAction(control);
    });
  });
  document.querySelectorAll("[data-utility-action]").forEach((control) => {
    control.addEventListener("click", (event) => {
      event.preventDefault();
      showDemoAction(control);
    });
  });
  modal?.querySelectorAll("[data-demo-close]").forEach((control) => control.addEventListener("click", closeModal));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
      body.classList.remove("menu-open");
      menuButton?.setAttribute("aria-expanded", "false");
    }
  });

  document.querySelectorAll("[data-palette]").forEach((button) => {
    button.addEventListener("click", () => {
      body.dataset.palette = button.dataset.palette;
      document.querySelectorAll("[data-palette]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    });
  });
});
