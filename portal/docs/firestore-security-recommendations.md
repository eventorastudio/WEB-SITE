# Reglas de seguridad para Portal Prestige

El repositorio no contiene `firestore.rules`, `firebase.json` ni una Cloud Function desplegable. Por ello no se han desplegado ni sobrescrito reglas de producción. El guard del navegador mejora la experiencia, pero **no es una frontera de seguridad**: antes de habilitar el portal debe revisarse y desplegarse una política equivalente a la siguiente.

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function profilePath() { return /databases/$(database)/documents/usuarios/$(request.auth.uid); }
    function hasProfile() { return signedIn() && exists(profilePath()); }
    function isPortalClient() {
      return hasProfile()
        && get(profilePath()).data.activo == true
        && get(profilePath()).data.rol in ['cliente', 'CLIENTE'];
    }
    function assigned(eventId) {
      return isPortalClient()
        && eventId in get(profilePath()).data.eventosPermitidos;
    }
    function portalEnabled(eventId) {
      return assigned(eventId)
        && get(/databases/$(database)/documents/eventos/$(eventId)).data.funcionalidades.portalCliente == true;
    }
    function accessEnabled(eventId) {
      return portalEnabled(eventId)
        && get(/databases/$(database)/documents/eventos/$(eventId)).data.funcionalidades.checkInQR == true;
    }
    function historyEnabled(eventId) {
      return portalEnabled(eventId)
        && get(/databases/$(database)/documents/eventos/$(eventId)).data.funcionalidades.historialAccesos == true;
    }
    function guestPath(eventId, guestId) {
      return /databases/$(database)/documents/eventos/$(eventId)/invitados/$(guestId);
    }
    function usedBefore(eventId, guestId) {
      return get(guestPath(eventId, guestId)).data.pasesUtilizados is int
        ? get(guestPath(eventId, guestId)).data.pasesUtilizados : 0;
    }
    function validGuestCheckin(eventId, guestId) {
      let before = resource.data;
      let after = request.resource.data;
      let previousUsed = before.pasesUtilizados is int ? before.pasesUtilizados : 0;
      return accessEnabled(eventId)
        && after.diff(before).affectedKeys().hasOnly([
          'pasesUtilizados', 'pasesDisponibles', 'estado', 'confirmado',
          'llegadaRegistrada', 'horaLlegada', 'ultimaLlegada', 'fechaActualizacion'
        ])
        && after.pases == before.pases
        && after.pasesUtilizados is int
        && after.pasesUtilizados > previousUsed
        && after.pasesUtilizados <= before.pases
        && after.pasesDisponibles == before.pases - after.pasesUtilizados
        && after.estado == 'llego'
        && after.confirmado == true
        && after.llegadaRegistrada == true;
    }
    function validCheckinCreate(eventId) {
      let record = request.resource.data;
      let guest = getAfter(guestPath(eventId, record.invitadoId)).data;
      return accessEnabled(eventId)
        && record.keys().hasOnly([
          'eventId', 'invitadoId', 'nombreInvitado', 'codigoInvitado',
          'pasesRegistrados', 'pasesDisponiblesDespues', 'fechaHora',
          'registradoPor', 'metodo', 'dispositivo', 'resultado'
        ])
        && record.eventId == eventId
        && record.registradoPor == request.auth.uid
        && record.metodo in ['qr', 'manual']
        && record.resultado in ['aprobado', 'parcial']
        && record.pasesRegistrados is int && record.pasesRegistrados > 0
        && guest.pasesUtilizados == usedBefore(eventId, record.invitadoId) + record.pasesRegistrados
        && guest.pasesDisponibles == record.pasesDisponiblesDespues;
    }

    match /usuarios/{uid} {
      allow get: if signedIn() && request.auth.uid == uid;
      allow list, create, update, delete: if false;
    }
    match /eventos/{eventId} {
      allow get: if portalEnabled(eventId);
      allow list, create, update, delete: if false;

      match /invitados/{guestId} {
        allow get, list: if portalEnabled(eventId);
        allow update: if validGuestCheckin(eventId, guestId);
        allow create, delete: if false;
      }
      match /checkins/{checkinId} {
        allow get, list: if historyEnabled(eventId);
        allow create: if validCheckinCreate(eventId);
        allow update, delete: if false;
      }
    }
  }
}
```

## Contratos que deben existir

`usuarios/{uid}` debe ser escrito exclusivamente por un proceso administrativo seguro:

```js
{ nombre, correo, rol: 'cliente', activo: true, eventosPermitidos: ['EVENT_DOCUMENT_ID'] }
```

El documento de evento debe declarar explícitamente sus entitlements; el portal no usa `paquete === 'prestige'` como autorización:

```js
{ funcionalidades: { portalCliente: true, checkInQR: true, seguimientoEnVivo: true, historialAccesos: true } }
```

El check-in actual crea una transacción: actualiza solo campos de acceso del invitado y crea `eventos/{eventId}/checkins/{checkinId}` en la misma operación. `pases` sigue siendo el total canónico; `pasesUtilizados` y `pasesDisponibles` son el estado operativo derivado. Un QR seguro requiere `qrToken` aleatorio y `qrActivo` booleano.

## Recomendación para endurecimiento futuro

Firestore no tiene permisos por campo. Si el modelo operativo no permite que un operador autorizado lea `qrToken`, mover la resolución por token y la transacción a una Callable Cloud Function con Admin SDK. Esa función debe verificar `request.auth.uid`, el perfil activo, asignación del evento, entitlements y cantidad de pases antes de ejecutar la misma transacción. En ese modelo, el portal leería una proyección de invitados sin `qrToken` y nunca recibiría el secreto.

Antes de desplegar, probar estas reglas en Firebase Emulator Suite: usuario sin perfil, perfil inactivo, evento ajeno, entitlement desactivado, update no relacionado, creación de check-in sin actualización pareada y dos transacciones de check-in concurrentes.
