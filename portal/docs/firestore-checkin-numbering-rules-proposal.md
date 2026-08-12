# Propuesta de Rules para IDs secuenciales de check-in

Este repositorio no contiene `firestore.rules`, `firebase.json` ni `.firebaserc`.
Por eso no es seguro crear una política raíz completa: podría reemplazar permisos
administrativos que solo existen en producción. Este fragmento debe fusionarse
manualmente con la regla vigente y probarse en Emulator Suite. No se desplegó.

## Invariantes que debe añadir la regla vigente

```javascript
// Dentro de match /eventos/{eventId}
function checkinIdMatchesGuest(checkinId, guestId) {
  return guestId.matches('^INV-[0-9]{4,}$')
    && checkinId.matches('^' + guestId + '-[0-9]{3,}$');
}

function checkinCounterAdvanced(guestId) {
  let before = get(/databases/$(database)/documents/eventos/$(eventId)/invitados/$(guestId)).data;
  let after = getAfter(/databases/$(database)/documents/eventos/$(eventId)/invitados/$(guestId)).data;
  return before.checkinSecuencia is int
    && after.checkinSecuencia is int
    && after.checkinSecuencia == before.checkinSecuencia + 1;
}

match /invitados/{guestId} {
  // Conservar aquí todas las condiciones actuales de usuario/evento.
  allow update: if /* condiciones actuales */
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'pasesUtilizados',
      'pasesDisponibles',
      'llegadaRegistrada',
      'horaLlegada',
      'estado',
      'fechaActualizacion',
      'checkinSecuencia'
    ])
    && request.resource.data.checkinSecuencia == resource.data.checkinSecuencia + 1;
}

match /checkins/{checkinId} {
  allow create: if /* condiciones actuales */
    && request.resource.data.invitadoId is string
    && request.resource.data.codigoInvitado == request.resource.data.invitadoId
    && request.resource.data.checkinSecuencia is int
    && request.resource.data.checkinSecuencia > 0
    && checkinIdMatchesGuest(checkinId, request.resource.data.invitadoId)
    && checkinCounterAdvanced(request.resource.data.invitadoId)
    && getAfter(
      /databases/$(database)/documents/eventos/$(eventId)/invitados/$(request.resource.data.invitadoId)
    ).data.checkinSecuencia == request.resource.data.checkinSecuencia;
}
```

La aplicación genera y prueba el sufijo exacto con `padStart(3, "0")`. Rules
puede validar razonablemente el prefijo, el patrón y la correlación atómica del
contador; no debe sustituirse la autorización actual por este fragmento.

La migración administrativa usa Admin SDK y no depende de estas Rules. Antes de
habilitar el Portal, todos los invitados deben tener `checkinSecuencia` entero.
