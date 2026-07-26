/*=========================================
        EVENTORA STUDIO
        DEMO ESENCIAL (PREMIUM UX)
=========================================*/

document.addEventListener("DOMContentLoaded", () => {

    /*=====================================
                ELEMENTOS
    =====================================*/

    const loader = document.getElementById("loader");
    const envelope = document.getElementById("envelope");
    const envelopeScreen = document.getElementById("envelope-screen");
    const invitation = document.getElementById("invitation");
    const musicButton = document.getElementById("musicButton");
    const music = document.getElementById("backgroundMusic");
    const progressBar = document.getElementById("progress-bar");
    const rsvpForm = document.getElementById("rsvpForm");

    /*=====================================
          BLOQUEO DE SCROLL (UX FIX)
    =====================================*/

    document.body.classList.add("no-scroll");
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    document.documentElement.style.scrollBehavior = "";

    const keysToBlock = ["Space", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"];
    const preventScroll = (e) => {
        if (document.body.classList.contains("no-scroll")) {
            if (e.type === "keydown" && !keysToBlock.includes(e.code)) return; 
            e.preventDefault();
        }
    };

    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("keydown", preventScroll, { passive: false });

    /*=====================================
                LOADER
    =====================================*/
    setTimeout(() => {
        loader.style.opacity = "0";
        loader.style.visibility = "hidden";
    }, 1200);

    /*=====================================
            ABRIR INVITACIÓN
    =====================================*/
    let opened = false;

    envelope.addEventListener("click", () => {
        if (opened) return;
        opened = true;
        envelope.classList.add("open");

        if (navigator.vibrate) navigator.vibrate(20);

        setTimeout(() => {
            envelopeScreen.classList.add("hide");
            invitation.classList.remove("hidden");
            
            document.documentElement.style.scrollBehavior = "auto";
            window.scrollTo(0, 0);
            document.documentElement.style.scrollBehavior = "";
            document.body.classList.remove("no-scroll");

            requestAnimationFrame(() => {
                invitation.classList.add("show");
                musicButton.classList.add("show");
            });
        }, 3300);
        
        setTimeout(() => {
            music.play().catch(() => {});
        }, 2400);
    });

    /*=====================================
                MÚSICA
    =====================================*/
    let playing = true;
    musicButton.addEventListener("click", () => {
        if (playing) {
            music.pause();
            playing = false;
            musicButton.innerHTML = '<i data-lucide="volume-x"></i>';
        } else {
            music.play();
            playing = true;
            musicButton.innerHTML = '<i data-lucide="music-2"></i>';
        }
        lucide.createIcons();
    });

    /*=====================================
          REPRODUCTOR DE VIDEO PREMIUM
    =====================================*/
    const videoContainer = document.getElementById("videoContainer");
    const coupleVideo = document.getElementById("coupleVideo");
    const playBtn = document.getElementById("playBtn");
    const videoCover = document.getElementById("videoCover");

    if (playBtn && coupleVideo && videoContainer) {
        
        const playVideo = () => {
            videoContainer.classList.add("playing");
            coupleVideo.play();
            
            // Pausar la música ambiental al iniciar un video asegura una UX elegante
            if (playing && music) {
                music.pause();
                playing = false;
                if (musicButton) musicButton.innerHTML = '<i data-lucide="volume-x"></i>';
                lucide.createIcons();
            }
        };

        playBtn.addEventListener("click", playVideo);
        if (videoCover) {
            videoCover.addEventListener("click", playVideo);
        }

        // Restaura la tarjeta al terminar el video
        coupleVideo.addEventListener("ended", () => {
            videoContainer.classList.remove("playing");
        });
    }

    /*=====================================
            CUENTA REGRESIVA
    =====================================*/
    const targetDate = new Date("Nov 15, 2027 18:00:00").getTime();

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = targetDate - now;

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById("days").textContent = String(days).padStart(2, "0");
        document.getElementById("hours").textContent = String(hours).padStart(2, "0");
        document.getElementById("minutes").textContent = String(minutes).padStart(2, "0");
        document.getElementById("seconds").textContent = String(seconds).padStart(2, "0");
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);

    /*=====================================
            REVEAL SCROLL (CON BLUR)
    =====================================*/
    const reveals = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("active");
            }
        });
    }, { threshold: .15 });

    reveals.forEach(section => {
        observer.observe(section);
    });

    /*=====================================
            BARRA SUPERIOR
    =====================================*/
    window.addEventListener("scroll", () => {
        const scrollTop = document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const progress = (scrollTop / height) * 100;
        progressBar.style.width = progress + "%";
    });

    /*=====================================
                RSVP
    =====================================*/
    if (rsvpForm) {
        rsvpForm.addEventListener("submit", (e) => {
            e.preventDefault();
            
            rsvpForm.innerHTML = `
                <div style="text-align:center; padding:30px 10px; animation: fadeIn 1s ease;">
                    <i data-lucide="mail-check" style="width: 50px; height: 50px; color: var(--gold); margin-bottom: 20px;"></i>
                    <h3 style="font-family:'Cormorant Garamond'; font-size: 2.5rem; margin-bottom:15px; color:#1a1917;">¡Gracias!</h3>
                    <p style="color:var(--gray); font-size: 1.05rem; line-height: 1.7;">
                        Esta es una demostración interactiva.<br><br>
                        En un escenario real, tu confirmación se enviaría directamente al panel del anfitrión.
                    </p>
                </div>
            `;
            lucide.createIcons(); 
        });
    }
});