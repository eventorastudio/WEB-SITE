import { THEME_REGISTRY } from '../core/theme-registry.js?v=phase1-desktop-20260813';

function createThemeCard(theme, state) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-card';
    button.dataset.themeId = theme.id;
    button.setAttribute('aria-pressed', 'false');

    const visual = document.createElement('span');
    visual.className = `theme-card-cover theme-card-cover--${theme.id}`;
    visual.style.setProperty('--theme-a', theme.palette[0]);
    visual.style.setProperty('--theme-b', theme.palette[1]);
    if (theme.cover) {
        const image = document.createElement('img');
        image.src = theme.cover;
        image.alt = '';
        image.loading = 'lazy';
        visual.append(image);
    } else {
        const monogram = document.createElement('span');
        monogram.textContent = 'Aa';
        visual.append(monogram);
    }

    const status = document.createElement('span');
    status.className = 'theme-card-status';
    status.textContent = 'Seleccionado';

    const copy = document.createElement('span');
    copy.className = 'theme-card-copy';
    const name = document.createElement('strong');
    const category = document.createElement('small');
    const description = document.createElement('span');
    name.textContent = theme.name;
    category.textContent = theme.category;
    description.textContent = theme.description;
    copy.append(name, category, description);

    button.append(visual, status, copy);
    button.addEventListener('click', () => state.setTheme(theme.id));
    return button;
}

export function initThemeSelector({ container, state }) {
    if (!container || !state) return () => {};
    container.replaceChildren(...THEME_REGISTRY.map((theme) => createThemeCard(theme, state)));

    const render = ({ draft }) => {
        container.querySelectorAll('.theme-card').forEach((card) => {
            const selected = card.dataset.themeId === draft?.themeId;
            card.classList.toggle('is-selected', selected);
            card.setAttribute('aria-pressed', String(selected));
        });
    };

    render(state.getSnapshot());
    return state.subscribe(({ snapshot }) => render(snapshot), { source: 'theme-selector' });
}
