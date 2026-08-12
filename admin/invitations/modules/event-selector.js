function eventName(event) {
    return event.nombreEvento || event.nombre || 'Evento sin título';
}

function eventMeta(event) {
    const date = typeof event.fecha === 'string' ? event.fecha.slice(0, 10) : 'Fecha por definir';
    const city = event.ciudad || 'Ciudad por definir';
    const code = event.codigoEvento || event.codigo || event.id;
    return `${date} · ${city} · ${code}`;
}

export function renderEventSelector(container, events, { onSelect } = {}) {
    if (!container) return;
    container.replaceChildren();

    if (!Array.isArray(events) || events.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'builder-empty-state';
        empty.innerHTML = '<strong>No hay eventos disponibles</strong><p>Crea primero un evento desde el Dashboard. El Builder no permite invitaciones huérfanas.</p>';
        container.append(empty);
        return;
    }

    const list = document.createElement('div');
    list.className = 'event-selector-list';

    events.forEach((event) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'event-selector-card';

        const copy = document.createElement('span');
        const title = document.createElement('strong');
        const meta = document.createElement('small');
        const arrow = document.createElement('span');
        title.textContent = eventName(event);
        meta.textContent = eventMeta(event);
        arrow.textContent = '→';
        arrow.setAttribute('aria-hidden', 'true');
        copy.append(title, meta);
        button.append(copy, arrow);
        button.addEventListener('click', () => onSelect?.(event.id));
        list.append(button);
    });

    container.append(list);
}
