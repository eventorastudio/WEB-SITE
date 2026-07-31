// core/state.js
// Módulo para manejar el estado global de la aplicación

export const state = {
    eventId: null,
    eventData: null
};

export function setEventId(id) {
    state.eventId = id;
}

export function setEventData(data) {
    state.eventData = data;
}