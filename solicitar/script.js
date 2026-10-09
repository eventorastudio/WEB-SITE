document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#request-form");
  const notes = document.querySelector("#project-notes");
  const notesCount = document.querySelector("#notes-count");
  const formStatus = document.querySelector("#form-status");
  const templateParam = new URLSearchParams(window.location.search).get("template");
  const planParam = new URLSearchParams(window.location.search).get("plan");
  const validTemplates = ["template-01", "template-02", "template-03", "no-estoy-seguro", "algo-diferente"];
  const validPlans = ["esencial", "profesional", "a-medida", "no-estoy-seguro"];
  const validNeeds = ["services-products", "gallery", "hours-location", "contact-social", "about", "other"];
  const submitButton = form.querySelector(".submit-button");
  addHostingPreferenceField();

  function addHostingPreferenceField() {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "hosting-preference-fieldset";
    fieldset.innerHTML = `<legend>¿Qué opción prefieres para tu sitio?</legend><div class="style-options"><label class="style-option"><input type="radio" name="hostingPreference" value="files-only" required><span><strong>Solo entrega de archivos</strong><small>Sin mensualidad. Te entregamos el sitio para que lo alojes donde prefieras.</small></span></label><label class="style-option"><input type="radio" name="hostingPreference" value="hosting"><span><strong>Hosting</strong><small>$99 MXN / mes o $999 MXN / año · Publicamos y alojamos tu sitio.</small></span></label><label class="style-option"><input type="radio" name="hostingPreference" value="hosting-maintenance"><span><strong>Hosting + mantenimiento</strong><small>$199 MXN / mes o $1,999 MXN / año · Publicamos, alojamos y damos mantenimiento periódico.</small></span></label><label class="style-option"><input type="radio" name="hostingPreference" value="undecided"><span><strong>Aún no lo sé</strong><small>Podemos recomendarte la opción más conveniente.</small></span></label></div><p class="hosting-promotion-note">Promoción vigente: nuevos proyectos contratados antes del 31 de diciembre de 2026 incluyen 60 días GRATIS de Hosting + mantenimiento desde la publicación del sitio. <a href="/legal/terminos/">Aplican términos y condiciones.</a></p><small class="field-error" id="hostingPreference-error"></small>`;
    form.querySelector("fieldset").after(fieldset);
  }

  if (validTemplates.includes(templateParam)) {
    const selected = form.querySelector(`input[name="template"][value="${templateParam}"]`);
    if (selected) selected.checked = true;
  }

  if (validPlans.includes(planParam)) {
    const selected = form.querySelector(`input[name="plan"][value="${planParam}"]`);
    if (selected) selected.checked = true;
  }

  notes.addEventListener("input", () => {
    notesCount.textContent = notes.value.length;
  });

  const setError = (id, message) => {
    const error = document.querySelector(`#${id}-error`);
    if (error) {
      error.textContent = message;
      error.setAttribute("role", "alert");
    }
  };

  const clearErrors = () => {
    document.querySelectorAll(".field-error").forEach((error) => {
      error.textContent = "";
      error.removeAttribute("role");
    });
    document.querySelectorAll(".has-error").forEach((field) => field.classList.remove("has-error"));
    formStatus.textContent = "";
    formStatus.removeAttribute("data-state");
  };

  const endpoint = "https://us-central1-eventorastudio-d6d95.cloudfunctions.net/submitWebsiteRequest";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();

    const data = new FormData(form);
    const name = String(data.get("contactName") || "").trim();
    const whatsapp = String(data.get("whatsapp") || "").trim();
    const email = String(data.get("email") || "").trim();
    const business = String(data.get("businessName") || "").trim();
    const businessType = String(data.get("businessType") || "").trim();
    const city = String(data.get("city") || "").trim();
    const plan = String(data.get("plan") || "");
    const hostingPreference = String(data.get("hostingPreference") || "");
    const template = String(data.get("template") || "");
    const needs = data.getAll("needs");
    const comments = String(data.get("notes") || "").trim();
    const website = String(data.get("website") || "").trim();
    let valid = true;

    if (!name) { setError("contact-name", "Escribe tu nombre."); valid = false; }
    if (!/^\+?[\d\s()-]{10,}$/.test(whatsapp)) { setError("contact-whatsapp", "Escribe un WhatsApp válido de al menos 10 dígitos."); valid = false; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("contact-email", "Revisa el formato del correo."); valid = false; }
    if (!business) { setError("business-name", "Escribe el nombre de tu negocio."); valid = false; }
    if (!businessType) { setError("business-type", "Cuéntanos qué tipo de negocio tienes."); valid = false; }
    if (!plan) { setError("plan", "Elige un paquete para continuar."); valid = false; }
    if (!["files-only", "hosting", "hosting-maintenance", "undecided"].includes(hostingPreference)) { setError("hostingPreference", "Elige una opción de alojamiento para continuar."); valid = false; }
    if (!template) { setError("template", "Elige una dirección visual para continuar."); valid = false; }
    if (!needs.length || needs.some((need) => !validNeeds.includes(need))) { setError("needs", "Selecciona al menos una necesidad."); valid = false; }

    if (!valid) {
      const firstError = form.querySelector(".field-error:not(:empty)");
      if (firstError) firstError.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "ENVIANDO...";
    formStatus.dataset.state = "sending";
    formStatus.textContent = "Enviando...";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactName: name, whatsapp, email, businessName: business, businessType, city, plan, template, hostingPreference, needs, notes: comments, website })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error("request-failed");
      formStatus.dataset.state = "success";
      formStatus.textContent = "Solicitud recibida. La revisaremos y te contactaremos para definir el alcance. No se realizó ningún cobro.";
      form.querySelectorAll("input, textarea").forEach((field) => { field.disabled = true; });
    } catch (error) {
      formStatus.dataset.state = "error";
      formStatus.textContent = "No pudimos enviar tu solicitud. Intenta de nuevo en unos momentos.";
      submitButton.disabled = false;
      submitButton.textContent = "ENVIAR";
    }
  });
});
