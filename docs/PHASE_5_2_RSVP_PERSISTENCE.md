# Fase 5.2 · Persistencia canónica RSVP

## Decisión de arquitectura

La configuración administrativa RSVP vive en:

```text
eventos/{eventId}/invitacion/rsvp
```

La auditoría no encontró persistencia general de `content` ni un guardado de
draft reutilizable. `eventos/{eventId}/invitacion/config` tiene un contrato exacto
de cuatro campos y pertenece al ciclo multimedia: `schemaVersion`, `mediaIndex`,
`updatedAt` y `updatedBy`. Un documento hermano evita mezclar ciclos de escritura,
validadores y responsabilidades, y deja `mediaIndex` y
`eventos/{eventId}/invitacion/config/media/{mediaId}` intactos.

## Documento exacto

```js
{
  schemaVersion: 1,
  contentSchemaVersion: 3,
  eventId: 'EVT-0001',
  enabled: true,
  title: '',
  message: '',
  buttonLabel: '',
  deadline: '',
  method: 'internal',
  whatsapp: {
    phone: '',
    message: ''
  },
  guestPolicy: 'assigned-only',
  responses: {
    acceptedLabel: '',
    declinedLabel: '',
    confirmationMessage: ''
  },
  touchedPaths: [],
  updatedAt: serverTimestamp(),
  updatedBy: auth.currentUser.uid
}
```

`eventId` enlaza el contenido con el wildcard del path y permite rechazar un
payload preparado para otro evento. `touchedPaths` admite únicamente los doce
paths de `RSVP_EDITABLE_FIELD_DEFINITIONS`. Es metadata semántica necesaria, no
estado UI: distingue un campo nunca editado de un `explicit clear` vacío. Sin
ella, cerrar y abrir el Builder podría revivir el fallback de una demo.

No se persisten DOM, errores, dirty flags, estado de preview/iframe, objetos
Firebase resueltos, archivos, blobs, URLs runtime ni campos ajenos a RSVP.

## Serialización y servicio

`rsvp-persistence-schema.js` contiene la frontera pura:

- `serializeRsvpConfig()` valida el source, reutiliza `normalizeRsvpConfig()` y
  `validateRsvpConfig()`, elimina propiedades desconocidas y genera un shape
  determinista y Firestore-safe;
- `deserializeRsvpConfig()` exige keys raíz y anidadas exactas, versiones
  compatibles, ownership y touched paths válidos; un documento desconocido se
  rechaza en vez de hidratarse parcialmente;
- `createRsvpPersistenceFingerprint()` permite saber si hubo otra edición local
  mientras el write estaba en vuelo.

`invitation-rsvp-service.js` es la única frontera Firebase. Usa lecturas directas
y `setDoc()` completo sobre el documento RSVP, valida `eventId` contra
`draft.eventId`, obtiene UID/timestamp del gateway e hidrata o guarda el estado.
El editor y el controlador no importan primitivas Firestore.

## Carga y guardado

El arranque mantiene este orden: Auth y claims, evento, `builderState.initialize`,
lectura/validación RSVP, hidratación multimedia, montaje de editores y montaje de
preview. Por ello no se renderiza primero un fallback demo que luego deba
corregirse. Leer nunca escribe.

Un documento ausente conserva defaults locales, `touchedPaths: []` y dirty en
false. No se crea nada hasta una acción explícita de guardado.

Como todavía no existe persistencia general, el único control nuevo ocupa el
lugar central futuro del header y se llama **Guardar RSVP**. No se añadió un
botón al editor RSVP. El control se habilita sólo con `rsvpDirty`, muestra estado
de guardado y queda preparado para ser absorbido por Guardar borrador cuando las
demás raíces sean persistibles.

Antes del write se ejecuta `validateRsvpConfig()`. Si falla validación, Auth,
Rules, App Check o red, el draft y touched paths permanecen intactos,
`rsvpDirty` sigue activo y el banner ofrece retry. Sólo un write resuelto puede
marcar RSVP clean. Si el usuario edita durante el write, el fingerprint evita
limpiar esos cambios posteriores. `mediaDirty` es independiente.

## Concurrencia

El repo no tiene revisiones, ETags ni una transacción de borrador general. Fase
5.2 no inventa una transacción que no podría detectar por sí sola otra sesión:
entre sesiones continúa last-write-wins. La protección implementada cubre la
concurrencia dentro de la pestaña; una futura persistencia general deberá añadir
revisión/precondición común para resolver conflictos entre editores.

## Firestore Rules

La propuesta se añadió primero a `firestore.rules.proposed` y se sincronizó con
`firestore.rules`, archivo canónico local enlazado por `firebase.json`. No hubo
deploy. `isThemeEditor()` conserva los claims vigentes: `CEO`,
`ADMINISTRADOR`/alias legacy `ADMIN` y `DISENADOR`, desde `role` o `userRole`.

Para `invitacion/rsvp`:

- direct `get`, create y update: sólo roles internos autorizados;
- list y delete: denegados; desactivar usa `enabled: false`;
- lectura/escritura pública: denegada;
- keys, nested maps, tipos, versiones, enums, longitudes, fecha, teléfono,
  touched paths, `eventId`, server timestamp y UID: validados;
- todos los matches existentes y el default deny permanecen sin cambios.

## Pruebas locales

`tests/invitation-builder-phase52.test.mjs` cubre 25 casos de serialization,
roundtrip, unknown fields, explicit clear, service, missing document, hydration,
dirty, error/retry, multimedia, tema, toggle, WhatsApp, policy y edición durante
write.

`tests/firebase-rules-phase52.emulator.mjs` usa exclusivamente
`demo-eventorastudio-phase52` y cubre 19 casos: CREATE/READ/UPDATE para CEO,
Administrador y Diseñador; denegaciones para Cliente, anónimo, rol desconocido,
cross-event, schema, extra fields, enums, nested maps, UID, límites, fecha,
touched paths y delete. `npm.cmd run test:rules` conserva además la matriz
multimedia 4.5.

## Fuera de alcance y Fase 5.3

No se cambió enforcement real de App Check, no hubo credenciales productivas,
writes reales, deploy ni push. Invitados, pases runtime, tokens, URLs específicas
por invitado, página pública, public read/write, confirmaciones, QR y check-in no
fueron modificados. Fase 5.3 deberá diseñar explícitamente autenticación/token,
lookup de invitado, límite asignado, escritura de respuesta y Rules públicas
mínimas antes de habilitar cualquier runtime RSVP.
