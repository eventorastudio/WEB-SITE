import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { auth } from './firebase.js';

const AUTHORIZED_UID = 'aE9nvEOlExYjYxPfAEnoEt3XIdv2';
const AUTHORIZED_EMAIL = 'ev3ntorastudio@gmail.com';
const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginForm = document.querySelector('#login-form');
const loginStatus = document.querySelector('#login-status');
const frame = document.querySelector('#module-frame');
const modules = { '#prospeccion': '/admin/prospeccion/', '#proyectos': '/proyectos/', '#mensajes': '/mensajes/' };

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); loginStatus.textContent = '';
  const email = document.querySelector('#login-email').value.trim().toLowerCase();
  const password = document.querySelector('#login-password').value;
  if (!email || !password) { loginStatus.textContent = 'Escribe tu correo y contraseña.'; return; }
  const button = loginForm.querySelector('button'); button.disabled = true; button.textContent = 'ENTRANDO...';
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch { loginStatus.textContent = 'No pudimos iniciar sesión con esos datos.'; button.disabled = false; button.textContent = 'ENTRAR'; }
});

document.querySelector('#logout-button').addEventListener('click', () => signOut(auth));
document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => activateModule(button.dataset.module)));
window.addEventListener('hashchange', () => activateModule(location.hash || '#prospeccion', false));
function activateModule(hash, updateUrl = true) {
  const selectedHash = modules[hash] ? hash : '#prospeccion';
  const button = document.querySelector(`[data-module="${selectedHash}"]`);
  document.querySelectorAll('.nav-button').forEach((item) => item.classList.toggle('active', item === button));
  frame.src = modules[selectedHash];
  if (updateUrl && location.hash !== selectedHash) history.replaceState(null, '', `${location.pathname}${location.search}${selectedHash}`);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { loginView.hidden = false; appView.hidden = true; return; }
  const email = user.email?.trim().toLowerCase();
  if (user.uid !== AUTHORIZED_UID || email !== AUTHORIZED_EMAIL) { await signOut(auth); loginStatus.textContent = 'Acceso no autorizado.'; return; }
  loginView.hidden = true; appView.hidden = false; activateModule(location.hash || '#prospeccion', false);
});
