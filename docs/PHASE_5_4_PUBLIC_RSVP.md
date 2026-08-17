# Fase 5.4 · RSVP público protegido

## Resultado y límite

La fase implementa el flujo público completo de RSVP desde un bearer individual:
Access exacto, configuración pública por capability secundaria, respuesta previa,
render, aceptación/rechazo, selección acotada de pases, escritura segura y
restauración tras recarga. No modifica el documento canónico del invitado, sus
pases operativos, QR ni check-in. Esas sincronizaciones pertenecen a Fase 5.5.

No se hizo deploy, push, lectura productiva, escritura productiva ni cambio de
enforcement de App Check.

## Dos capabilities separadas

La URL mantiene el bearer individual:

```text
/rsvp/?event={eventId}&token={token}
```

`token` identifica Access y respuesta; `configKey` identifica únicamente la
configuración pública compartida por los invitados del evento. Ambos se generan
de forma independiente con 32 bytes (256 bits) de `crypto.getRandomValues()` y
base64url sin padding de 43 caracteres. Ninguno usa `Math.random()` ni se deriva
del otro o de `qrToken`.

El documento Access evoluciona a schema 2:

```js
{
  schemaVersion: 2,
  eventId,
  guestId,
  configKey,
  displayName,
  passLimit,
  active,
  expiresAt
}
```

`configKey` no concede lectura del invitado, respuestas ajenas, QR, check-in o
ADMIN. El token individual sigue siendo necesario para obtener `guestId`,
`displayName`, `passLimit` y la respuesta que usa ese mismo token como ID.

## Publication metadata privada

La fuente canónica de `configKey` vive en:

```text
eventos/{eventId}/invitacion/rsvpPublication
```

Shape exacto:

```js
{
  schemaVersion: 1,
  eventId,
  configKey,
  createdAt,
  createdBy,
  updatedAt,
  updatedBy
}
```

Sólo CEO, Administrador y Diseñador pueden leer o escribir este documento. La
key, ownership y auditoría de creación son inmutables; un guardado normal sólo
actualiza `updatedAt`/`updatedBy`. No existe rotación UI y la key no se guarda en
`mediaIndex`.

## Configuración pública

La proyección vive en:

```text
eventos/{eventId}/rsvpPublic/{configKey}
```

Su forma RAW exacta es:

```js
{
  schemaVersion: 1,
  eventId,
  enabled,
  title,
  message,
  buttonLabel,
  method,
  guestPolicy,
  responses: {
    acceptedLabel,
    declinedLabel,
    confirmationMessage
  },
  whatsapp: {
    phone,
    message
  },
  deadlineTimeZone,
  responseClosesAt
}
```

No contiene fecha/hora raw, touched paths, content schema, UIDs, auditoría,
dirty state, identidad/contacto del invitado, token, `qrToken` ni metadata
interna. El cierre visual se formatea exclusivamente desde el Timestamp y la
zona IANA. Para método WhatsApp, teléfono y mensaje son datos públicos
necesarios para el CTA y se procesan con `buildWhatsAppUrl()`.

GET exacto válido funciona con o sin Firebase Auth. LIST/query y todo write
público están denegados. Roles internos gestionan únicamente documentos exactos;
delete permanece denegado.

## Publicación atómica

`InvitationRsvpService` usa una transacción Firestore. Si no existe metadata,
lee el path candidato para impedir overwrite por colisión y escribe como una
sola unidad:

1. `invitacion/rsvp` privado v2;
2. `invitacion/rsvpPublication` privado v1;
3. `rsvpPublic/{configKey}` público v1.

Si metadata ya existe, reutiliza su key y actualiza la proyección bajo el mismo
ID. Un fallo aborta las tres escrituras: no puede quedar config privada nueva
con proyección vieja ni una proyección publicada tras fallar el save privado.
La UI administrativa no edita `rsvpPublic` directamente.

## Respuestas

Cada bearer tiene como máximo un documento:

```text
eventos/{eventId}/rsvpResponses/{token}
```

Shape RAW exacto:

```js
{
  schemaVersion: 1,
  eventId,
  guestId,
  status: 'accepted' | 'declined',
  passesConfirmed,
  respondedAt
}
```

El token existe sólo como Document ID. No se guardan nombre, teléfono, correo,
mesa, notas, IP, user-agent, UID, QR ni check-in.

