# Fase 5.3 · Identidad RSVP, token y proyección pública

## Resultado y límites

La fase crea identidad RSVP por invitado sin reutilizar la identidad de check-in.
Incluye token criptográfico, proyección pública mínima, servicio interno de
provisioning/sincronización, rotación, revocación, URL estática, lookup público
exacto, Rules y pruebas de emulador. No incluye formulario de respuesta,
selección de pases, escritura pública, dashboard de respuestas ni migración
masiva.

El hardening 5.3A reduce el documento públicamente legible a siete campos. Esta
forma almacenada —y no un filtrado posterior del loader— es la frontera de
privacidad, porque Firestore autoriza o rechaza documentos completos y no puede
ocultar campos individuales durante un `get`.

El checkpoint previo quedó en el commit local `224a782` con el mensaje
`Persist canonical RSVP configuration with secured Firestore rules`. No se hizo
push.

## Auditoría del contrato real de invitados

La fuente canónica es `shared/guest-contract.js`. El documento vive en
`eventos/{eventId}/invitados/{guestId}` y sus campos operativos son:

- identidad y contacto: `codigoInvitado`, `nombre`, `correo`, `telefono`;
- pases: `pases`, `pasesUtilizados`, `pasesDisponibles`;
- asistencia: `estado`, `confirmado`, `llegadaRegistrada`, `horaLlegada`;
- acceso: `tipoAcceso`, `qrToken`, `qrActivo`;
- administración: `mesa`, `notas`, timestamps y secuencia de check-in.

`pases` es el total asignado y acepta enteros de 1 a 999. Es la única fuente de
`passLimit`. `pasesDisponibles` representa entradas todavía utilizables en
check-in y no limita una futura respuesta RSVP. `pasesConfirmados` no pertenece
al invitado: es una estadística agregada del evento.

Creación manual, edición e importación Excel convergen en
`normalizeGuestForCreate()`/`normalizeGuestForUpdate()` dentro de
`guest-service.js`; la proyección RSVP no crea una segunda normalización de
invitados.

## Separación absoluta respecto a QR

`qrToken` sigue siendo propiedad exclusiva del contrato de check-in. El nuevo
token RSVP:

- no se copia, deriva ni compara con `qrToken`;
- no se almacena en el documento del invitado;
- no importa `guest-contract.js`, `qr-code.js`, renderers ni generadores QR;
- no cambia QR Manager, payload QR, Portal ni transacciones de check-in.

Los dos tokens pueden rotar o revocarse de manera independiente. Las regresiones
verifican que el payload QR continúa siendo exactamente su token anterior.

## Token RSVP

`generateRsvpAccessToken()` usa exclusivamente
`globalThis.crypto.getRandomValues()` sobre 32 bytes: 256 bits de entropía. La
codificación es base64url sin padding y produce exactamente 43 caracteres del
alfabeto `[A-Za-z0-9_-]`. No existe fallback a `Math.random`.

El token es un secreto bearer. Sólo se usa como Document ID y como parámetro de
la URL. No existe un campo duplicado dentro del documento Access ni dentro del
invitado. No se escribe en console, errores, analytics, dataset, HTML estático,
localStorage, sessionStorage o cookies. Los errores públicos se reducen a
`rsvp-access/unavailable` y nunca adjuntan la causa Firebase.

El uso del valor crudo como Document ID se acepta por su entropía de 256 bits,
la ausencia de list/query público y el lookup exacto. Esto evita guardar un hash
adicional que el cliente no podría transformar sin añadir otra primitiva y otra
superficie de compatibilidad. La búsqueda interna por invitado usa un query
autorizado sobre `guestId`; nunca requiere copiar el secreto al invitado.

## Ruta pública

La URL canónica es:

```text
https://eventorastudio.com/rsvp/?event={eventId}&token={token}
```

`buildRsvpUrl()` y `parseRsvpRoute()` validan ambos valores. La estructura de
directorio `/rsvp/index.html` es compatible con hosting estático y GitHub Pages;
una base alternativa puede conservar un prefijo de proyecto. Parámetros
faltantes, duplicados o malformados se rechazan antes de inicializar Firebase.

La página añadida es deliberadamente mínima: verifica el acceso y muestra
estado ready/unavailable. No responde RSVP ni escribe datos. `displayName` y el
límite se insertan con `textContent`; el token nunca se inserta en el DOM.

## Ruta y esquema Firestore

Cada acceso vive en:

```text
eventos/{eventId}/rsvpAccess/{token}
```

El documento exacto, versión 1, es:

```js
{
  schemaVersion: 1,
  eventId,
  guestId,
  displayName,
  passLimit,
  active,
  expiresAt
}
```

La información públicamente legible queda limitada a ownership, referencia
estable del invitado, nombre de display, total asignado, estado y expiración. Se
excluyen auditoría, correo, teléfono, mesa, dirección, notas, estado
administrativo, confirmación previa, contadores de entrada, historial,
check-ins, QR y el documento completo del invitado. `expiresAt` puede ser
`null`; es independiente del deadline editorial de la configuración RSVP.

`guestId` se conserva porque la futura respuesta de Fase 5.4 necesitará una
referencia estable al invitado y porque el servicio interno usa ese valor para
`findAccessByGuest()`/`syncGuest()`. No concede lectura del guest ni permite
consultas públicas: Rules niega `list/query` al poseedor del bearer. Los cuatro
campos de auditoría (`createdAt`, `createdBy`, `updatedAt`, `updatedBy`) se
eliminaron, sin colección meta alternativa, porque no aportan valor operativo en
esta fase y su presencia en el mismo documento los expondría públicamente.

## Servicio interno y sincronización

`admin/invitations/services/rsvp-access-service.js` es la única frontera interna
Firebase. La UI no importa Firestore. El servicio ofrece:

