/*=========================================
        EVENTORA STUDIO
        DEMO PRESTIGE UX
=========================================*/

document.addEventListener("DOMContentLoaded", () => {

    /*=====================================
                ELEMENTOS
    =====================================*/

    const loader = document.getElementById("loader");
    const luxEnvelope = document.getElementById("lux-envelope");
    const envelopeScreen = document.getElementById("lux-envelope-screen");
    const invitation = document.getElementById("invitation");
    const musicButton = document.getElementById("musicButton");
    const music = document.getElementById("backgroundMusic");
    const progressBar = document.getElementById("progress-bar");
    const confirmButton = document.getElementById("btnConfirm");
    const declineButton = document.getElementById("btnDecline");
    const rsvpActionContainer = document.getElementById("rsvpActionContainer");
    const rsvpMessageContainer = document.getElementById("rsvpMessageContainer");
    const floatingMenu = document.getElementById("floating-menu");

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
            ABRIR INVITACIÓN (PRESTIGE)
    =====================================*/
    let opened = false;

    if (luxEnvelope) {
        luxEnvelope.addEventListener("click", () => {
            if (opened) return;
            opened = true;
            luxEnvelope.classList.add("is-open");

            if (navigator.vibrate) navigator.vibrate(20);

            // Ajustado al tiempo exacto de la cinemática
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
            }, 4800); 
            
            setTimeout(() => {
                music.play().catch(() => {});
            }, 2500);
        });
    }

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

        coupleVideo.addEventListener("ended", () => {
            videoContainer.classList.remove("playing");
        });
    }

    /*=====================================
            EFECTO PARALLAX PREMIUM
    =====================================*/
    const parallaxImages = document.querySelectorAll('.parallax-img');
    if (parallaxImages.length > 0) {
        window.addEventListener('scroll', () => {
            requestAnimationFrame(() => {
                parallaxImages.forEach(img => {
                    const rect = img.parentElement.getBoundingClientRect();
                    const windowHeight = window.innerHeight;
                    
                    if (rect.top <= windowHeight && rect.bottom >= 0) {
                        const scrollPercent = (windowHeight - rect.top) / (windowHeight + rect.height);
                        const yOffset = (scrollPercent - 0.5) * -50; 
                        img.style.transform = `scale(1.15) translateY(${yOffset}px)`;
                    }
                });
            });
        }, { passive: true });
    }

    /*=====================================
            CUENTA REGRESIVA DINÁMICA
    =====================================*/
    const targetDate = new Date("Nov 15, 2027 18:00:00").getTime();
    
    const updateTimeElement = (id, newValue) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.textContent !== newValue) {
            el.textContent = newValue;
            el.classList.remove("pop");
            void el.offsetWidth;
            el.classList.add("pop");
        }
    };

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = targetDate - now;

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        updateTimeElement("days", String(days).padStart(2, "0"));
        updateTimeElement("hours", String(hours).padStart(2, "0"));
        updateTimeElement("minutes", String(minutes).padStart(2, "0"));
        updateTimeElement("seconds", String(seconds).padStart(2, "0"));
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);

    /*=====================================
            REVEAL SCROLL PREMIUM
    =====================================*/
    const reveals = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("active");
            }
        });
    }, { threshold: .12 });

    reveals.forEach(section => {
        observer.observe(section);
    });

    /*=====================================
            BARRA SUPERIOR & MENÚ FLOTANTE
    =====================================*/
    window.addEventListener("scroll", () => {
        const scrollTop = document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const progress = (scrollTop / height) * 100;
        progressBar.style.width = progress + "%";

        if (opened && scrollTop > window.innerHeight * 0.5) {
            floatingMenu.classList.add("show");
        } else {
            floatingMenu.classList.remove("show");
        }
    });

    /*=====================================
            CONFIRMACIÓN PASES VIP (PRESTIGE)
    =====================================*/
    if (btnConfirm && btnDecline && rsvpActionContainer && rsvpMessageContainer) {
        btnConfirm.addEventListener("click", (e) => {
            e.preventDefault();
            rsvpActionContainer.style.display = "none";
            rsvpMessageContainer.style.display = "block";
            rsvpMessageContainer.innerHTML = `
                <div style="display: inline-flex; align-items: center; justify-content: center; gap: 10px; color: #2e7d32; font-weight: 600; font-size: 1.1rem;">
                    <i data-lucide="check-circle-2" style="width: 24px; height: 24px;"></i>
                    Asistencia confirmada
                </div>
                <p style="color:var(--gray); font-size: 0.95rem; margin-top: 10px;">
                    Nos llena de emoción saber que nos acompañarás. ¡Nos vemos muy pronto!
                </p>
            `;
            lucide.createIcons();
        });

        btnDecline.addEventListener("click", (e) => {
            e.preventDefault();
            rsvpActionContainer.style.display = "none";
            rsvpMessageContainer.style.display = "block";
            rsvpMessageContainer.innerHTML = `
                <div style="display: inline-flex; align-items: center; justify-content: center; gap: 10px; color: var(--gray); font-weight: 600; font-size: 1.1rem;">
                    <i data-lucide="info" style="width: 24px; height: 24px;"></i>
                    Asistencia declinada
                </div>
                <p style="color:var(--gray); font-size: 0.95rem; margin-top: 10px;">
                    Lamentamos que no puedas acompañarnos. Gracias por avisarnos.
                </p>
            `;
            lucide.createIcons();
        });
    }
});