Para `assigned-only`, accepted exige exactamente `access.passLimit`; declined
exige cero. Para `select-up-to-assigned`, accepted exige un entero de 1 a
`passLimit`; declined sigue exigiendo cero. Cero accepted, negativos, floats,
strings numéricos y valores sobre el límite se rechazan en contrato y Rules.

CREATE y UPDATE públicos requieren Access v2 activo/no expirado, config pública
válida/habilitada, método `internal`, documento exacto, ownership y
`respondedAt == request.time`. Si existe cierre, Rules exige estrictamente
`request.time < responseClosesAt`. El cálculo visual del cliente no es autoridad.
DELETE está denegado. GET exacto bearer funciona con o sin Auth; LIST/query sólo
están disponibles a roles internos para la futura integración.

El servicio compara status/pases contra la respuesta cargada y retorna
`unchanged` sin escribir cuando no hay cambio. Un mapa de operaciones en vuelo
comparte/ignora submits concurrentes por event/token. Tras escribir relee y
valida el documento; un fallo conserva selección y respuesta previa, muestra
error y permite retry.

## Rotación sin pérdida

La rotación sigue este orden:

1. validar Access anterior y `configKey` canónica;
2. crear/verificar Access nuevo conservando la proyección vigente;
3. si existe respuesta anterior, copiarla al nuevo token sin cambiar
   `respondedAt` y verificar igualdad lógica;
4. revocar el Access anterior.

Si falla creación, verificación o migración, el Access anterior sigue activo.
Si falla la revocación final, se revoca compensatoriamente el Access nuevo; sólo
un doble fallo excepcional puede dejar ambos activos y exige reconciliación
administrativa explícita. Rules concede a roles internos sólo el CREATE
histórico necesario para esta migración, con Access/config válidos, shape exacto
y `respondedAt <= request.time`; no concede UPDATE administrativo.

## Hardening final de Fase 5.4B

La auditoría del documento real confirmó que Access nunca persistió el bearer
como campo. Su shape físico exacto sigue siendo el schema 2 de ocho campos
mostrado arriba: `active` representa el estado y `displayName`/`passLimit` son la
proyección mínima aplanada. `token` existe exclusivamente como Document ID,
parámetro de ruta y argumento interno para construir el path. Rules mantiene
una whitelist exacta que rechaza `token`, `qrToken`, UIDs, auditoria y campos
privados del invitado.

La capability no depende de Firebase Auth. Un GET exacto valido de Access,
config pública o response conserva la misma semántica para una sesión anónima o
autenticada sin privilegios. Estar autenticado no habilita LIST/query, writes de
config, private RSVP, guest, check-in ni respuestas de otro bearer.

Si falla la revocación del Access anterior después de crear y migrar al nuevo,
el servicio intenta revocar el nuevo como compensación. Si la compensación se
verifica, la rotación falla con estado `rolled-back`: el anterior queda como
única capability activa y su response conserva autoridad operacional; la copia
nueva puede permanecer como historial inaccesible públicamente. Si ambas
revocaciones fallan, el resultado explícito es `reconciliation-required`; no se
declara éxito y el error interno contiene sólo identificadores redactados, nunca
bearers o URLs completos.

## Runtime, privacidad y App Check

El flujo es `parse route → Access GET → configKey → public config GET → response
GET → render`. Todos son documentos exactos; no hay queries o listeners. La UI
soporta loading, internal, WhatsApp, existing, saving, saved, unchanged, closed,
invalid/revoked/expired/disabled genéricos y error/retry.

Firebase se inicializa mediante `admin/firebase.js`, que mantiene App Check con
reCAPTCHA v3 y refresh automático. No existe Anonymous Auth ni cambio de
enforcement. `no-referrer`, `noindex`, ausencia de analytics/storage/cookies y
mensajes de error genéricos evitan propagar capabilities. Token y configKey sólo
viven en memoria el tiempo necesario; no se escriben en DOM, dataset, console,
localStorage, sessionStorage o cookies. Todo copy externo se inserta con
`textContent`; no se usa `innerHTML` con datos.

## Pendiente exacto para Fase 5.5

Fase 5.5 deberá consumir respuestas ya validadas desde una frontera confiable y
sincronizar de forma idempotente el documento canónico
`eventos/{eventId}/invitados/{guestId}`: estado/confirmación y cualquier campo
RSVP que el contrato decida incorporar. Deberá definir concurrencia con edición
administrativa, historial/reconciliación y agregados. No debe reinterpretar
`passesConfirmed` como pases usados/disponibles de check-in ni tocar QR o
`checkinSecuencia`.
