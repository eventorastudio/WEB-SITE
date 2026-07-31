// themes.js
// Módulo 9: Controlador de la Galería y Sistema de Temas (CRUD, Import/Export)

import { auth, db } from './firebase.js';
import { CONFIG } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { openThemeBuilder } from './theme-builder.js';
import { ui } from './core/ui.js';

const authGuard = document.getElementById('auth-guard');
const themesGrid = document.getElementById('themes-grid');
const searchInput = document.getElementById('theme-search');
const filterCat = document.getElementById('theme-category');
const btnCreateTheme = document.getElementById('btn-create-theme');
const btnImportTheme = document.getElementById('btn-import-theme');
const importFileInput = document.getElementById('theme-import-file');

let globalThemes = [];

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = CONFIG.LOGOUT_REDIRECT; return; }
    authGuard.style.opacity = '0';
    setTimeout(() => authGuard.style.display = 'none', 600);
    
    initLibraryEvents();
    await loadThemes();
});

function initLibraryEvents() {
    // Menu
    document.getElementById('ui-logo').src = CONFIG.LOGO;
    document.getElementById('btn-back-dash').addEventListener('click', () => window.location.href = 'dashboard.html');

    // Filters
    searchInput.addEventListener('input', renderThemes);
    filterCat.addEventListener('change', renderThemes);

    // Actions
    btnCreateTheme.addEventListener('click', () => openThemeBuilder('new'));
    
    // Import
    btnImportTheme.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', handleImportJSON);

    // Escuchar evento de recarga desde el builder
    document.addEventListener('reloadThemesGallery', loadThemes);
}

async function loadThemes() {
    try {
        const querySnapshot = await getDocs(collection(db, 'themes'));
        globalThemes = [];
        querySnapshot.forEach(doc => {
            globalThemes.push({ id: doc.id, ...doc.data() });
        });
        renderThemes();
    } catch (e) {
        console.error("Error loading themes:", e);
        themesGrid.innerHTML = `<p style="color:red;">Error de conexión.</p>`;
    }
}

function renderThemes() {
    const searchVal = searchInput.value.toLowerCase();
    const catVal = filterCat.value;

    const filtered = globalThemes.filter(t => {
        const matchName = (t.nombre || '').toLowerCase().includes(searchVal);
        const matchCat = catVal === 'all' || t.categoria === catVal;
        return matchName && matchCat;
    });

    themesGrid.innerHTML = '';
    
    if (filtered.length === 0) {
        themesGrid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 60px; color: var(--color-gray-dark);">No se encontraron temas.</div>`;
        return;
    }

    filtered.forEach((t, i) => {
        const card = document.createElement('div');
        card.className = 'theme-card';
        card.style.animationDelay = `${i * 0.05}s`;

        // Colores de preview basados en config
        const pColor = t.configuracion?.global?.colores?.primary || '#D4AF37';
        const bg = t.configuracion?.global?.colores?.bg || '#FCFBF8';

        card.innerHTML = `
            <div class="theme-preview" style="background: ${bg}; border-bottom: 1px solid var(--color-border);">
                <div style="width: 50%; height: 60%; background: ${pColor}; border-radius: 8px 8px 0 0; margin-top: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
                <div class="theme-version">v${t.version || '1.0'}</div>
            </div>
            <div class="theme-info">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h3 class="theme-name">${t.nombre}</h3>
                        <span class="theme-cat">${t.categoria || 'Personalizado'}</span>
                    </div>
                    <button class="btn-icon-sm theme-menu-btn" data-id="${t.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                    </button>
                </div>
            </div>
            <div class="theme-hover-actions">
                <button class="btn-primary btn-edit-theme" data-id="${t.id}">Editar Tema</button>
                <div class="theme-action-icons">
                    <button class="btn-circle btn-dup-theme" title="Duplicar" data-id="${t.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                    <button class="btn-circle btn-exp-theme" title="Exportar JSON" data-id="${t.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
                    <button class="btn-circle btn-del-theme" title="Eliminar" data-id="${t.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D32F2F" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div>
            </div>
        `;

        // Bindings
        card.querySelector('.btn-edit-theme').addEventListener('click', () => openThemeBuilder(t.id));
        card.querySelector('.btn-dup-theme').addEventListener('click', () => duplicateTheme(t));
        card.querySelector('.btn-exp-theme').addEventListener('click', () => exportTheme(t));
        card.querySelector('.btn-del-theme').addEventListener('click', () => deleteTheme(t.id));

        themesGrid.appendChild(card);
    });
}

// ---- Funciones Base ----

async function duplicateTheme(theme) {
    const newTheme = JSON.parse(JSON.stringify(theme));
    delete newTheme.id;
    newTheme.nombre = `${newTheme.nombre} (Copia)`;
    newTheme.fechaCreacion = serverTimestamp();
    newTheme.fechaActualizacion = serverTimestamp();

    try {
        const newDocRef = doc(collection(db, 'themes'));
        await setDoc(newDocRef, newTheme);
        ui.showToast("Tema duplicado exitosamente.");
        loadThemes();
    } catch (e) { console.error(e); }
}

async function deleteTheme(id) {
    // Implementación elegante sin confirm()
    if(window.confirm("¿Seguro que deseas eliminar este tema de forma permanente?")) {
        try {
            await deleteDoc(doc(db, 'themes', id));
            ui.showToast("Tema eliminado.");
            loadThemes();
        } catch(e) { console.error(e); }
    }
}

function exportTheme(theme) {
    const exportData = JSON.parse(JSON.stringify(theme));
    delete exportData.id; // No exportar ID interno
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `theme_${theme.nombre.replace(/\s+/g, '_')}.json`);
    dlAnchorElem.click();
}

function handleImportJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const importedTheme = JSON.parse(event.target.result);
            if (!importedTheme.configuracion) throw new Error("Estructura inválida");
            
            importedTheme.nombre = importedTheme.nombre ? `${importedTheme.nombre} (Importado)` : 'Tema Importado';
            importedTheme.fechaCreacion = serverTimestamp();
            importedTheme.fechaActualizacion = serverTimestamp();

            const newDocRef = doc(collection(db, 'themes'));
            await setDoc(newDocRef, importedTheme);
            
            ui.showToast("Tema importado exitosamente.");
            loadThemes();
        } catch (err) {
            console.error(err);
            alert("El archivo no es un tema válido de Eventora Studio.");
        } finally {
            importFileInput.value = ''; // Reset input
        }
    };
    reader.readAsText(file);
}