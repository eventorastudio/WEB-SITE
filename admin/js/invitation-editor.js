// invitation-editor.js
// Módulo 8: Editor Visual de Invitaciones (Configurador)
import { db } from './firebase.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { updatePreview } from './invitation-preview.js';
import { ui } from './core/ui.js';

let editorEventId = null;
let editorEventName = '';
let configState = null;
let saveTimeout = null;
let hasUnsavedChanges = false;

// Estado por defecto
const DEFAULT_CONFIG = {
    tema: "Luxury",
    colores: { principal: "#D4AF37", secundario: "#111111", fondo: "#FCFBF8", texto: "#111111", botones: "#D4AF37", acento: "#EED57B" },
    tipografias: { titulo: "Cormorant Garamond", texto: "Poppins", botones: "Poppins" },
    portada: { imagen: "https://images.unsplash.com/photo-1519741497674-611481863552?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" },
    logo: { imagen: "" },
    musica: { url: "" },
    contador: { activo: true, color: "#D4AF37", formato: "dias_horas_min" },
    secciones: [
        { id: "portada", nombre: "Portada", activa: true, orden: 1 },
        { id: "bienvenida", nombre: "Bienvenida", activa: true, orden: 2 },
        { id: "historia", nombre: "Nuestra Historia", activa: false, orden: 3 },
        { id: "cronograma", nombre: "Cronograma", activa: true, orden: 4 },
        { id: "ubicacion", nombre: "Ubicación", activa: true, orden: 5 },
        { id: "dressCode", nombre: "Dress Code", activa: true, orden: 6 },
        { id: "regalos", nombre: "Mesa de Regalos", activa: true, orden: 7 },
        { id: "rsvp", nombre: "Confirmación (RSVP)", activa: true, orden: 8 }
    ],
    dressCode: { titulo: "Dress Code", descripcion: "Formal / Etiqueta", color: "#111111" },
    animaciones: { tipo: "fade" },
    botones: { estilo: "solid", bordes: "rounded" }
};

// UI Refs
const badgeUnsaved = document.getElementById('editor-unsaved-badge');
const btnSave = document.getElementById('btn-editor-save');
const btnPublish = document.getElementById('btn-editor-publish');
const btnReset = document.getElementById('btn-editor-reset');

export async function initEditor(eventId, eventName) {
    editorEventId = eventId;
    editorEventName = eventName;
    document.getElementById('editor-event-name').textContent = eventName;

    initAccordions();
    await loadConfigFromFirestore();
    bindInputs();
    renderSectionsList();
    updatePreview(configState, 'live-preview-content', editorEventName);
}

async function loadConfigFromFirestore() {
    try {
        const docRef = doc(db, `eventos/${editorEventId}/configuracion`, 'design');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            configState = { ...DEFAULT_CONFIG, ...snap.data() };
        } else {
            configState = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        }
        populateFormFromState();
        setUnsaved(false);
    } catch (e) {
        console.error("Error cargando diseño", e);
        configState = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
}

function populateFormFromState() {
    document.getElementById('ed-tema').value = configState.tema;
    document.getElementById('ed-animaciones').value = configState.animaciones.tipo;

    document.getElementById('ed-color-principal').value = configState.colores.principal;
    document.getElementById('ed-color-secundario').value = configState.colores.secundario;
    document.getElementById('ed-color-fondo').value = configState.colores.fondo;
    document.getElementById('ed-color-texto').value = configState.colores.texto;
    document.getElementById('ed-color-botones').value = configState.colores.botones;
    document.getElementById('ed-color-acento').value = configState.colores.acento;

    document.getElementById('ed-font-titulo').value = configState.tipografias.titulo;
    document.getElementById('ed-font-texto').value = configState.tipografias.texto;
    document.getElementById('ed-font-botones').value = configState.tipografias.botones;

    document.getElementById('ed-portada-img').value = configState.portada.imagen;
    document.getElementById('ed-logo-img').value = configState.logo.imagen;
    document.getElementById('ed-musica-url').value = configState.musica.url;

    document.getElementById('ed-contador-color').value = configState.contador.color;
    document.getElementById('ed-contador-formato').value = configState.contador.formato;

    document.getElementById('ed-dress-titulo').value = configState.dressCode.titulo;
    document.getElementById('ed-dress-desc').value = configState.dressCode.descripcion;

    document.getElementById('ed-btn-estilo').value = configState.botones.estilo;
    document.getElementById('ed-btn-bordes').value = configState.botones.bordes;
}

