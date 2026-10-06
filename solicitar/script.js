document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#request-form");
  const notes = document.querySelector("#project-notes");
  const notesCount = document.querySelector("#notes-count");
  const formStatus = document.querySelector("#form-status");
  const templateParam = new URLSearchParams(window.location.search).get("template");
  const validTemplates = ["template-01", "template-02", "template-03", "no-estoy-seguro", "algo-diferente"];
  const eventoraWhatsapp = "525638830691";
  const eventoraEmail = "ev3ntorastudio@gmail.com";

  if (validTemplates.includes(templateParam)) {
    const selected = form.querySelector(`input[name="template"][value="${templateParam}"]`);
    if (selected) selected.checked = true;
  }

  notes.addEventListener("input", () => {
    notesCount.textContent = notes.value.length;
  });

  const setError = (id, message) => {
    const error = document.querySelector(`#${id}-error`);
    if (error) error.textContent = message;
  };

  const clearErrors = () => {
    document.querySelectorAll(".field-error").forEach((error) => { error.textContent = ""; });
    document.querySelectorAll(".has-error").forEach((field) => field.classList.remove("has-error"));
    formStatus.textContent = "";
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearErrors();

    const data = new FormData(form);
    const name = String(data.get("contactName") || "").trim();
    const whatsapp = String(data.get("whatsapp") || "").trim();
    const email = String(data.get("email") || "").trim();
    const business = String(data.get("businessName") || "").trim();
    const businessType = String(data.get("businessType") || "").trim();
    const city = String(data.get("city") || "").trim();
    const template = String(data.get("template") || "");
    const needs = data.getAll("needs");
    const comments = String(data.get("notes") || "").trim();
    let valid = true;

    if (!name) { setError("contact-name", "Escribe tu nombre."); valid = false; }
    if (!/^\+?[\d\s()-]{10,}$/.test(whatsapp)) { setError("contact-whatsapp", "Escribe un WhatsApp válido de al menos 10 dígitos."); valid = false; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("contact-email", "Revisa el formato del correo."); valid = false; }
    if (!business) { setError("business-name", "Escribe el nombre de tu negocio."); valid = false; }
    if (!businessType) { setError("business-type", "Cuéntanos qué tipo de negocio tienes."); valid = false; }
    if (!template) { setError("template", "Elige una dirección visual para continuar."); valid = false; }
    if (!needs.length) { setError("needs", "Selecciona al menos una necesidad."); valid = false; }

    if (!valid) {
      const firstError = form.querySelector(".field-error:not(:empty)");
      if (firstError) firstError.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const templateLabels = {
      "template-01": "Template 01",
      "template-02": "Template 02",
      "template-03": "Template 03",
      "no-estoy-seguro": "No estoy seguro",
      "algo-diferente": "Quiero algo diferente"
    };
    const message = [
      "Hola, quiero solicitar una página con Eventora Studio.",
      "",
      "DATOS DE CONTACTO",
      `Nombre: ${name}`,
      `WhatsApp: ${whatsapp}`,
      `Correo: ${email || "No proporcionado"}`,
      "",
      "NEGOCIO",
      `Nombre: ${business}`,
      `Giro: ${businessType}`,
      `Ciudad: ${city || "No especificada"}`,
      "",
      "DISEÑO",
      templateLabels[template] || template,
      "",
      "NECESITO",
      ...needs.map((need) => `- ${need}`),
      "",
      "COMENTARIOS",
      comments || "Sin comentario adicional."
    ].join("\n");

    const channel = event.submitter?.dataset.channel || "whatsapp";
    if (channel === "email") {
      const subject = `Solicitud de página web - ${business}`;
      window.location.href = `mailto:${eventoraEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      formStatus.textContent = "Se preparó un correo con tu solicitud.";
      return;
    }

    window.open(`https://wa.me/${eventoraWhatsapp}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    formStatus.textContent = "Se abrió WhatsApp con tu solicitud.";
  });
});
