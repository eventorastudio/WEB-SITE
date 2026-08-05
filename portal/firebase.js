// El portal reutiliza la única inicialización de Firebase del proyecto.
// Este puente no reexporta servicios ADMIN ni permisos administrativos.
export { app, appCheck, auth, db } from '../admin/firebase.js';
