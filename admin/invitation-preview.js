// invitation-preview.js
// Módulo 8: Motor de Renderizado en Tiempo Real de la Invitación

export function updatePreview(state, containerId, eventName) {
    const container = document.getElementById(containerId);
    if (!container || !state) return;

    // Generar CSS Variables inyectables basadas en la configuración
    const cssVars = `
        --prev-main: ${state.colores.principal};
        --prev-sec: ${state.colores.secundario};
        --prev-bg: ${state.colores.fondo};
        --prev-text: ${state.colores.texto};
        --prev-btn-bg: ${state.colores.botones};
        --prev-accent: ${state.colores.acento};
        
        --prev-font-title: '${state.tipografias.titulo}', serif;
        --prev-font-text: '${state.tipografias.texto}', sans-serif;
        --prev-font-btn: '${state.tipografias.botones}', sans-serif;
    `;

    let btnClass = 'prev-btn';
    btnClass += state.botones.estilo === 'solid' ? ' s-solid' : ' s-outline';
    
    if(state.botones.bordes === 'rounded') btnClass += ' b-rounded';
    else if(state.botones.bordes === 'pill') btnClass += ' b-pill';
    else btnClass += ' b-square';

    // Generador de Bloques HTML según la sección
    const renderBlocks = {
        portada: () => `
            <div class="prev-portada" style="background-image: url('${state.portada.imagen || ''}');">
                <div class="prev-portada-content">
                    <div style="font-size:0.8rem; letter-spacing:2px; text-transform:uppercase; margin-bottom:10px;">¡Nos Casamos!</div>
                    <h1 class="prev-title" style="font-size:3.5rem; margin-bottom:0;">${eventName}</h1>
                </div>
            </div>
        `,
        bienvenida: () => `
            <div class="prev-section" style="background-color: var(--prev-bg);">
                <h2 class="prev-title">Bienvenidos</h2>
                <p class="prev-text">Nos llena de alegría invitarte a celebrar con nosotros este día tan especial.</p>
                ${state.logo.imagen ? `<img src="${state.logo.imagen}" style="max-width:100px; margin-top:20px;">` : ''}
            </div>
        `,
        historia: () => `
            <div class="prev-section" style="background-color: rgba(0,0,0,0.03);">
                <h2 class="prev-title">Nuestra Historia</h2>
                <p class="prev-text">Cada momento ha sido mágico. Estamos listos para el siguiente paso.</p>
            </div>
        `,
        cronograma: () => `
            <div class="prev-section" style="background-color: var(--prev-bg);">
                <h2 class="prev-title">Cronograma</h2>
                <p class="prev-text" style="font-weight:600; margin-bottom:5px;">Ceremonia - 5:00 PM</p>
                <p class="prev-text">Templo Principal</p>
                <p class="prev-text" style="font-weight:600; margin-top:15px; margin-bottom:5px;">Recepción - 7:00 PM</p>
                <p class="prev-text">Salón de Eventos</p>
            </div>
        `,
        ubicacion: () => `
            <div class="prev-section" style="background-color: rgba(0,0,0,0.03);">
                <h2 class="prev-title">Ubicación</h2>
                <p class="prev-text">Te esperamos para celebrar juntos.</p>
                <a href="#" class="${btnClass}">Ver en el Mapa</a>
            </div>
        `,
        dressCode: () => `
            <div class="prev-section" style="background-color: var(--prev-bg);">
                <div style="font-size:2rem; color:var(--prev-main); margin-bottom:10px;">👗</div>
                <h2 class="prev-title">${state.dressCode.titulo}</h2>
                <p class="prev-text">${state.dressCode.descripcion}</p>
            </div>
        `,
        regalos: () => `
            <div class="prev-section" style="background-color: rgba(0,0,0,0.03);">
                <h2 class="prev-title">Mesa de Regalos</h2>
                <p class="prev-text">Tu presencia es nuestro mejor regalo, pero si deseas tener un detalle:</p>
                <a href="#" class="${btnClass}">Ver opciones</a>
            </div>
        `,
        rsvp: () => `
            <div class="prev-section" style="background-color: var(--prev-bg); padding-bottom: 60px;">
                <h2 class="prev-title">Confirmación</h2>
                <p class="prev-text">Por favor, confirma tu asistencia antes del evento.</p>
                <a href="#" class="${btnClass}">Confirmar Asistencia</a>
            </div>
        `
    };

    // Ensamblar HTML
    let html = `<div class="preview-wrapper theme-${state.tema.toLowerCase()}" style="${cssVars}">`;
    
    // Secciones Ordenadas y Activas
    const activeSections = state.secciones.filter(s => s.activa).sort((a,b) => a.orden - b.orden);
    
    activeSections.forEach(sec => {
        if (renderBlocks[sec.id]) {
            // Aplicar animación genérica al bloque (simulada)
            let animStyle = '';
            if(state.animaciones.tipo === 'fade') animStyle = 'opacity:0.9; transform:translateY(5px);';
            
            html += `<div style="${animStyle}">${renderBlocks[sec.id]()}</div>`;
        }
    });

    html += `</div>`;
    container.innerHTML = html;
}