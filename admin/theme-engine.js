// theme-engine.js
// Módulo 9: Motor de Renderizado Dinámico de Temas

/**
 * Convierte un objeto de configuración JSON en una vista HTML renderizada.
 * @param {Object} themeConfig - Configuración completa del tema.
 * @param {string} containerId - ID del contenedor destino.
 */
export function renderTheme(themeConfig, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !themeConfig || !themeConfig.configuracion) return;

    const conf = themeConfig.configuracion;
    const global = conf.global || {};
    const colores = global.colores || {};
    const tipografias = global.tipografias || {};
    const componentes = conf.componentes || {};
    const orden = conf.ordenSecciones || [];

    // 1. Generar Variables CSS Dinámicas
    const cssVars = `
        --th-primary: ${colores.primary || '#D4AF37'};
        --th-secondary: ${colores.secondary || '#111111'};
        --th-bg: ${colores.bg || '#FCFBF8'};
        --th-text: ${colores.text || '#111111'};
        --th-accent: ${colores.accent || '#EED57B'};
        
        --th-font-title: '${tipografias.title || 'Cormorant Garamond'}', serif;
        --th-font-body: '${tipografias.body || 'Poppins'}', sans-serif;
        
        --th-radius: ${global.radius || '8px'};
        --th-spacing: ${global.spacing || '40px'};
    `;

    // 2. Definir Bloques Renderizables (Componentes)
    const renderers = {
        portada: (c) => `
            <div style="height: 100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; background: ${c.overlay || 'rgba(0,0,0,0.4)'} url('${c.bgImage || ''}') center/cover; color: ${c.textColor || '#fff'}; text-align:center; padding: 20px;">
                <div style="font-family: var(--th-font-body); letter-spacing: 3px; font-size: 0.85rem; text-transform: uppercase; margin-bottom: 15px;">${c.pretitle || 'Nuestra Boda'}</div>
                <h1 style="font-family: var(--th-font-title); font-size: 3.5rem; margin: 0; line-height: 1;">${c.title || 'Ana & Roberto'}</h1>
            </div>
        `,
        bienvenida: (c) => `
            <div style="padding: var(--th-spacing) 20px; background: var(--th-bg); color: var(--th-text); text-align: center;">
                <h2 style="font-family: var(--th-font-title); font-size: 2.2rem; color: var(--th-primary); margin-bottom: 16px;">${c.title || 'Bienvenidos'}</h2>
                <p style="font-family: var(--th-font-body); font-size: 0.95rem; line-height: 1.6; max-width: 600px; margin: 0 auto;">${c.text || 'Nos llena de alegría invitarte a celebrar con nosotros este día tan especial.'}</p>
            </div>
        `,
        countdown: (c) => `
            <div style="padding: var(--th-spacing) 20px; background: ${c.bg || 'rgba(0,0,0,0.03)'}; text-align: center;">
                <div style="display: flex; justify-content: center; gap: 15px;">
                    <div style="display:flex; flex-direction:column; align-items:center;"><strong style="font-family: var(--th-font-title); font-size:2.5rem; color:var(--th-primary);">124</strong><span style="font-family: var(--th-font-body); font-size:0.75rem; text-transform:uppercase;">Días</span></div>
                    <div style="display:flex; flex-direction:column; align-items:center;"><strong style="font-family: var(--th-font-title); font-size:2.5rem; color:var(--th-primary);">10</strong><span style="font-family: var(--th-font-body); font-size:0.75rem; text-transform:uppercase;">Hrs</span></div>
                    <div style="display:flex; flex-direction:column; align-items:center;"><strong style="font-family: var(--th-font-title); font-size:2.5rem; color:var(--th-primary);">45</strong><span style="font-family: var(--th-font-body); font-size:0.75rem; text-transform:uppercase;">Min</span></div>
                </div>
            </div>
        `,
        historia: (c) => `
            <div style="padding: var(--th-spacing) 20px; background: var(--th-bg); text-align: center;">
                <h2 style="font-family: var(--th-font-title); font-size: 2.2rem; margin-bottom: 20px;">${c.title || 'Nuestra Historia'}</h2>
                <div style="width: 100%; height: 200px; background: #eee url('${c.image || ''}') center/cover; border-radius: var(--th-radius); margin-bottom: 20px;"></div>
                <p style="font-family: var(--th-font-body); font-size: 0.9rem; line-height: 1.6;">${c.text || 'Un pequeño resumen de cómo llegamos hasta aquí.'}</p>
            </div>
        `,
        cronograma: (c) => `
            <div style="padding: var(--th-spacing) 20px; background: ${c.bg || 'rgba(0,0,0,0.03)'}; text-align: center;">
                <h2 style="font-family: var(--th-font-title); font-size: 2.2rem; margin-bottom: 24px;">${c.title || 'Itinerario'}</h2>
                <div style="border-left: 2px solid var(--th-primary); text-align: left; padding-left: 20px; max-width: 300px; margin: 0 auto;">
                    <div style="margin-bottom: 20px;">
                        <strong style="font-family: var(--th-font-title); font-size: 1.2rem; color: var(--th-primary);">17:00 Hrs</strong>
                        <p style="font-family: var(--th-font-body); font-size: 0.9rem; margin: 4px 0 0;">Ceremonia Religiosa</p>
                    </div>
                    <div>
                        <strong style="font-family: var(--th-font-title); font-size: 1.2rem; color: var(--th-primary);">19:00 Hrs</strong>
                        <p style="font-family: var(--th-font-body); font-size: 0.9rem; margin: 4px 0 0;">Recepción y Fiesta</p>
                    </div>
                </div>
            </div>
        `,
        ubicacion: (c) => `
            <div style="padding: var(--th-spacing) 20px; background: var(--th-bg); text-align: center;">
                <h2 style="font-family: var(--th-font-title); font-size: 2.2rem; margin-bottom: 16px;">${c.title || 'Ubicación'}</h2>
                <p style="font-family: var(--th-font-body); font-size: 0.9rem; margin-bottom: 20px;">${c.address || 'Hacienda Eventora, Ciudad.'}</p>
                <button style="background: var(--th-primary); color: #fff; border: none; padding: 12px 24px; border-radius: var(--th-radius); font-family: var(--th-font-body); font-size: 0.85rem; cursor: pointer;">Ver en Mapa</button>
            </div>
        `,
        dressCode: (c) => `
            <div style="padding: var(--th-spacing) 20px; background: ${c.bg || 'rgba(0,0,0,0.03)'}; text-align: center;">
                <div style="font-size: 2.5rem; margin-bottom: 10px;">${c.icon || '👗'}</div>
                <h2 style="font-family: var(--th-font-title); font-size: 2.2rem; margin-bottom: 10px;">${c.title || 'Código de Vestimenta'}</h2>
                <p style="font-family: var(--th-font-body); font-size: 0.95rem;">${c.text || 'Formal / Etiqueta'}</p>
            </div>
        `,
        regalos: (c) => `
            <div style="padding: var(--th-spacing) 20px; background: var(--th-bg); text-align: center;">
                <h2 style="font-family: var(--th-font-title); font-size: 2.2rem; margin-bottom: 16px;">${c.title || 'Mesa de Regalos'}</h2>
                <p style="font-family: var(--th-font-body); font-size: 0.9rem; margin-bottom: 20px;">${c.text || 'El mejor regalo es tu presencia.'}</p>
                <button style="background: transparent; color: var(--th-primary); border: 1px solid var(--th-primary); padding: 12px 24px; border-radius: var(--th-radius); font-family: var(--th-font-body); font-size: 0.85rem; cursor: pointer;">Ver Opciones</button>
            </div>
        `,
        rsvp: (c) => `
            <div style="padding: var(--th-spacing) 20px; background: ${c.bg || 'var(--th-primary)'}; color: ${c.textColor || '#fff'}; text-align: center;">
                <h2 style="font-family: var(--th-font-title); font-size: 2.2rem; margin-bottom: 16px;">${c.title || 'Confirmar Asistencia'}</h2>
                <p style="font-family: var(--th-font-body); font-size: 0.9rem; margin-bottom: 20px;">${c.text || 'Por favor, confírmanos antes del 15 de Octubre.'}</p>
                <button style="background: #fff; color: var(--th-primary); border: none; padding: 14px 30px; border-radius: 30px; font-family: var(--th-font-body); font-weight: 600; font-size: 0.9rem; cursor: pointer;">Confirmar Ahora</button>
            </div>
        `
    };

    // 3. Ensamblar HTML
    let html = `<div class="theme-render-root" style="${cssVars}; font-family: var(--th-font-body); background: var(--th-bg); color: var(--th-text); min-height: 100vh;">`;
    
    orden.forEach(secId => {
        const compConfig = componentes[secId];
        if (compConfig && compConfig.activa && renderers[secId]) {
            html += `<section id="sec-${secId}" class="theme-section" style="position:relative;">`;
            html += renderers[secId](compConfig);
            html += `</section>`;
        }
    });

    html += `</div>`;
    container.innerHTML = html;
}