- generación y validación del token;
- construcción del documento a partir del invitado leído por ID exacto;
- creación create-only mediante transacción y verificación posterior;
- URL pública;
- búsqueda interna por `guestId`;
- sincronización explícita de `displayName` y `passLimit`;
- rotación y revocación.

No hay listeners permanentes ni automatismos escondidos en Guest Manager. Tras
un cambio de `nombre` o `pases`, un caller interno puede ejecutar `sync()` para
un acceso o `syncGuest()` para las proyecciones encontradas por `guestId`. El
invitado sigue siendo la fuente de verdad. La fase no ejecuta sincronizaciones
productivas ni generación masiva.

La rotación sigue este orden:

1. validar acceso anterior y ownership;
2. leer otra vez el invitado canónico;
3. crear un token/documento nuevo;
4. verificar que el documento nuevo se puede leer y validar;
5. revocar el anterior con `active: false`.

Si la creación o verificación falla, el acceso anterior no se toca. Si falla la
revocación, ambos accesos pueden quedar activos, pero nunca se deja al invitado
sin acceso; el caller recibe `rsvp-access/rotation-revoke-failed` para reintentar
la revocación. `delete` no forma parte del lifecycle.

## Loader público

`rsvp/services/rsvp-access-loader.js` valida localmente la ruta antes de cargar
su gateway. Usa exclusivamente `doc()` + `getDoc()` sobre event y token exactos;
no importa `collection`, `query`, `where`, `getDocs` u `onSnapshot`. Tras la
lectura vuelve a validar esquema, ownership, `active` y expiración y devuelve
el contrato público exacto de siete campos. Esa normalización es defensa de
integridad para el consumidor, no un mecanismo para esconder datos: el
documento crudo ya contiene exclusivamente esos siete campos.

Documento ausente, token inválido, permiso denegado, revocación, expiración y
schema corrupto producen el mismo estado no enumerable.

## Firestore Rules

La propuesta se escribió primero en `firestore.rules.proposed` y luego se
sincronizó exactamente con `firestore.rules`. No hubo deploy.

- CEO, `ADMINISTRADOR`/alias `ADMIN` y `DISENADOR`: create, get, list/query
  interno y update con whitelist exacta.
- cualquier poseedor del bearer, anónimo o autenticado: sólo `get` exacto si el
  token tiene 43 caracteres válidos, el schema y `eventId` coinciden,
  `active == true` y no expiró;
- `CLIENTE` y roles desconocidos autenticados: sin privilegios internos; un
  bearer válido conserva el mismo `get` exacto, pero no habilita otras lecturas
  ni escrituras;
- anónimos y autenticados sin rol interno: list, query, create, update y delete
  denegados;
- delete interno: denegado; revocar significa `active: false`.
- invitados completos, check-ins e `invitacion/rsvp`: continúan sin lectura
  pública.

Rules valida las siete keys exactas, tipos, longitudes, `passLimit` 1–999,
`expiresAt`, ownership, campos inmutables y affected keys de update. No intenta
validar entropía criptográfica; sólo formato/longitud.

## Modelo de amenazas

| Riesgo | Control |
| --- | --- |
| Enumeración | 256 bits, Document ID no predecible, `list/query` público denegado. |
| Exposición del invitado | Documento crudo separado con whitelist exacta de 7 campos; no depende de filtrado en el loader y el guest completo sigue privado. |
| Exposición de auditoría | Los campos de identidad y timestamps administrativos se eliminaron del documento público; no existe colección meta innecesaria. |
| Cruce entre eventos | `eventId` validado contra el path en contrato, servicio y Rules. |
| Token filtrado por runtime | Sin logs, DOM, storage web, cookies, analytics o errores con causa. |
| Acoplamiento con acceso físico | Token y módulos RSVP separados de `qrToken`, QR Manager y check-in. |
| Proyección obsoleta | `sync()`/`syncGuest()` deterministas desde el guest canónico, sin listeners. |
| Rotación parcial | Crear y verificar antes de revocar; el fallo conserva al menos un acceso. |
| XSS por nombre | Render exclusivo mediante `textContent`. |
| Expiración ambigua | Timestamp nullable; Rules compara `request.time`, loader hace defensa adicional. |

La URL bearer puede aparecer en historial del navegador o infraestructura HTTP;
por ello la página usa `no-referrer`, `noindex`, no carga analytics y no reproduce
el token en contenido. Una fase futura puede evaluar redacción adicional en
infraestructura, pero no debe reducir entropía ni habilitar listados.

## Pruebas y estado operativo

`tests/invitation-rsvp-access-phase53.test.mjs` contiene 40 casos para crypto,
formato, unicidad, schema, exclusiones, rutas, lifecycle, fallos, sincronización,
loader, privacidad y regresión QR.

`tests/firebase-rules-phase53.emulator.mjs` usa únicamente
`demo-eventorastudio-phase53` y contiene 20 casos: roles internos, poseedores
anónimos y autenticados, GET bearer activo/futuro, revocado, expirado,
wrong-event, token malformado, rechazo del antiguo schema con auditoría,
list/query/write público, privacidad de guest/checkin/config, validaciones,
query interno y delete denegado. Las pruebas leen también el snapshot crudo para
demostrar que sólo existen los siete campos permitidos.

No se cambió App Check, no se usaron credenciales productivas, no hubo writes
reales, deploy, push, migración ni generación masiva.

## Pendiente para Fase 5.4

Fase 5.4 deberá diseñar la persistencia de respuestas, idempotencia, política de
pases elegidos, aceptación/rechazo, relación con `guestPolicy`, lectura segura de
configuración pública, confirmación UX y Rules de escritura pública. Nada de ese
flujo está habilitado por esta fase.
