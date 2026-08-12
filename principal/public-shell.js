(() => {
    const initializeLucideIcons = () => {
        if (typeof globalThis.lucide?.createIcons !== "function") return;
        globalThis.lucide.createIcons();
    };

    const initializePublicHeader = () => {
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

    const initializePublicShell = () => {
        initializeLucideIcons();
        initializePublicHeader();
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializePublicShell, { once: true });
    } else {
        initializePublicShell();
    }
})();
