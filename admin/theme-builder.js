// theme-builder.js
// Módulo 9: Controlador del Panel de Edición de Temas (Framer-like)

import { db } from './firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { renderTheme, getDefaultThemeConfig } from './theme-engine.js';
import { showToast } from './themes.js';

let currentThemeId = null;
let currentThemeState = null;
let selectedComponent = 'global'; // 'global' o id de sección
let autoSaveTimer = null;

// UI Elements
const builderView = document.getElementById('theme-builder-view');
const libraryView = document.getElementById('theme-library-view');
const btnBack = document.getElementById('builder-btn-back');
const saveStatus = document.getElementById('builder-save-status');
const tbTitle = document.getElementById('builder-theme-title');
const canvasContainer = document.getElementById('builder-canvas-content');
const layersList = document.getElementById('builder-layers-list');
const propsPanel = document.getElementById('builder-props-panel');

export async function openThemeBuilder(themeId) {
    currentThemeId = themeId;
    libraryView.style.display = 'none';
    builderView.style.display = 'flex';
    saveStatus.textContent = "Cargando...";

    if (themeId === 'new') {
        currentThemeState = getDefaultThemeConfig();
        currentThemeId = doc(collection(db, 'themes')).id; // Pre-generar ID
    } else {
        try {
            const snap = await getDoc(doc(db, 'themes', themeId));
            if (snap.exists()) {
                currentThemeState = snap.data();
            } else {
                showToast("Tema no encontrado.");
                closeBuilder();
                return;
            }
        } catch (e) {
            console.error("Error loading theme", e);
        }
    }

    tbTitle.textContent = currentThemeState.nombre;
    selectedComponent = 'global';
    
    initBuilderEvents();
    renderLayersPanel();
    renderPropertiesPanel();
    updateCanvas();
    saveStatus.textContent = "Guardado ✓";
}

function closeBuilder() {
    builderView.style.display = 'none';
    libraryView.style.display = 'block';
    // Recargar galería
    document.dispatchEvent(new Event('reloadThemesGallery'));
}

function initBuilderEvents() {
    btnBack.onclick = closeBuilder;
    
    // Titulo editable
    tbTitle.onclick = () => {
        const newName = prompt("Nombre del Tema:", currentThemeState.nombre);
        if (newName && newName.trim()) {
            currentThemeState.nombre = newName.trim();
            tbTitle.textContent = currentThemeState.nombre;
            triggerAutoSave();
        }
    };
}

function updateCanvas() {
    renderTheme(currentThemeState, 'builder-canvas-content');
}

function triggerAutoSave() {
    saveStatus.textContent = "Guardando...";
    saveStatus.style.color = "var(--color-gray-dark)";
    
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
        try {
            // Version bump
            let v = parseFloat(currentThemeState.version || "1.0");
            currentThemeState.version = (v + 0.1).toFixed(1);
            currentThemeState.fechaActualizacion = serverTimestamp();
            
            await setDoc(doc(db, 'themes', currentThemeId), currentThemeState, { merge: true });
            saveStatus.textContent = "Guardado ✓";
            saveStatus.style.color = "#1E7E34";
        } catch (e) {
            saveStatus.textContent = "Error al guardar";
            saveStatus.style.color = "#D32F2F";
        }
    }, 1500);
}

// ---- COLUMNA IZQUIERDA: CAPAS (Layers) ----
function renderLayersPanel() {
    layersList.innerHTML = `
        <li class="layer-item ${selectedComponent === 'global' ? 'active' : ''}" data-id="global">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>
            <span>Ajustes Globales</span>
        </li>
    `;

    const conf = currentThemeState.configuracion;
    
    conf.ordenSecciones.forEach((secId, index) => {
        const comp = conf.componentes[secId];
        if (!comp) return;

        const li = document.createElement('li');
        li.className = `layer-item ${selectedComponent === secId ? 'active' : ''} ${!comp.activa ? 'disabled' : ''}`;
        li.dataset.id = secId;
        li.draggable = true;

        li.innerHTML = `
            <div class="drag-handle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line></svg></div>
            <span style="flex:1;">${comp.title || secId}</span>
            <button class="layer-visibility" title="Mostrar/Ocultar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${comp.activa ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>' : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'}
                </svg>
            </button>
        `;

        // Selección
        li.addEventListener('click', (e) => {
            if(e.target.closest('.layer-visibility')) return;
            selectedComponent = secId;
            renderLayersPanel();
            renderPropertiesPanel();
        });

        // Visibilidad
        li.querySelector('.layer-visibility').addEventListener('click', () => {
            comp.activa = !comp.activa;
            renderLayersPanel();
            updateCanvas();
            triggerAutoSave();
        });

        // Drag & Drop Nativo
        li.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', index); li.style.opacity = '0.5'; });
        li.addEventListener('dragend', () => { li.style.opacity = '1'; });
        li.addEventListener('dragover', e => e.preventDefault());
        li.addEventListener('drop', e => {
            e.preventDefault();
            const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
            const toIdx = index;
            if (fromIdx === toIdx) return;
            
            const item = conf.ordenSecciones.splice(fromIdx, 1)[0];
            conf.ordenSecciones.splice(toIdx, 0, item);
            
            renderLayersPanel();
            updateCanvas();
            triggerAutoSave();
        });

        layersList.appendChild(li);
    });
}

