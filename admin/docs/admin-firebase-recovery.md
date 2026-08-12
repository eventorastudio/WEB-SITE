# Recuperación segura de acceso ADMIN

## Request que originaba el mensaje genérico

La versión publicada ejecuta desde `admin/dashboard.js`:

```text
getDocs(query(collection(db, "eventos"), orderBy("fecha", "desc")))
```

Su `catch` convertía cualquier `FirebaseError` en “Error de conexión”, perdiendo
la distinción entre permisos, sesión, App Check, índices y disponibilidad.
Además, `dashboard.html` mostraba “CEO” como texto fijo y `core/roles.js`
convertía la ausencia de claims en CEO. Ninguna de esas etiquetas prueba lo que
Firestore recibe en `request.auth.token`.

La corrección exige un claim firmado antes de consultar Firestore y registra:

```javascript
console.error('[Admin Firebase]', {
  code: error?.code,
  message: error?.message,
  stack: error?.stack,
  operation,
  collection
});
```

El stack solo aparece en consola; la interfaz recibe un mensaje clasificado.

## Auditar claims sin escribir

Configura credenciales Admin SDK en tu terminal segura y ejecuta:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='C:\ruta\service-account.json'
node scripts/manage-admin-claims.mjs <correo-o-uid> --role CEO
```

El modo predeterminado es dry-run. Muestra únicamente `role` y `userRole`, no el
ID token completo.

## Asignar el claim si está ausente

Después de revisar el dry-run:

```powershell
node scripts/manage-admin-claims.mjs <correo-o-uid> --role CEO --apply
```

La herramienta pide escribir exactamente `ASIGNAR ROL CEO A <uid>`, conserva
otros claims y asigna tanto `role` como `userRole` para compatibilidad con las
reglas descritas. Después hay que cerrar sesión e iniciar sesión para renovar el
ID token.

Nunca ejecutes esta herramienta con una credencial descargada dentro de una
carpeta pública ni subas esa credencial al repositorio.

## Verificación posterior al despliegue

1. Abrir DevTools y recargar `admin/dashboard.html`.
2. Confirmar que no aparece `[Admin Firebase]`.
3. Si aparece, registrar `code`, `message`, `operation` y `collection`.
4. Verificar Dashboard, crear/abrir evento, invitados, Excel, perfil y logout/login.
5. Abrir `event.html?id=EVT-XXXX#qr` como CEO y probar PNG/ZIP.
6. Repetir como ADMINISTRADOR y DISENADOR: debe verse “Acceso restringido” y no debe ejecutarse la consulta QR.
7. Revisar App Check en Firebase Console: dominio autorizado, tokens válidos y ausencia de debug tokens en producción.

No se modificó `firebase.js`, el proveedor App Check ni los proveedores de Authentication.
