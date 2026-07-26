document.addEventListener("DOMContentLoaded", () => {

  const params = new URLSearchParams(window.location.search);

  const nombre = decodeURIComponent(
    params.get("nombre") || "Invitado"
  );

  const pases = params.get("pases") || "1";

  const nombreQuince = "RENATTA";

  // 👋 saludo
  if (nombre) {
    document.getElementById("saludo").textContent =
      "Hola " + nombre;
  }

  // 🎟️ pases
  document.getElementById("pases").textContent =
    "🎟️ Acceso reservado para " + pases + " persona(s)";

  // 📍 ubicación
  document.getElementById("ubicacion").href =
    "https://maps.app.goo.gl/o7g5fjQbHxmXxnxK7";

  // 📲 whatsapp
  document.getElementById("whatsapp").href =
    "https://wa.me/528443884334?text=" +
    encodeURIComponent(
      "Hola 😊 confirmo asistencia a los XV de Renatta.\n" +
      "Reservamos " + pases + " lugar(es) para ti.\n" +
      "Confirma número de asistentes: "
    );

  // 🌺 flores
  function lanzarFlores() {
    const contenedor = document.querySelector(".flores");
    const emojis = ["🌺","🌸","🌼"];

    for (let i = 0; i < 25; i++) {
      const flor = document.createElement("span");
      flor.textContent = emojis[Math.floor(Math.random()*3)];
      flor.style.left = Math.random()*100+"vw";
      flor.style.fontSize = (Math.random()*15+15)+"px";
      flor.style.animationDuration = (Math.random()*2+2)+"s";

      contenedor.appendChild(flor);

      setTimeout(() => flor.remove(), 3000);
    }
  }

  // 💌 animación apertura
  const pantalla = document.getElementById("pantallaInicio");
  const boton = document.getElementById("abrirInvitacion");
  const audio = document.getElementById("musica");

  boton.addEventListener("click", () => {

    document.querySelector(".inicio-card").style.opacity = "0";

    document.querySelector(".overlay").style.display = "flex";

    lanzarFlores();

    pantalla.classList.add("abrir");

    audio.play().catch(()=>{});

    setTimeout(()=>{
      pantalla.style.display="none";
    },1000);
  });

  // 🎶 música
  const toggle = document.getElementById("toggleMusica");
  let play = true;

  toggle.addEventListener("click", ()=>{
    if(play){
      audio.pause();
      toggle.textContent="🔇 Activar música";
    } else {
      audio.play();
      toggle.textContent="🎵 Pausar música";
    }
    play=!play;
  });

  // ⏳ contador
  const fecha = new Date("June 20, 2026 17:00:00").getTime();

  setInterval(()=>{
    const now = new Date().getTime();
    const diff = fecha - now;

    const d = Math.floor(diff/(1000*60*60*24));
    const h = Math.floor((diff/(1000*60*60))%24);
    const m = Math.floor((diff/(1000*60))%60);

    document.getElementById("contador").innerHTML =
      `⏳ <b>${d}</b> días • <b>${h}</b> hrs • <b>${m}</b> min`;
  },1000);

});