export function getDefaultThemeConfig() {
    return {
        nombre: "Nuevo Tema",
        descripcion: "Tema personalizado.",
        categoria: "Personalizado",
        version: "1.0",
        configuracion: {
            global: {
                colores: { primary: "#D4AF37", secondary: "#111111", bg: "#FCFBF8", text: "#111111", accent: "#EED57B" },
                tipografias: { title: "Cormorant Garamond", body: "Poppins" },
                radius: "12px",
                spacing: "60px"
            },
            ordenSecciones: ["portada", "bienvenida", "countdown", "cronograma", "ubicacion", "dressCode", "regalos", "rsvp"],
            componentes: {
                portada: { activa: true, bgImage: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80", title: "Ana & Roberto", pretitle: "Nuestra Boda" },
                bienvenida: { activa: true, title: "Bienvenidos", text: "Nos llena de alegría invitarte a celebrar con nosotros este día tan especial." },
                countdown: { activa: true, bg: "rgba(0,0,0,0.03)" },
                historia: { activa: false, title: "Nuestra Historia", text: "", image: "" },
                cronograma: { activa: true, title: "Itinerario" },
                ubicacion: { activa: true, title: "Ubicación", address: "Hacienda Eventora" },
                dressCode: { activa: true, title: "Dress Code", text: "Formal / Etiqueta", icon: "👗" },
                regalos: { activa: true, title: "Mesa de Regalos", text: "Tu presencia es nuestro mejor regalo." },
                rsvp: { activa: true, title: "Asistencia", text: "Confirma antes de la fecha.", bg: "#D4AF37", textColor: "#fff" }
            }
        }
    };
}