// ---- COLUMNA DERECHA: PROPIEDADES (Properties) ----
function renderPropertiesPanel() {
    propsPanel.innerHTML = '';
    const conf = currentThemeState.configuracion;

    if (selectedComponent === 'global') {
        const gl = conf.global;
        propsPanel.innerHTML = `
            <div class="prop-section">
                <h4 class="prop-title">Colores Globales</h4>
                ${createColorInput('Color Primario', gl.colores.primary, v => { gl.colores.primary = v; update(); })}
                ${createColorInput('Color Texto', gl.colores.text, v => { gl.colores.text = v; update(); })}
                ${createColorInput('Color Fondo', gl.colores.bg, v => { gl.colores.bg = v; update(); })}
                ${createColorInput('Color Acento', gl.colores.accent, v => { gl.colores.accent = v; update(); })}
            </div>
            <div class="prop-section">
                <h4 class="prop-title">Tipografías</h4>
                ${createSelect('Títulos', gl.tipografias.title, ['Cormorant Garamond', 'Playfair Display', 'Montserrat'], v => { gl.tipografias.title = v; update(); })}
                ${createSelect('Textos', gl.tipografias.body, ['Poppins', 'Lato', 'Montserrat'], v => { gl.tipografias.body = v; update(); })}
            </div>
            <div class="prop-section">
                <h4 class="prop-title">Estructura</h4>
                ${createInput('Radio (Bordes)', gl.radius, v => { gl.radius = v; update(); })}
                ${createInput('Espaciado', gl.spacing, v => { gl.spacing = v; update(); })}
            </div>
        `;
    } else {
        const comp = conf.componentes[selectedComponent];
        if (!comp) return;

        let html = `<div class="prop-section"><h4 class="prop-title">Propiedades: ${selectedComponent.toUpperCase()}</h4>`;
        
        // Propiedades genéricas iteradas inteligentemente
        if ('title' in comp) html += createInput('Título', comp.title, v => { comp.title = v; update(); });
        if ('pretitle' in comp) html += createInput('Pre-Título', comp.pretitle, v => { comp.pretitle = v; update(); });
        if ('text' in comp) html += createTextarea('Texto', comp.text, v => { comp.text = v; update(); });
        if ('bgImage' in comp) html += createInput('URL Imagen Fondo', comp.bgImage, v => { comp.bgImage = v; update(); });
        if ('image' in comp) html += createInput('URL Imagen', comp.image, v => { comp.image = v; update(); });
        if ('bg' in comp) html += createColorInput('Color Fondo', comp.bg, v => { comp.bg = v; update(); }, true);
        if ('textColor' in comp) html += createColorInput('Color Texto', comp.textColor, v => { comp.textColor = v; update(); });

        html += `</div>`;
        propsPanel.innerHTML = html;
    }

    // Funciones auxiliares de UI en el panel
    function update() { updateCanvas(); triggerAutoSave(); }

    function createInput(label, val, callback) {
        const id = 'prop_' + Math.random().toString(36).substr(2, 5);
        setTimeout(() => document.getElementById(id).addEventListener('input', e => callback(e.target.value)), 0);
        return `<div class="prop-group"><label>${label}</label><input type="text" id="${id}" class="prop-input" value="${val || ''}"></div>`;
    }

    function createTextarea(label, val, callback) {
        const id = 'prop_' + Math.random().toString(36).substr(2, 5);
        setTimeout(() => document.getElementById(id).addEventListener('input', e => callback(e.target.value)), 0);
        return `<div class="prop-group"><label>${label}</label><textarea id="${id}" class="prop-input" rows="3">${val || ''}</textarea></div>`;
    }

    function createColorInput(label, val, callback, allowTransparent=false) {
        const id = 'prop_' + Math.random().toString(36).substr(2, 5);
        const idText = id + '_txt';
        setTimeout(() => {
            const inp = document.getElementById(id);
            const txt = document.getElementById(idText);
            inp.addEventListener('input', e => { txt.value = e.target.value; callback(e.target.value); });
            txt.addEventListener('input', e => { inp.value = e.target.value; callback(e.target.value); });
        }, 0);
        
        let hexVal = val;
        // Si el valor viene como rgba y se intenta usar color picker nativo, se romperá, usamos text input de fallback
        const isRgba = val && val.startsWith('rgb');

        return `
            <div class="prop-group color-prop-group">
                <label>${label}</label>
                <div class="color-picker-ui">
                    ${!isRgba ? `<input type="color" id="${id}" value="${val}">` : `<div style="width:24px;height:24px;background:${val};border-radius:4px;border:1px solid #ddd;"></div><input type="hidden" id="${id}">`}
                    <input type="text" id="${idText}" value="${val}" class="prop-input-sm">
                </div>
            </div>`;
    }

    function createSelect(label, val, options, callback) {
        const id = 'prop_' + Math.random().toString(36).substr(2, 5);
        setTimeout(() => document.getElementById(id).addEventListener('change', e => callback(e.target.value)), 0);
        let opts = options.map(o => `<option value="${o}" ${o===val?'selected':''}>${o}</option>`).join('');
        return `<div class="prop-group"><label>${label}</label><select id="${id}" class="prop-select">${opts}</select></div>`;
    }
}