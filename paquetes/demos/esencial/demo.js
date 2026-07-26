/*=========================================
        EVENTORA STUDIO
        DEMO ESENCIAL
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

        if (navigator.vibrate) {

            navigator.vibrate(20);

        }

        setTimeout(() => {

            envelopeScreen.classList.add("hide");

            invitation.classList.remove("hidden");

            invitation.classList.add("show");

            musicButton.classList.add("show");

        }, 1700);
        
        setTimeout(() => {

            music.play().catch(() => {});

        }, 1200);

    });

    /*=====================================
                MÚSICA
    =====================================*/

    let playing = true;

    musicButton.addEventListener("click", () => {

        if (playing) {

            music.pause();

            playing = false;

            musicButton.innerHTML =
                '<i data-lucide="volume-x"></i>';

        } else {

            music.play();

            playing = true;

            musicButton.innerHTML =
                '<i data-lucide="music-2"></i>';

        }

        lucide.createIcons();

    });

    /*=====================================
            CUENTA REGRESIVA
    =====================================*/

    const targetDate = new Date("Nov 15, 2027 18:00:00").getTime();

    function updateCountdown() {

        const now = new Date().getTime();

        const distance = targetDate - now;

        const days =
            Math.floor(distance / (1000 * 60 * 60 * 24));

        const hours =
            Math.floor((distance % (1000 * 60 * 60 * 24))
                / (1000 * 60 * 60));

        const minutes =
            Math.floor((distance % (1000 * 60 * 60))
                / (1000 * 60));

        const seconds =
            Math.floor((distance % (1000 * 60))
                / 1000);

        document.getElementById("days").textContent =
            String(days).padStart(2, "0");

        document.getElementById("hours").textContent =
            String(hours).padStart(2, "0");

        document.getElementById("minutes").textContent =
            String(minutes).padStart(2, "0");

        document.getElementById("seconds").textContent =
            String(seconds).padStart(2, "0");

    }

    updateCountdown();

    setInterval(updateCountdown, 1000);

    /*=====================================
            REVEAL SCROLL
    =====================================*/

    const reveals =
        document.querySelectorAll(".reveal");

    const observer = new IntersectionObserver(entries => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.target.classList.add("active");

            }

        });

    }, {

        threshold: .15

    });

    reveals.forEach(section => {

        observer.observe(section);

    });

    /*=====================================
            BARRA SUPERIOR
    =====================================*/

    window.addEventListener("scroll", () => {

        const scrollTop =
            document.documentElement.scrollTop;

        const height =
            document.documentElement.scrollHeight -
            document.documentElement.clientHeight;

        const progress =
            (scrollTop / height) * 100;

        progressBar.style.width =
            progress + "%";

    });

    /*=====================================
                RSVP
    =====================================*/

    if (rsvpForm) {

        rsvpForm.addEventListener("submit", (e) => {

            e.preventDefault();

            rsvpForm.innerHTML = `

                <div style="
                    text-align:center;
                    padding:30px;
                ">

                    <h3 style="
                        font-family:'Cormorant Garamond';
                        margin-bottom:12px;
                    ">

                        ¡Gracias!

                    </h3>

                    <p>

                        Esta es una demostración.

                        <br><br>

                        En una invitación real,
                        tu confirmación se enviaría
                        automáticamente al anfitrión.

                    </p>

                </div>

            `;

        });

    }

});