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
    initializeProcessAnimation();
    initializeFeaturesAnimation();
    initializeFaq();
    initializeFloatingWhatsApp();
});

const LOADER_MIN_DURATION = 5000;
const loaderStartedAt = Number(window.EVENTORA_LOADER_STARTED_AT) || performance.now();

const finishLoading = () => {
    const loader = document.getElementById("loader");
    const elapsedTime = performance.now() - loaderStartedAt;
    const remainingTime = Math.max(0, LOADER_MIN_DURATION - elapsedTime);

    window.setTimeout(() => {
        if (loader) {
            loader.classList.add("hide");
            loader.setAttribute("aria-hidden", "true");
        }
        document.body.classList.remove("loading");
        document.body.classList.add("loader-complete");
    }, remainingTime);
};

if (document.readyState === "complete") {
    finishLoading();
} else {
    window.addEventListener("load", finishLoading, { once: true });
}

document.querySelectorAll(".feature-card").forEach(card => {
    card.classList.add("show");
});
