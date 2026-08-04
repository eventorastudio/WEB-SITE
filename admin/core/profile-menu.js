// core/profile-menu.js
// Interacción accesible y compartida del menú de perfil del panel Admin.

let cleanupHandlers = [];
let activeMenu = null;
let backdrop = null;

/**
 * Enlaza un único menú de perfil por página sin alterar sus rutas ni acciones.
 * @param {{trigger: HTMLElement|null, menu: HTMLElement|null}} elements
 * @returns {void}
 */
export function initProfileMenu({ trigger, menu }) {
    destroyProfileMenu();
    if (!trigger || !menu) return;

    const menuId = menu.id || `${trigger.id || 'profile-menu'}-dropdown`;
    menu.id = menuId;
    menu.setAttribute('role', 'menu');
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-controls', menuId);

    const menuItems = () => Array.from(menu.querySelectorAll('a[href], button:not([disabled]), [role="menuitem"]'));
    menuItems().forEach((item) => item.setAttribute('role', 'menuitem'));
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

    const setExpanded = (expanded) => {
        trigger.classList.toggle('active', expanded);
        trigger.setAttribute('aria-expanded', String(expanded));
        menu.setAttribute('aria-hidden', String(!expanded));
        menu.inert = !expanded;
    };

    const removeBackdrop = () => {
        backdrop?.remove();
        backdrop = null;
    };

    const close = ({ returnFocus = false } = {}) => {
        if (!trigger.classList.contains('active')) return;
        setExpanded(false);
        removeBackdrop();
        if (returnFocus) trigger.focus();
    };

    const ensureBackdrop = () => {
        if (!isMobile() || backdrop) return;

        backdrop = document.createElement('div');
        backdrop.className = 'profile-menu-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.addEventListener('click', () => close({ returnFocus: true }));
        document.body.appendChild(backdrop);
    };

    const open = ({ focusFirstItem = false } = {}) => {
        setExpanded(true);
        ensureBackdrop();
        if (focusFirstItem) menuItems()[0]?.focus();
    };

    const toggle = () => {
        if (trigger.classList.contains('active')) close();
        else open();
    };

    const onTriggerClick = (event) => {
        event.stopPropagation();
        toggle();
    };

    const onTriggerKeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            open({ focusFirstItem: true });
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            close({ returnFocus: true });
        }
    };

    const onMenuKeydown = (event) => {
        const items = menuItems();
        const currentIndex = items.indexOf(document.activeElement);

        if ((event.key === 'Enter' || event.key === ' ') && document.activeElement?.getAttribute('role') === 'menuitem') {
            const activeItem = document.activeElement;
            if (!['A', 'BUTTON'].includes(activeItem.tagName)) {
                event.preventDefault();
                activeItem.click();
            }
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            close({ returnFocus: true });
            return;
        }

        if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

        event.preventDefault();
        if (event.key === 'Home') items[0].focus();
        else if (event.key === 'End') items.at(-1).focus();
        else {
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const nextIndex = currentIndex < 0
                ? 0
                : (currentIndex + direction + items.length) % items.length;
            items[nextIndex].focus();
        }
    };

    const onDocumentClick = (event) => {
        if (!trigger.contains(event.target)) close();
    };

    const onDocumentKeydown = (event) => {
        if (event.key === 'Escape') close({ returnFocus: true });
    };

    const onResize = () => {
        if (isMobile() && trigger.classList.contains('active')) ensureBackdrop();
        else removeBackdrop();
    };

    trigger.addEventListener('click', onTriggerClick);
    trigger.addEventListener('keydown', onTriggerKeydown);
    menu.addEventListener('keydown', onMenuKeydown);
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeydown);
    window.addEventListener('resize', onResize);

    cleanupHandlers = [
        () => trigger.removeEventListener('click', onTriggerClick),
        () => trigger.removeEventListener('keydown', onTriggerKeydown),
        () => menu.removeEventListener('keydown', onMenuKeydown),
        () => document.removeEventListener('click', onDocumentClick),
        () => document.removeEventListener('keydown', onDocumentKeydown),
        () => window.removeEventListener('resize', onResize)
    ];

    setExpanded(false);
    activeMenu = { removeBackdrop };
}

/** Libera listeners y elementos visuales creados por este controlador. */
export function destroyProfileMenu() {
    activeMenu?.removeBackdrop();
    cleanupHandlers.forEach((cleanup) => cleanup());
    cleanupHandlers = [];
    activeMenu = null;
}
