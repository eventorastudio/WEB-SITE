const TOAST_LIFETIME = 5000;

export const portalUi = {
    setBusy(button, isBusy, busyLabel = 'Procesando...') {
        if (!button) return;
        if (isBusy) {
            button.dataset.idleLabel ||= button.textContent;
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.textContent = busyLabel;
        } else {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = button.dataset.idleLabel || button.textContent;
        }
    },

    revealPage() {
        document.getElementById('portal-loading')?.setAttribute('hidden', '');
        const content = document.getElementById('portal-content');
        content?.removeAttribute('hidden');
        document.documentElement.dataset.portalReady = 'true';
    },

    showGate({ title, description, actionLabel, onAction, kind = 'denied' }) {
        document.getElementById('portal-loading')?.setAttribute('hidden', '');
        const gate = document.getElementById('portal-gate');
        if (!gate) return;
        gate.replaceChildren();
        const card = document.createElement('section');
        card.className = `gate-card gate-card--${kind}`;
        const eyebrow = document.createElement('span');
        eyebrow.className = 'eyebrow';
        eyebrow.textContent = kind === 'premium' ? 'EVENTORA PRESTIGE' : 'ACCESO PROTEGIDO';
        const heading = document.createElement('h1');
        heading.textContent = title;
        const copy = document.createElement('p');
        copy.textContent = description;
        card.append(eyebrow, heading, copy);
        if (actionLabel && typeof onAction === 'function') {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'button button--primary';
            button.textContent = actionLabel;
            button.addEventListener('click', onAction);
            card.appendChild(button);
        }
        gate.appendChild(card);
        gate.hidden = false;
    },

    toast({ title = '', message, type = 'info' }) {
        let region = document.getElementById('portal-toast-region');
        if (!region) {
            region = document.createElement('div');
            region.id = 'portal-toast-region';
            region.className = 'toast-region';
            region.setAttribute('aria-live', 'polite');
            document.body.appendChild(region);
        }
        const toast = document.createElement('article');
        toast.className = `toast toast--${type}`;
        const strong = document.createElement('strong');
        strong.textContent = title;
        const copy = document.createElement('span');
        copy.textContent = message || '';
        toast.append(strong, copy);
        region.appendChild(toast);
        window.setTimeout(() => toast.remove(), TOAST_LIFETIME);
    },

    openEntryModal({ guest, onSubmit }) {
        this.closeModal();
        const overlay = document.createElement('div');
        overlay.className = 'portal-modal-overlay';
        overlay.id = 'portal-entry-modal';
        overlay.setAttribute('role', 'presentation');
        const dialog = document.createElement('section');
        dialog.className = 'portal-modal';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'portal-entry-title');
        const title = document.createElement('h2');
        title.id = 'portal-entry-title';
        title.textContent = 'Registrar entrada manual';
        const name = document.createElement('p');
        name.className = 'portal-modal__guest';
        name.textContent = `${guest.nombre} · ${guest.pasesDisponibles} pase(s) disponibles`;
        const form = document.createElement('form');
        const label = document.createElement('label');
        label.htmlFor = 'portal-entry-passes';
        label.textContent = 'Pases a registrar';
        const input = document.createElement('input');
        input.id = 'portal-entry-passes';
        input.type = 'number';
        input.min = '1';
        input.max = String(guest.pasesDisponibles);
        input.value = '1';
        input.required = true;
        const actions = document.createElement('div');
        actions.className = 'portal-modal__actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'button button--ghost';
        cancel.textContent = 'Cancelar';
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'button button--primary';
        submit.textContent = 'Registrar entrada';
        cancel.addEventListener('click', () => this.closeModal());
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const passes = Number(input.value);
            if (!Number.isInteger(passes) || passes < 1 || passes > guest.pasesDisponibles) {
                this.toast({ title: 'Cantidad no válida', message: 'Indica una cantidad disponible.', type: 'warning' });
                input.focus();
                return;
            }
            this.setBusy(submit, true, 'Registrando...');
            try {
                const completed = await onSubmit(passes);
                if (completed !== false) this.closeModal();
            } finally {
                this.setBusy(submit, false);
            }
        });
        form.append(label, input, actions);
        actions.append(cancel, submit);
        dialog.append(title, name, form);
        overlay.appendChild(dialog);
        overlay.addEventListener('click', (event) => { if (event.target === overlay) this.closeModal(); });
        document.body.appendChild(overlay);
        input.focus();
    },

    closeModal() {
        document.getElementById('portal-entry-modal')?.remove();
    }
};
