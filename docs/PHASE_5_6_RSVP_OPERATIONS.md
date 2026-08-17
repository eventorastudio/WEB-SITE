# Fase 5.6 · Estado operativo y conflictos RSVP

## Auditoría de partida

Fase 5.5 detectaba el empate `respondedAt` con datos diferentes y lo emitía por
`logger.error`, pero no dejaba una entidad consultable. El estado y el guest no
se sobrescribían; el conflicto sólo existía en logs.

## Conflicto privado e idempotente

Los conflictos reales viven en:

```text
eventos/{eventId}/rsvpConflicts/{conflictId}
```

El ID es `RSVP-CONFLICT-` más SHA-256 de event, guest, timestamp y los dos
valores comparables. No incorpora token. Dos entregas del mismo conflicto
apuntan al mismo documento; la transacción lo crea sólo si no existe y conserva
su `createdAt` durante retries.

Shape exacto:

```js
{
  eventId,
  guestId,
  conflictType: 'same-responded-at',
  respondedAt,
  canonical: { status, passesConfirmed },
  candidate: { status, passesConfirmed },
  createdAt
}
```

No contiene bearer, `qrToken`, identidad/contacto, datos de llegada o historial.
El registro ocurre dentro de la misma transacción que relee response y state.
Sólo se alcanza cuando los timestamps son idénticos y status/pases difieren.

## Observabilidad ADMIN

La pestaña existente **Invitados** obtiene listeners de sólo lectura sobre
`rsvpState` y `rsvpConflicts`. Tabla y tarjetas añaden una presentación RSVP
separada del estado operativo del guest:

- `accepted`: Confirmado y pases de `rsvpState.passesConfirmed`;
- `declined`: No asistirá y cero pases confirmados;
- sin state: Pendiente / Sin respuesta;
- conflicto del guest: indicador **Conflicto**.

No existe edición manual. El servicio no importa APIs de escritura y la vista
no consulta ni modifica QR, pases operativos, llegada o check-in.

## Rules y pruebas

`rsvpState` y `rsvpConflicts` permiten GET/LIST exclusivamente a
`isInternalReader()`. CREATE/UPDATE/DELETE desde cualquier cliente permanecen
en `false`; Admin SDK escribe el conflicto desde Functions. Público anónimo,
cliente y roles desconocidos no obtienen lectura.

Las cuatro pruebas dirigidas cubren persistencia única, retry sin duplicado,
privacidad Rules y render ADMIN. No se ejecutó Playwright porque el cambio usa
un componente DOM pequeño probado con JSDOM.

No hubo deploy, push, acceso productivo, cambios de App Check, QR o check-in.
