# Propuesta de Rules para roles internos del ADMIN

El repositorio no contiene `firestore.rules`, `firebase.json` ni `.firebaserc`.
Este fragmento no es una política completa y no fue desplegado. Debe fusionarse
con las reglas reales y probarse en Emulator Suite.

```javascript
function internalRole() {
  return request.auth != null
    && (
      request.auth.token.role in ['CEO', 'ADMINISTRADOR', 'DISENADOR', 'VENTAS', 'SOPORTE']
      || request.auth.token.userRole in ['CEO', 'ADMINISTRADOR', 'DISENADOR', 'VENTAS', 'SOPORTE']
    );
}

function isCeo() {
  return request.auth != null
    && (request.auth.token.role == 'CEO' || request.auth.token.userRole == 'CEO');
}

match /eventos/{eventId} {
  allow read: if internalRole();
  // Mantener aquí las condiciones de escritura específicas por rol.

  match /invitados/{guestId} {
    // Con qrToken dentro del mismo documento, Firestore no puede ocultar solo
    // ese campo. CEO-only real implica que la lectura completa sea CEO-only.
    allow read: if isCeo();
    // Conservar las reglas existentes de create/update/delete, sin abrirlas.
  }

  match /checkins/{checkinId} {
    // Conservar la política operativa actual del Portal y del ADMIN.
  }
}

match /themes/{themeId} {
  // Fusionar las operaciones que realmente correspondan a cada rol interno.
  allow read: if internalRole();
}
```

## Limitación importante

Firestore Rules autoriza documentos completos, no campos individuales. Mientras
`qrToken` viva en `invitados/{guestId}`, cualquier rol con lectura de ese documento
puede obtener el token mediante DevTools aunque la pestaña esté oculta. Si otros
roles deben seguir leyendo invitados, la arquitectura definitiva debe mover el
secreto a `eventos/{eventId}/qrSecrets/{guestId}` con lectura exclusiva CEO y dejar
en el documento público únicamente los campos no secretos. Esa migración no se
realizó porque esta tarea prohíbe modificar tokens y documentos existentes.

El guard lógico incluido en el ADMIN exige un claim firmado `CEO`, pero debe
acompañarse de la regla anterior para constituir control de acceso de backend.
