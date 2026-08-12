document.addEventListener("DOMContentLoaded", () => {
    const initializePortfolioFilters = () => {
        const filterGroup = document.querySelector(".portfolio-filters");
        const cards = [...document.querySelectorAll(".portfolio-card[data-event-types]")];
        const result = document.querySelector(".portfolio-results");
        const emptyState = document.querySelector(".portfolio-empty");

        if (!filterGroup || !cards.length || !result || !emptyState) return;

        const buttons = [...filterGroup.querySelectorAll(".portfolio-filter")];
        const applyFilter = (filter) => {
            let visibleCount = 0;

            cards.forEach((card) => {
                const eventTypes = card.dataset.eventTypes.split(/\s+/);
                const isVisible = filter === "todas" || eventTypes.includes(filter);

                card.classList.remove("is-filtered-in");
                card.hidden = !isVisible;
                if (isVisible) window.requestAnimationFrame(() => card.classList.add("is-filtered-in"));
                if (isVisible) visibleCount += 1;
            });

            buttons.forEach((button) => {
                const isActive = button.dataset.filter === filter;
                button.classList.toggle("is-active", isActive);
                button.setAttribute("aria-pressed", String(isActive));
            });

            result.textContent = `${visibleCount} ${visibleCount === 1 ? "colección disponible" : "colecciones disponibles"}`;
            emptyState.hidden = visibleCount !== 0;
        };

        filterGroup.addEventListener("click", (event) => {
            const button = event.target.closest(".portfolio-filter");
            if (!button) return;
            applyFilter(button.dataset.filter);
        });

        filterGroup.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

            const currentIndex = buttons.indexOf(document.activeElement);
            if (currentIndex < 0) return;

            event.preventDefault();
            let nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : currentIndex + (event.key === "ArrowRight" ? 1 : -1);
            nextIndex = (nextIndex + buttons.length) % buttons.length;
            buttons[nextIndex].focus();
        });
    };

    const initializeDemoQr = () => {
        const select = document.querySelector("#demo-qr-select");
        const openButton = document.querySelector("#demo-qr-open");
        const dialog = document.querySelector("#demo-qr-dialog");
        const image = document.querySelector("#demo-qr-image");
        const name = document.querySelector("#demo-qr-name");
        const link = document.querySelector("#demo-qr-link");
        const contact = document.querySelector("#demo-qr-contact");

        if (!select || !openButton || !dialog || !image || !name || !link || !contact) return;

        let libraryPromise;
        const loadLibrary = () => {
            if (typeof globalThis.qrcode === "function") return Promise.resolve();
            if (libraryPromise) return libraryPromise;

            libraryPromise = new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = new URL("vendor/qrcode-generator.js", document.baseURI).href;
                script.onload = () => typeof globalThis.qrcode === "function" ? resolve() : reject(new Error("qr/library-unavailable"));
                script.onerror = () => reject(new Error("qr/library-load-failed"));
                document.head.append(script);
            });
            return libraryPromise;
        };

        openButton.addEventListener("click", async () => {
            const selectedOption = select.options[select.selectedIndex];
            const targetUrl = new URL(select.value, document.baseURI).href;
            const originalLabel = openButton.textContent;

            openButton.disabled = true;
            openButton.textContent = "Preparando QR…";

            try {
                await loadLibrary();
                const qr = globalThis.qrcode(0, "M");
                qr.addData(targetUrl, "Byte");
                qr.make();

                image.src = qr.createDataURL(7, 4);
                image.alt = `Código QR para abrir la colección ${selectedOption.textContent}`;
                name.textContent = selectedOption.textContent;
                link.href = targetUrl;
                const contactMessage = `Hola, vi Eventora Studio y quiero información para mi evento.\n\nTipo de evento: \nFecha aproximada: \nPaquete de interés: \nColección de interés: ${selectedOption.textContent}`;
                contact.href = `https://wa.me/5215638830691?text=${encodeURIComponent(contactMessage)}`;

                if (typeof dialog.showModal === "function") dialog.showModal();
                else dialog.setAttribute("open", "");
            } catch {
                name.textContent = "No fue posible generar el código. Puedes abrir la demostración desde su tarjeta.";
                if (typeof dialog.showModal === "function") dialog.showModal();
                else dialog.setAttribute("open", "");
            } finally {
                openButton.disabled = false;
                openButton.textContent = originalLabel;
            }
        });

        dialog.addEventListener("click", (event) => {
            const bounds = dialog.getBoundingClientRect();
            const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
            if (outside) dialog.close();
        });
    };

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

    initializePortfolioFilters();
    initializeDemoQr();
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
    }, 300);
};

if (document.readyState === "complete") {
    finishLoading();
} else {
    window.addEventListener("load", finishLoading, { once: true });
}

document.querySelectorAll(".feature-card").forEach(card => {
    card.classList.add("show");
});
