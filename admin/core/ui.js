// core/ui.js
/**
 * @fileoverview Administrador Central de la Interfaz Gráfica Global (UI Manager) para Eventora Studio.
 * 
 * Responsabilidad:
 * - Centralizar la administración de todos los componentes visuales transversales de la aplicación.
 * - Proveer una API profesional y unificada para Toasts, Modales, Loaders, Confirmaciones, Skeletons, Progress Bars, Empty States y Errores Globales.
 * - Garantizar la encapsulación visual, evitando que los módulos implementen sus propias versiones duplicadas.
 * 
 * Qué administra:
 * - Toast notifications (con tipos, duración, iconos y mensajes personalizados).
 * - Loaders (globales de pantalla completa o locales por contenedor).
 * - Modales dinámicos (apertura, cierre y contenido inyectado).
 * - Diálogos de Confirmación (promesas basadas en acciones de usuario Aceptar/Cancelar).
 * - Barras de Progreso (actualización porcentual y etiquetas descriptivas).
 * - Skeletons (marcadores de posición de carga asociados a contenedores).
 * - Estados Vacíos (Empty States con iconos, títulos, descripciones y llamadas a la acción).
 * - Errores Globales y Notificaciones de advertencia/éxito/información.
 * 
 * Qué tiene prohibido hacer:
 * - Acceder a Firebase o Firestore.
 * - Modificar el State global.
 * - Utilizar el Event Bus.
 * - Acceder a la Capa de Servicios.
 * - Ejecutar lógica de negocio o almacenar datos del sistema.
 * 
 * Cómo debe utilizarse:
 * - Importarse en cualquier módulo u orquestador para invocar métodos visuales estandarizados (ej. ui.showToast({...}), ui.confirm({...})).
 */

class UIManager {
    constructor() {
        /**
         * Almacena referencias a los contenedores de loaders activos por ID o clave.
         * @private
         * @type {Map<string, HTMLElement>}
         */
        this._activeLoaders = new Map();

        /**
         * Contenedor único autogenerado para notificaciones Toast.
         * @private
         * @type {HTMLElement|null}
         */
        this._toastContainer = null;
    }

    /**
     * Obtiene o crea dinámicamente el contenedor flotante para los Toasts en el DOM.
     * @private
     * @returns {HTMLElement}
     */
    _getToastContainer() {
        if (this._toastContainer && document.body.contains(this._toastContainer)) {
            return this._toastContainer;
        }

        this._toastContainer = document.getElementById('toast-container');
        if (!this._toastContainer) {
            this._toastContainer = document.createElement('div');
            this._toastContainer.id = 'toast-container';
            // Estilos base en línea defensivos para garantizar flotación sin romper CSS externo
            Object.assign(this._toastContainer.style, {
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                zIndex: '99999',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                pointerEvents: 'none'
            });
            document.body.appendChild(this._toastContainer);
        }
        return this._toastContainer;
    }

