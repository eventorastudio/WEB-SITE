document.addEventListener("DOMContentLoaded", () => {
    const initializeProcessAnimation = () => {
        const section = document.querySelector(".process");
        const timeline = document.querySelector(".timeline-line");
        const cards = document.querySelectorAll(".process-card");

        if (!section || !timeline || !cards.length) return;

        const revealProcess = () => {
            timeline.classList.add("animate-line");

            cards.forEach((card, index) => {
                window.setTimeout(() => {
                    card.classList.add("show");
                }, index * 250);
            });
        };

        if (!("IntersectionObserver" in window)) {
            revealProcess();
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                revealProcess();
                observer.unobserve(section);
            });
        }, { threshold: 0.35 });

        observer.observe(section);
    };

    const initializeFeaturesAnimation = () => {
        const section = document.querySelector(".features");
        const cards = document.querySelectorAll(".feature-card");

        if (!section || !cards.length) return;

        const revealFeatures = () => {
            cards.forEach((card, index) => {
                window.setTimeout(() => {
                    card.classList.add("show");
                }, index * 120);
            });
        };

        if (!("IntersectionObserver" in window)) {
            revealFeatures();
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                revealFeatures();
                observer.unobserve(section);
            });
        }, { threshold: 0.2 });

        observer.observe(section);
    };

    const initializeFaq = () => {
        const faqItems = document.querySelectorAll(".faq-item");

        const setAnswerState = (item, isOpen) => {
            const answer = item.querySelector(".faq-answer");
            const button = item.querySelector(".faq-question");

            if (!answer || !button) return;

            item.classList.toggle("active", isOpen);
            button.setAttribute("aria-expanded", String(isOpen));
            answer.style.maxHeight = isOpen ? `${answer.scrollHeight}px` : "";
        };

        faqItems.forEach((item) => {
            const button = item.querySelector(".faq-question");

            if (!button) return;

            setAnswerState(item, item.classList.contains("active"));

            button.addEventListener("click", () => {
                const willOpen = !item.classList.contains("active");

                faqItems.forEach((faqItem) => {
                    setAnswerState(faqItem, faqItem === item && willOpen);
                });
            });
        });

        window.addEventListener("resize", () => {
            faqItems.forEach((item) => {
                if (item.classList.contains("active")) {
                    setAnswerState(item, true);
                }
            });
        });
    };

    const initializeMobileMenu = () => {
        const header = document.querySelector("header");
        const toggle = document.querySelector(".menu-toggle");
        const navigation = document.querySelector("#primary-navigation");
        const backdrop = document.querySelector(".menu-backdrop");
        const logo = header ? header.querySelector(".logo") : null;

        if (!header || !toggle || !navigation || !backdrop) return;

        const mobileQuery = window.matchMedia("(max-width: 768px)");
        const closeMenu = () => {
            header.classList.remove("menu-open");
            toggle.classList.remove("is-active");
            toggle.setAttribute("aria-expanded", "false");
            toggle.setAttribute("aria-label", "Abrir menú de navegación");
            document.body.classList.remove("menu-open");
            backdrop.classList.remove("is-active");
        };

        const setMenuState = (isOpen) => {
            if (!mobileQuery.matches) {
                closeMenu();
                return;
            }

            header.classList.toggle("menu-open", isOpen);
            toggle.classList.toggle("is-active", isOpen);
            toggle.setAttribute("aria-expanded", String(isOpen));
            toggle.setAttribute("aria-label", isOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación");
            document.body.classList.toggle("menu-open", isOpen);
            backdrop.classList.toggle("is-active", isOpen);
        };

        toggle.addEventListener("click", () => {
            setMenuState(!header.classList.contains("menu-open"));
        });

        navigation.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", closeMenu);
        });

        if (logo) logo.addEventListener("click", closeMenu);

        backdrop.addEventListener("click", closeMenu);

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeMenu();
        });

        const handleBreakpointChange = () => {
            if (!mobileQuery.matches) closeMenu();
        };

        if (mobileQuery.addEventListener) {
            mobileQuery.addEventListener("change", handleBreakpointChange);
        } else {
            mobileQuery.addListener(handleBreakpointChange);
        }
    };

    const initializeFloatingWhatsApp = () => {
        const button = document.querySelector(".whatsapp-float");

        if (!button) return;

        const mobileQuery = window.matchMedia("(max-width: 768px)");
        let lastScrollPosition = window.scrollY;
        let isTicking = false;

        const updateVisibility = () => {
            const currentScrollPosition = Math.max(window.scrollY, 0);

            if (!mobileQuery.matches) {
                button.classList.remove("is-hidden");
                lastScrollPosition = currentScrollPosition;
                isTicking = false;
                return;
            }

            if (Math.abs(currentScrollPosition - lastScrollPosition) >= 8) {
                const isScrollingDown = currentScrollPosition > lastScrollPosition;
                button.classList.toggle("is-hidden", isScrollingDown && currentScrollPosition > 120);
                lastScrollPosition = currentScrollPosition;
            }

            isTicking = false;
        };

        window.addEventListener("scroll", () => {
            if (isTicking) return;

            isTicking = true;
            window.requestAnimationFrame(updateVisibility);
        }, { passive: true });

        const handleBreakpointChange = () => updateVisibility();

        if (mobileQuery.addEventListener) {
            mobileQuery.addEventListener("change", handleBreakpointChange);
        } else {
            mobileQuery.addListener(handleBreakpointChange);
        }
    };

    initializeProcessAnimation();
    initializeFeaturesAnimation();
    initializeFaq();
    initializeMobileMenu();
    initializeFloatingWhatsApp();
});

document.body.classList.add("loading");

const finishLoading = () => {
    const loader = document.getElementById("loader");

    window.setTimeout(() => {
        if (loader) loader.classList.add("hide");
        document.body.classList.remove("loading");
    }, 1000);
};

if (document.readyState === "complete") {
    finishLoading();
} else {
    window.addEventListener("load", finishLoading, { once: true });
}
