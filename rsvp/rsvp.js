import { publicRsvpAccessLoader } from './services/rsvp-access-loader.js';

const card = document.getElementById('rsvp-card');
const title = document.getElementById('rsvp-title');
const message = document.getElementById('rsvp-message');
const summary = document.getElementById('rsvp-access-summary');
const guestName = document.getElementById('rsvp-guest-name');
const passLimit = document.getElementById('rsvp-pass-limit');

const result = await publicRsvpAccessLoader.loadRoute(window.location.search);
if (result.status === 'ready') {
    title.textContent = 'Invitación verificada';
    message.textContent = 'Este acceso RSVP está activo.';
    guestName.textContent = result.access.displayName;
    passLimit.textContent = `${result.access.passLimit} pase(s) asignado(s)`;
    summary.hidden = false;
} else {
    title.textContent = 'Invitación no disponible';
    message.textContent = 'El enlace no es válido, expiró o fue desactivado.';
    summary.hidden = true;
}
card.setAttribute('aria-busy', 'false');