    /**
     * Muestra una notificación flotante (Toast).
     * @param {Object} options - Configuración del toast.
     * @param {string} options.message - Texto del mensaje.
     * @param {('success'|'error'|'warning'|'info')} [options.type='info'] - Tipo visual de toast.
     * @param {number} [options.duration=4000] - Duración en milisegundos.
     * @param {string} [options.title] - Título opcional del toast.
     */
    showToast({ message, type = 'info', duration = 4000, title = '' }) {
        if (!message) return;

        try {
            const container = this._getToastContainer();
            const toast = document.createElement('div');
            
            // Clases semánticas estándar adaptables al diseño existente
            toast.className = `ui-toast ui-toast-${type}`;
            Object.assign(toast.style, {
                pointerEvents: 'auto',
                minWidth: '280px',
                maxWidth: '400px',
                padding: '14px 18px',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                background: '#ffffff',
                color: '#111111',
                borderLeft: `4px solid ${this._getToastColor(type)}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                opacity: '0',
                transform: 'translateY(20px)',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                fontFamily: 'inherit',
                fontSize: '14px'
            });

            if (title) {
                const titleEl = document.createElement('strong');
                titleEl.textContent = title;
                titleEl.style.fontSize = '13px';
                titleEl.style.color = '#333333';
                toast.appendChild(titleEl);
            }

            const msgEl = document.createElement('span');
            msgEl.textContent = message;
            toast.appendChild(msgEl);

            container.appendChild(toast);

            // Trigger de animación de entrada
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            // Temporizador de salida y destrucción
            const timeoutId = setTimeout(() => {
                this.hideToast(toast);
            }, duration);

            // Permitir cierre manual al hacer clic
            toast.addEventListener('click', () => {
                clearTimeout(timeoutId);
                this.hideToast(toast);
            });

        } catch (error) {
            console.warn('[UI Manager] Error defensivo al mostrar Toast:', error);
        }
    }

    /**
     * Oculta y remueve un elemento Toast del DOM con animación de salida.
     * @param {HTMLElement} toastElement 
     */
    hideToast(toastElement) {
        if (!toastElement || !toastElement.parentNode) return;
        try {
            toastElement.style.opacity = '0';
            toastElement.style.transform = 'translateY(10px)';
            setTimeout(() => {
                if (toastElement.parentNode) {
                    toastElement.parentNode.removeChild(toastElement);
                }
            }, 300);
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al ocultar Toast:', error);
        }
    }

    /**
     * Retorna el color de acento lateral según el tipo de Toast.
     * @private
     * @param {string} type 
     * @returns {string}
     */
    _getToastColor(type) {
        switch (type) {
            case 'success': return '#10B981'; // Verde esmeralda
            case 'error': return '#EF4444';   // Rojo alerta
            case 'warning': return '#F59E0B'; // Ámbar
            case 'info': default: return '#3B82F6'; // Azul corporativo
        }
    }

    /**
     * Muestra un indicador de carga (Loader). Soporta loader global o por elemento contenedor.
     * @param {Object} [options]
     * @param {string} [options.containerId] - ID del contenedor específico. Si se omite, es global.
     * @param {string} [options.text='Cargando...'] - Texto descriptivo opcional.
     */
    showLoader({ containerId = null, text = 'Cargando...' } = {}) {
        try {
            if (containerId) {
                const container = document.getElementById(containerId);
                if (!container) {
                    console.warn(`[UI Manager] Contenedor con ID "${containerId}" no encontrado para loader.`);
                    return;
                }
                
                // Asegurar posicionamiento relativo para el overlay del loader
                if (getComputedStyle(container).position === 'static') {
                    container.style.position = 'relative';
                }

                const loaderEl = document.createElement('div');
                loaderEl.className = 'ui-local-loader';
                Object.assign(loaderEl.style, {
                    position: 'absolute',
                    top: '0',
                    left: '0',
                    width: '100%',
                    height: '100%',
                    background: 'rgba(255, 255, 255, 0.8)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: '999',
                    gap: '8px'
                });
                loaderEl.innerHTML = `<div class="ui-spinner"></div>${text ? `<span style="font-size:13px; color:#555;">${text}</span>` : ''}`;
                
                container.appendChild(loaderEl);
                this._activeLoaders.set(containerId, loaderEl);
            } else {
                // Loader Global de pantalla completa
                let globalLoader = document.getElementById('ui-global-loader');
                if (!globalLoader) {
                    globalLoader = document.createElement('div');
                    globalLoader.id = 'ui-global-loader';
                    Object.assign(globalLoader.style, {
                        position: 'fixed',
                        top: '0',
                        left: '0',
                        width: '100vw',
                        height: '100vh',
                        background: 'rgba(15, 23, 42, 0.6)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: '999999',
                        gap: '12px',
                        color: '#ffffff'
                    });
                    globalLoader.innerHTML = `<div class="ui-spinner-large"></div>${text ? `<span id="ui-global-loader-text" style="font-size:14px; font-weight:500;">${text}</span>` : ''}`;
                    document.body.appendChild(globalLoader);
                } else {
                    const textEl = document.getElementById('ui-global-loader-text');
                    if (textEl) textEl.textContent = text;
                    globalLoader.style.display = 'flex';
                }
            }
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al mostrar Loader:', error);
        }
    }

    /**
     * Oculta el loader global o el de un contenedor específico.
     * @param {string} [containerId] 
     */
    hideLoader(containerId = null) {
        try {
            if (containerId) {
                if (this._activeLoaders.has(containerId)) {
                    const loaderEl = this._activeLoaders.get(containerId);
                    if (loaderEl && loaderEl.parentNode) {
                        loaderEl.parentNode.removeChild(loaderEl);
                    }
                    this._activeLoaders.delete(containerId);
                }
            } else {
                const globalLoader = document.getElementById('ui-global-loader');
                if (globalLoader) {
                    globalLoader.style.display = 'none';
                }
            }
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al ocultar Loader:', error);
        }
    }

    /**
     * Muestra un Modal genérico con contenido dinámico.
     * @param {Object} options 
     * @param {string} options.title - Título del modal.
     * @param {string|HTMLElement} options.content - HTML en cadena o nodo DOM.
     * @param {Function} [options.onClose] - Callback al cerrar.
     */
    showModal({ title = '', content = '', onClose = null } = {}) {
        try {
            this.hideModal(); // Cerrar previo si existe

            const modalOverlay = document.createElement('div');
            modalOverlay.id = 'ui-active-modal';
            Object.assign(modalOverlay.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                background: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(3px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '99998',
                opacity: '0',
                transition: 'opacity 0.25s ease'
            });

            const modalBox = document.createElement('div');
            Object.assign(modalBox.style, {
                background: '#ffffff',
                width: '90%',
                maxWidth: '540px',
                borderRadius: '12px',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transform: 'scale(0.95)',
                transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
            });

            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '18px 24px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            });
            header.innerHTML = `<h3 style="margin:0; font-size:18px; font-weight:600; color:#111;">${title}</h3>`;
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            Object.assign(closeBtn.style, {
                background: 'transparent',
                border: 'none',
                fontSize: '16px',
                cursor: 'pointer',
                color: '#6B7280',
                padding: '4px 8px',
                borderRadius: '4px'
            });
            closeBtn.addEventListener('click', () => {
                if (typeof onClose === 'function') onClose();
                this.hideModal();
            });
            header.appendChild(closeBtn);

            const body = document.createElement('div');
            Object.assign(body.style, {
                padding: '24px',
                maxHeight: '70vh',
                overflowY: 'auto',
                fontSize: '14px',
                color: '#374151'
            });

            if (typeof content === 'string') {
                body.innerHTML = content;
            } else if (content instanceof HTMLElement) {
                body.appendChild(content);
            }

            modalBox.appendChild(header);
            modalBox.appendChild(body);
            modalOverlay.appendChild(modalBox);
            document.body.appendChild(modalOverlay);

            // Animación de entrada
            requestAnimationFrame(() => {
                modalOverlay.style.opacity = '1';
                modalBox.style.transform = 'scale(1)';
            });

            // Cerrar al dar clic fuera del cuadro
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    if (typeof onClose === 'function') onClose();
                    this.hideModal();
                }
            });

        } catch (error) {
            console.warn('[UI Manager] Error defensivo al mostrar Modal:', error);
        }
    }

    /**
     * Cierra y destruye el modal activo en pantalla.
     */
    hideModal() {
        try {
            const modalOverlay = document.getElementById('ui-active-modal');
            if (modalOverlay) {
                modalOverlay.style.opacity = '0';
                setTimeout(() => {
                    if (modalOverlay.parentNode) {
                        modalOverlay.parentNode.removeChild(modalOverlay);
                    }
                }, 250);
            }
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al ocultar Modal:', error);
        }
    }

    /**
     * Muestra un diálogo de confirmación basado en promesas.
     * @param {Object} options 
     * @param {string} options.title - Título de la confirmación.
     * @param {string} options.message - Mensaje o pregunta.
     * @param {string} [options.confirmText='Aceptar'] - Texto del botón de confirmar.
     * @param {string} [options.cancelText='Cancelar'] - Texto del botón de cancelar.
     * @param {boolean} [options.isDanger=false] - Si es acción destructiva (botón rojo).
     * @returns {Promise<boolean>} Resuelve true si acepta, false si cancela.
     */
    confirm({ title = '¿Estás seguro?', message = 'Esta acción no se puede deshacer.', confirmText = 'Aceptar', cancelText = 'Cancelar', isDanger = false } = {}) {
        return new Promise((resolve) => {
            try {
                const contentWrapper = document.createElement('div');
                contentWrapper.style.display = 'flex';
                contentWrapper.style.flexDirection = 'column';
                contentWrapper.style.gap = '20px';

                const textP = document.createElement('p');
                textP.style.margin = '0';
                textP.style.color = '#4B5563';
                textP.style.lineHeight = '1.5';
                textP.textContent = message;
                contentWrapper.appendChild(textP);

                const actionsDiv = document.createElement('div');
                actionsDiv.style.display = 'flex';
                actionsDiv.style.justifyContent = 'flex-end';
                actionsDiv.style.gap = '12px';

                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = cancelText;
                Object.assign(cancelBtn.style, {
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #D1D5DB',
                    background: '#FFFFFF',
                    color: '#374151',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px'
                });
                cancelBtn.addEventListener('click', () => {
                    this.hideModal();
                    resolve(false);
                });

                const confirmBtn = document.createElement('button');
                confirmBtn.textContent = confirmText;
                Object.assign(confirmBtn.style, {
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isDanger ? '#EF4444' : '#111111',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px'
                });
                confirmBtn.addEventListener('click', () => {
                    this.hideModal();
                    resolve(true);
                });

                actionsDiv.appendChild(cancelBtn);
                actionsDiv.appendChild(confirmBtn);
                contentWrapper.appendChild(actionsDiv);

                this.showModal({
                    title,
                    content: contentWrapper,
                    onClose: () => resolve(false)
                });

            } catch (error) {
                console.warn('[UI Manager] Error defensivo en Confirm:', error);
                resolve(false);
            }
        });
    }

    /**
     * Muestra una barra de progreso global o local.
     * @param {Object} [options]
     * @param {number} [options.progress=0] - Porcentaje inicial (0 a 100).
     * @param {string} [options.text='Procesando...'] - Texto descriptivo.
     */
    showProgress({ progress = 0, text = 'Procesando...' } = {}) {
        try {
            let progressModal = document.getElementById('ui-progress-modal');
            if (!progressModal) {
                progressModal = document.createElement('div');
                progressModal.id = 'ui-progress-modal';
                Object.assign(progressModal.style, {
                    position: 'fixed',
                    top: '0',
                    left: '0',
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: '99999'
                });

                const box = document.createElement('div');
                Object.assign(box.style, {
                    background: '#fff',
                    padding: '24px',
                    borderRadius: '12px',
                    width: '360px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                });
                box.innerHTML = `
                    <span id="ui-progress-text" style="font-size:14px; font-weight:500; color:#111;">${text}</span>
                    <div style="width:100%; height:8px; background:#E5E7EB; border-radius:4px; overflow:hidden;">
                        <div id="ui-progress-bar" style="width:${progress}%; height:100%; background:#111111; transition:width 0.2s ease;"></div>
                    </div>
                    <span id="ui-progress-perc" style="font-size:12px; color:#6B7280; text-align:right;">${progress}%</span>
                `;
                progressModal.appendChild(box);
                document.body.appendChild(progressModal);
            } else {
                this.updateProgress({ progress, text });
                progressModal.style.display = 'flex';
            }
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al mostrar Progress:', error);
        }
    }

    /**
     * Actualiza el estado visual de la barra de progreso activa.
     * @param {Object} options 
     * @param {number} options.progress 
     * @param {string} [options.text] 
     */
    updateProgress({ progress = 0, text = '' } = {}) {
        try {
            const bar = document.getElementById('ui-progress-bar');
            const perc = document.getElementById('ui-progress-perc');
            const txt = document.getElementById('ui-progress-text');

            if (bar) bar.style.width = `${Math.min(Math.max(progress, 0), 100)}%`;
            if (perc) perc.textContent = `${progress}%`;
            if (txt && text) txt.textContent = text;
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al actualizar Progress:', error);
        }
    }

    /**
     * Oculta la barra de progreso.
     */
    hideProgress() {
        try {
            const progressModal = document.getElementById('ui-progress-modal');
            if (progressModal) {
                progressModal.style.display = 'none';
            }
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al ocultar Progress:', error);
        }
    }

    /**
     * Muestra un marcador de posición de carga (Skeleton) en un contenedor.
     * @param {string} containerId - ID del contenedor destino.
     * @param {string} [templateHtml] - HTML personalizado para el skeleton.
     */
    showSkeleton(containerId, templateHtml = '') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            const defaultTemplate = `
                <div class="ui-skeleton-pulse" style="width:100%; height:24px; background:#E5E7EB; border-radius:4px; margin-bottom:12px;"></div>
                <div class="ui-skeleton-pulse" style="width:80%; height:16px; background:#E5E7EB; border-radius:4px; margin-bottom:8px;"></div>
                <div class="ui-skeleton-pulse" style="width:60%; height:16px; background:#E5E7EB; border-radius:4px;"></div>
            `;

            container.innerHTML = templateHtml || defaultTemplate;
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al mostrar Skeleton:', error);
        }
    }

    /**
     * Limpia el contenido de Skeleton de un contenedor.
     * @param {string} containerId 
     */
    hideSkeleton(containerId) {
        try {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '';
            }
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al ocultar Skeleton:', error);
        }
    }

    /**
     * Renderiza un Estado Vacío (Empty State) dentro de un contenedor.
     * @param {Object} options 
     * @param {string} options.containerId - ID del contenedor.
     * @param {string} [options.title='No hay elementos'] - Título descriptivo.
     * @param {string} [options.description='No se encontraron registros para mostrar.'] - Descripción.
     * @param {Object} [options.actionButton] - Botón de acción opcional { text: 'Crear', onClick: function }
     */
    showEmptyState({ containerId, title = 'No hay elementos', description = 'No se encontraron registros para mostrar.', actionButton = null } = {}) {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 20px; text-align:center; gap:12px;">
                    <div style="font-size:36px; color:#9CA3AF; margin-bottom:4px;">📂</div>
                    <h4 style="margin:0; font-size:16px; font-weight:600; color:#111;">${title}</h4>
                    <p style="margin:0; font-size:13px; color:#6B7280; max-width:320px;">${description}</p>
                    <div id="ui-empty-action-slot" style="margin-top:8px;"></div>
                </div>
            `;

            if (actionButton && typeof actionButton.onClick === 'function') {
                const slot = container.querySelector('#ui-empty-action-slot');
                if (slot) {
                    const btn = document.createElement('button');
                    btn.textContent = actionButton.text || 'Acción';
                    Object.assign(btn.style, {
                        padding: '8px 16px',
                        background: '#111111',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer'
                    });
                    btn.addEventListener('click', actionButton.onClick);
                    slot.appendChild(btn);
                }
            }
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al mostrar EmptyState:', error);
        }
    }

    /**
     * Muestra una tarjeta o modal de Error Global formal.
     * @param {Object} options 
     * @param {string} options.title - Título del error.
     * @param {string} options.description - Descripción detallada.
     * @param {string} [options.code] - Código opcional de error (ej. ERR_FIREBASE_AUTH).
     * @param {Object} [options.action] - Acción de reintento opcional { text: 'Reintentar', onClick: function }
     */
    showError({ title = 'Ocurrió un error', description = 'Ha fallado una operación en el sistema.', code = '', action = null } = {}) {
        try {
            const content = document.createElement('div');
            content.style.display = 'flex';
            content.style.flexDirection = 'column';
            content.style.gap = '16px';

            content.innerHTML = `
                <div style="display:flex; gap:12px; align-items:flex-start;">
                    <div style="font-size:24px; color:#EF4444;">⚠️</div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span style="font-size:14px; color:#374151; line-height:1.4;">${description}</span>
                        ${code ? `<code style="font-size:11px; background:#F3F4F6; padding:2px 6px; border-radius:4px; width:fit-content; color:#6B7280;">Código: ${code}</code>` : ''}
                    </div>
                </div>
            `;

            if (action && typeof action.onClick === 'function') {
                const btn = document.createElement('button');
                btn.textContent = action.text || 'Reintentar';
                Object.assign(btn.style, {
                    padding: '8px 16px',
                    background: '#EF4444',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    alignSelf: 'flex-end'
                });
                btn.addEventListener('click', () => {
                    this.hideModal();
                    action.onClick();
                });
                content.appendChild(btn);
            }

            this.showModal({ title, content });
        } catch (error) {
            console.warn('[UI Manager] Error defensivo al mostrar showError:', error);
        }
    }
}

// Instancia única exportada (Singleton global defensivo)
export const ui = new UIManager();