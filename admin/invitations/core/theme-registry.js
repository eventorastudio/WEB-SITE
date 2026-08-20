import { PRESTIGE_DEMO_FEATURES } from '../../../principal/demos/prestige-contract.js';

const ALL_DEMO_CAPABILITIES = Object.freeze([...PRESTIGE_DEMO_FEATURES]);
const THEME_APPEARANCE = Object.freeze({
    aloha: { accentColor: { default: '#f45b69' } },
    luxury: { accentColor: { default: '#c8a365' } },
    botanical: { accentColor: { default: '#788a71' } },
    midnight: { accentColor: { default: '#70a4ff' } },
    romance: { accentColor: { default: '#8e3049' } },
    minimal: { accentColor: { default: '#0b0b0b' } },
    celestial: { accentColor: { default: '#d8c08d' } },
    vintage: { accentColor: { default: '#6f2934' } },
    garden: { accentColor: { default: '#b66f76' } },
    champagne: { accentColor: { default: '#aa8650' } },
    'neon-party': { accentColor: { default: '#ff2e91' } }
});

function createTheme(definition) {
    return Object.freeze({
        capabilities: ALL_DEMO_CAPABILITIES,
        ...definition,
        appearance: definition.appearance ?? THEME_APPEARANCE[definition.id] ?? {},
        bindingAdapterId: definition.templatePath ? definition.id : null,
        palette: Object.freeze(definition.palette ?? ['#171513', '#d2b36e'])
    });
}

export const THEME_REGISTRY = Object.freeze([
    createTheme({
        id: 'aloha',
        name: 'Aloha',
        description: 'Color tropical, energía de resort y celebración junto al agua.',
        category: 'XV años · Celebraciones',
        cover: '/principal/demos/assets/images/aloha/aloha-palm-pool.webp',
        templatePath: '/principal/demos/xv-renatta/index.html',
        palette: ['#083b4b', '#f08b5d']
    }),
    createTheme({
        id: 'luxury',
        name: 'Luxury',
        description: 'Editorial black-tie con contraste oscuro y detalles dorados.',
        category: 'Bodas · Celebraciones',
        cover: '/principal/demos/assets/images/luxury/luxury-black-tie-hero.webp',
        templatePath: '/principal/demos/luxury/index.html',
        palette: ['#0d0d0d', '#c8a86b']
    }),
    createTheme({
        id: 'botanical',
        name: 'Botanical',
        description: 'Papel fino, eucalipto y una estética orgánica editorial.',
        category: 'Bodas · Celebraciones',
        cover: '/principal/demos/assets/images/botanical/botanical-eucalyptus-hero.webp',
        templatePath: '/principal/demos/botanical/index.html',
        palette: ['#30463b', '#d9c9a8']
    }),
    createTheme({
        id: 'midnight',
        name: 'Midnight',
        description: 'Azul profundo, luces y ritmo visual después del anochecer.',
        category: 'XV años · Celebraciones',
        cover: '/principal/demos/assets/images/midnight/midnight-blue-dance-hero.webp',
        templatePath: '/principal/demos/midnight/index.html',
        palette: ['#03071a', '#7188ff']
    }),
    createTheme({
        id: 'romance',
        name: 'Romance',
        description: 'Cartas, tonos vino y narrativa íntima para una historia de amor.',
        category: 'Bodas',
        cover: '/principal/demos/assets/images/romance/romance-hands-roses-hero.webp',
        templatePath: '/principal/demos/romance/index.html',
        palette: ['#5a1825', '#e9c7c1']
    }),
    createTheme({
        id: 'minimal',
        name: 'Minimal',
        description: 'Tipografía precisa, blanco y negro, y espacio negativo.',
        category: 'Bodas · XV años · Celebraciones',
        cover: '/principal/demos/assets/images/minimal/minimal-bridal-hero.webp',
        templatePath: '/principal/demos/minimal/index.html',
        palette: ['#111111', '#f3f1ed']
    }),
    createTheme({
        id: 'celestial',
        name: 'Celestial',
        description: 'Luz lunar, constelaciones y una atmósfera azul tinta.',
        category: 'Bodas',
        cover: '/principal/demos/assets/images/celestial/celestial-night-portrait-hero.webp',
        templatePath: '/principal/demos/celestial/index.html',
        palette: ['#07162d', '#d8bd75']
    }),
    createTheme({
        id: 'vintage',
        name: 'Vintage',
        description: 'Papel, película y memoria analógica en una edición clásica.',
        category: 'Bodas · XV años · Celebraciones',
        cover: '/principal/demos/assets/images/vintage/vintage-car-couple-hero.webp',
        templatePath: '/principal/demos/vintage/index.html',
        palette: ['#5c2330', '#e8dcc1']
    }),
    createTheme({
        id: 'garden',
        name: 'Garden',
        description: 'Una celebración floral entre pérgolas, fuentes y primavera.',
        category: 'Bodas',
        cover: '/principal/demos/assets/images/garden/garden-arch-couple-hero.webp',
        templatePath: '/principal/demos/garden/index.html',
        palette: ['#294336', '#d7bd84']
    }),
    createTheme({
        id: 'champagne',
        name: 'Champagne',
        description: 'Seda, cristal y lujo luminoso en una edición cálida.',
        category: 'Bodas · Celebraciones',
        cover: '/principal/demos/assets/images/champagne/champagne-bridal-reflection.webp',
        templatePath: '/principal/demos/champagne/index.html',
        palette: ['#6d5139', '#e0bf86']
    }),
    createTheme({
        id: 'neon-party',
        name: 'Neon Party',
        description: 'Flash, póster y energía de club para una noche protagonista.',
        category: 'XV años · Celebraciones',
        cover: '/principal/demos/assets/images/neon-party/neon-dj-crowd-hero.webp',
        templatePath: '/principal/demos/neon-party/index.html',
        palette: ['#09070e', '#ff2fa8']
    }),
    createTheme({
        id: 'custom',
        name: 'Personalizada',
        description: 'Crea una identidad visual desde una base flexible.',
        category: 'Base flexible · Fase futura',
        cover: null,
        templatePath: null,
        capabilities: Object.freeze(['personalized-design', 'responsive', 'rsvp']),
        palette: ['#171513', '#c9a96a']
    })
]);

export const COLLECTION_THEMES = Object.freeze(THEME_REGISTRY.filter((theme) => theme.id !== 'custom'));

export function getThemeById(themeId) {
    return THEME_REGISTRY.find((theme) => theme.id === themeId) ?? null;
}

export function isKnownTheme(themeId) {
    return Boolean(getThemeById(themeId));
}