function bindInputs() {
    const bind = (id, callback) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', (e) => { callback(e.target.value); triggerChange(); });
    };

    bind('ed-tema', v => configState.tema = v);
    bind('ed-animaciones', v => configState.animaciones.tipo = v);

    bind('ed-color-principal', v => configState.colores.principal = v);
    bind('ed-color-secundario', v => configState.colores.secundario = v);
    bind('ed-color-fondo', v => configState.colores.fondo = v);
    bind('ed-color-texto', v => configState.colores.texto = v);
    bind('ed-color-botones', v => configState.colores.botones = v);
    bind('ed-color-acento', v => configState.colores.acento = v);

    bind('ed-font-titulo', v => configState.tipografias.titulo = v);
    bind('ed-font-texto', v => configState.tipografias.texto = v);
    bind('ed-font-botones', v => configState.tipografias.botones = v);

    bind('ed-portada-img', v => configState.portada.imagen = v);
    bind('ed-logo-img', v => configState.logo.imagen = v);
    bind('ed-musica-url', v => configState.musica.url = v);

    bind('ed-contador-color', v => configState.contador.color = v);
    bind('ed-contador-formato', v => configState.contador.formato = v);

    bind('ed-dress-titulo', v => configState.dressCode.titulo = v);
    bind('ed-dress-desc', v => configState.dressCode.descripcion = v);

    bind('ed-btn-estilo', v => configState.botones.estilo = v);
    bind('ed-btn-bordes', v => configState.botones.bordes = v);

    // Botones Header
    btnSave.addEventListener('click', saveToFirestore);
    btnPublish.addEventListener('click', publishDesign);
    btnReset.addEventListener('click', () => {
        configState = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        populateFormFromState();
        renderSectionsList();
        triggerChange();
    });
}

function triggerChange() {
    setUnsaved(true);
    updatePreview(configState, 'live-preview-content', editorEventName);
    
    // Auto-save debounce (2.5s)
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveToFirestore, 2500);
}

function setUnsaved(status) {
    hasUnsavedChanges = status;
    badgeUnsaved.style.opacity = status ? '1' : '0';
    btnSave.textContent = status ? "Guardar cambios" : "Guardado ✓";
    if(!status) setTimeout(() => { if(!hasUnsavedChanges) btnSave.textContent = "Guardar cambios"; }, 2000);
}

async function saveToFirestore() {
    try {
        const docRef = doc(db, `eventos/${editorEventId}/configuracion`, 'design');
        await setDoc(docRef, configState, { merge: true });
        setUnsaved(false);
    } catch (e) { console.error("Error auto-guardado", e); }
}

async function publishDesign() {
    const orig = btnPublish.innerHTML;
    btnPublish.innerHTML = "Publicando...";
    try {
        await saveToFirestore();
        const eventRef = doc(db, 'eventos', editorEventId);
        await updateDoc(eventRef, {
            fechaPublicacion: serverTimestamp(),
            ultimaActualizacion: serverTimestamp(),
            estadoPublicacion: 'Publicado'
        });
        ui.showToast('Invitación publicada exitosamente.', `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E7E34" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`);
    } catch (e) {
        ui.showToast('Error al publicar.');
    } finally {
        btnPublish.innerHTML = orig;
    }
}

// Interfaz Drag & Drop Secciones
function renderSectionsList() {
    const list = document.getElementById('editor-sections-list');
    list.innerHTML = '';
    
    configState.secciones.sort((a,b) => a.orden - b.orden).forEach((sec, idx) => {
        const li = document.createElement('li');
        li.className = 'sortable-item';
        li.draggable = true;
        li.dataset.index = idx;

        li.innerHTML = `
            <div class="drag-handle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></div>
            <div class="sec-label">${sec.nombre}</div>
            <label class="switch">
                <input type="checkbox" class="sec-toggle" ${sec.activa ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        `;

        li.querySelector('.sec-toggle').addEventListener('change', (e) => {
            configState.secciones[idx].activa = e.target.checked;
            triggerChange();
        });

        // HTML5 D&D
        li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', idx); li.style.opacity = '0.5'; });
        li.addEventListener('dragend', () => { li.style.opacity = '1'; });
        li.addEventListener('dragover', (e) => { e.preventDefault(); });
        li.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
            const droppedIdx = idx;
            if(draggedIdx === droppedIdx) return;
            
            // Reordenar array
            const item = configState.secciones.splice(draggedIdx, 1)[0];
            configState.secciones.splice(droppedIdx, 0, item);
            configState.secciones.forEach((s, i) => s.orden = i + 1);
            
            renderSectionsList();
            triggerChange();
        });

        list.appendChild(li);
    });
}

function initAccordions() {
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isActive = header.classList.contains('active');
            
            // Cerrar otros (opcional, comportamiento acordeón clásico)
            document.querySelectorAll('.accordion-header').forEach(h => { h.classList.remove('active'); h.nextElementSibling.style.display = 'none'; });
            
            if(!isActive) {
                header.classList.add('active');
                content.style.display = 'block';
            }
        });
    });
}