# Fase 5.5 · Reconciliación server-side RSVP → invitado

## Contrato real auditado

El invitado canónico no tiene un campo `pasesConfirmados`. Sus únicos campos
RSVP son:

- `estado`, cuyo catálogo es `pendiente | confirmado | no_asistira | llego`;
- `confirmado`, booleano derivado de `estado`.

Por eso una aceptación sin llegada proyecta `estado: 'confirmado'` y
`confirmado: true`; un rechazo sin llegada proyecta `estado: 'no_asistira'` y
`confirmado: false`. El número exacto elegido por el invitado se conserva en la
proyección RSVP, no se inventa dentro del documento guest.

Una llegada ya registrada prevalece sobre una respuesta posterior. Si
`estado == 'llego'`, `llegadaRegistrada == true`, `pasesUtilizados > 0` o
`checkinSecuencia > 0`, el RSVP no modifica `estado` ni `confirmado`. Nunca toca
`pases`, `pasesUtilizados`, `pasesDisponibles`, `checkinSecuencia`,
`llegadaRegistrada`, `horaLlegada`, `qrToken`, `qrActivo` ni historial de
check-in.

## Frontera confiable

La infraestructura mínima vive en `functions/` como un codebase Firebase
independiente para Node 20. El trigger Firestore v2
`syncRsvpResponseToGuest` observa escrituras en:

```text
eventos/{eventId}/rsvpResponses/{token}
```

Los deletes se ignoran. Para create/update el trigger no confía en el payload
del evento: abre una transacción y vuelve a leer el documento actual. La
validación usa directamente los contratos compartidos de Access y response. El
build copia mecánicamente esos módulos puros, el contrato guest y el agregador
oficial al source autocontenido que empaquetará Firebase.

No existe lógica sensible en el navegador ni escritura pública directa al
guest.

## Estado lógico por invitado

La identidad final es `guestId`, no el bearer. Cada invitado tiene una única
proyección privada:

```text
eventos/{eventId}/rsvpState/{guestId}
```

Shape exacto:

```js
{
  schemaVersion: 1,
  eventId,
  guestId,
  status: 'accepted' | 'declined',
  passesConfirmed,
  respondedAt,
  syncedAt
}
```

No guarda token raw. Firestore Rules no se modificaron: al no existir un match
público para `rsvpState`, la denegación recursiva final mantiene lectura y
escritura de clientes en `false`. Admin SDK opera desde la frontera confiable.

## Transacción, orden e idempotencia

La transacción relee response y compara `respondedAt` con el estado lógico:

- response anterior: `ignored`, cero writes;
- mismo timestamp y mismos status/pases: `unchanged`, cero writes;
- mismo timestamp y datos distintos: `conflict`, cero writes y reporte
  estructurado sin bearer;
- response posterior o primer response: `applied`.

Cuando aplica, la misma transacción escribe `rsvpState`, actualiza únicamente
el patch RSVP del guest y, si cambió el guest, actualiza el evento con
`createEventStatsMutation`. Un retry, una entrega duplicada, el orden invertido
de eventos o dos tokens rotados convergen así sobre una sola verdad por
`guestId`. Un fallo aborta state, guest y agregado juntos; las responses no se
borran.

## Agregados existentes

Cambiar `estado` requiere reconciliar `eventos/{eventId}.estadisticas`. Se
reutiliza la rutina oficial compartida `createEventStatsMutation`; no se creó
otro contador. Su semántica existente clasifica todos los `pases` asignados del
guest según `estado`, por lo que el valor exacto seleccionado continúa siendo
autoridad de `rsvpState.passesConfirmed`. Los deltas de `pasesUtilizados`,
`pasesDisponibles` y `gruposConLlegada` permanecen en cero.

## Pruebas dirigidas

`npm.cmd run test:functions` construye los módulos compartidos y levanta sólo
Firestore + Functions Emulator sobre un proyecto `demo-*`. La suite contiene
exactamente diez casos críticos: accepted, declined, pases exactos, retry,
response anterior, response posterior, conflicto, rotación, preservación
QR/check-in y atomicidad ante fallo.

No hubo deploy, push, lecturas/escrituras productivas ni cambios de App Check.
