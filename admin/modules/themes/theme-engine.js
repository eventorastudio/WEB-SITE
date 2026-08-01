// admin/modules/themes/theme-engine.js
/**
 * @fileoverview Motor Puro de Renderizado de Temas para Eventora Studio (Fase 3.14).
 * 
 * Responsabilidad:
 * - Actuar como una biblioteca independiente de funciones puras para interpretar configuraciones y generar estructuras HTML/CSS.
 * - Operar exclusivamente mediante parámetros de entrada y retorno de valores, sin efectos secundarios.
 * 
 * Qué tiene prohibido hacer:
 * - Acceder a state, eventContext, services, ui, eventBus, window, globalThis o variables globales.
 * - Interactuar con Firebase, Firestore, DOM global (document.getElementById, document.querySelector en raíz).
 * - Modificar el estado externo o emitir eventos.
 * 
 * Cómo debe utilizarse:
 * - Importarse en cualquier componente o módulo que requiera transformar un JSON de configuración en código visual estructurado.
 */

/**
 * Genera el marcado CSS completo basado en la configuración de diseño del tema.
 * @param {Object} config - Configuración visual del tema.
 * @returns {string} Bloque de estilos CSS en formato de cadena.
 */
export function generateStyles(config = {}) {
    const primaryColor = config.primaryColor || '#111111';
    const secondaryColor = config.secondaryColor || '#6B7280';
    const fontFamily = config.fontFamily || 'inherit';
    const backgroundColor = config.backgroundColor || '#FFFFFF';

    return `
        .theme-root {
            font-family: ${fontFamily};
            background-color: ${backgroundColor};
            color: ${primaryColor};
            width: 100%;
            min-height: 100vh;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        .theme-accent-color {
            color: ${primaryColor};
        }
        .theme-accent-bg {
            background-color: ${primaryColor};
            color: #FFFFFF;
        }
        .theme-secondary-text {
            color: ${secondaryColor};
        }
    `.trim();
}

/**
 * Renderiza un componente individual de manera pura y determinista.
 * @param {Object} component - Definición del componente (type, props, children).
 * @returns {string} Fragmento HTML correspondiente al componente.
 */
export function renderComponent(component = {}) {
    if (!component || !component.type) return '';

    const type = component.type.toLowerCase();
    const props = component.props || {};
    const text = props.text || component.text || '';
    const customStyle = props.style || '';

    switch (type) {
        case 'header':
        case 'heading':
            return `<h1 class="theme-accent-color" style="${customStyle}">${escapeHtml(text)}</h1>`;
        
        case 'paragraph':
        case 'text':
            return `<p class="theme-secondary-text" style="${customStyle}">${escapeHtml(text)}</p>`;
        
        case 'button':
            return `<button class="theme-accent-bg" style="padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; ${customStyle}">${escapeHtml(text || 'Botón')}</button>`;
        
        case 'divider':
            return `<hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0; ${customStyle}" />`;
        
        case 'container':
        case 'section': {
            const childrenHtml = Array.isArray(component.children) 
                ? component.children.map(child => renderComponent(child)).join('') 
                : '';
            return `<div style="display: flex; flex-direction: column; gap: 12px; ${customStyle}">${childrenHtml}</div>`;
        }

        default:
            return `<div style="${customStyle}">${escapeHtml(text)}</div>`;
    }
}

/**
 * Renderiza una sección completa interpretando su lista de componentes.
 * @param {Object} section - Definición de la sección.
 * @returns {string} Bloque HTML de la sección.
 */
export function renderSection(section = {}) {
    const components = section.components || [];
    const componentsHtml = components.map(comp => renderComponent(comp)).join('');
    const customStyle = section.style || '';

    return `
        <section style="padding: 24px; display: flex; flex-direction: column; gap: 16px; ${customStyle}">
            ${componentsHtml}
        </section>
    `.trim();
}

/**
 * Función principal y pura para transformar una configuración completa de tema en un documento HTML estructurado.
 * @param {Object} config - Configuración maestra del tema.
 * @returns {string} Documento HTML completo renderizado.
 */
export function renderTheme(config = {}) {
    const sections = config.sections || [];
    const sectionsHtml = sections.map(sec => renderSection(sec)).join('');
    const styles = generateStyles(config);

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(config.nombre || 'Invitación')}</title>
            <style>${styles}</style>
        </head>
        <body class="theme-root">
            <main style="max-width: 600px; margin: 0 auto; padding: 20px;">
                ${sectionsHtml || `<h1 class="theme-accent-color">${escapeHtml(config.nombre || 'Mi Evento')}</h1><p class="theme-secondary-text">${escapeHtml(config.descripcion || '')}</p>`}
            </main>
        </body>
        </html>
    `.trim();
}

/**
 * Obtiene una configuración de tema predeterminada por defecto (Pure Function).
 * @returns {Object} POJO con la estructura base de un tema.
 */
export function getDefaultThemeConfig() {
    return {
        nombre: 'Tema Clásico',
        descripcion: 'Diseño elegante y minimalista por defecto.',
        primaryColor: '#111111',
        secondaryColor: '#6B7280',
        backgroundColor: '#FFFFFF',
        fontFamily: 'Inter, sans-serif',
        sections: [
            {
                type: 'header-section',
                components: [
                    { type: 'heading', text: 'Nuestra Boda' },
                    { type: 'paragraph', text: 'Estás cordialmente invitado a celebrar este día especial.' }
                ]
            }
        ]
    };
}

/**
 * Función auxiliar privada pura para sanitizar cadenas de texto contra inyección HTML básica.
 * @private
 * @param {string} str 
 * @returns {string}
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(0, '')
        .replace(/'/g, '&#039;');
}
