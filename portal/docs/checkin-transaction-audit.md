# Auditoría de la transacción de check-in

## Código de error

La UI traduce `permission-denied` al mensaje "No tienes permisos para registrar
entradas en este evento". Los errores locales de entitlement usan códigos
`portal/feature-not-enabled`; por tanto el mensaje reportado corresponde a un
rechazo de Firestore, no al guard local.

No se pudo descargar el ruleset desplegado: Firebase CLI no ofrece un comando
`firestore:rules:get` y el repositorio no conserva `firestore.rules`. La
comparación siguiente usa el último ruleset que existió en Git y debe verificarse
contra Firebase Console.

## Orden exacto

1. `READ eventos/{eventId}`: existencia y locks
   `guestRenumberingInProgress`/`checkinRenumberingInProgress`.
2. `READ eventos/{eventId}/invitados/{guestId}`: contrato de pases, QR,
   `checkinSecuencia`, identidad e historial de primera llegada.
3. `READ eventos/{eventId}/checkins/{checkinId}`: confirma que el ID siguiente
   no existe.
4. `UPDATE eventos/{eventId}/invitados/{guestId}`.
5. `CREATE eventos/{eventId}/checkins/{checkinId}`.

La regresión introducida por el commit de estadísticas agregaba un paso 6:
`UPDATE eventos/{eventId}`. Se eliminó porque la política histórica reservaba
ese update a roles administrativos y porque autorizar deltas agregados desde el
cliente sin una identidad de invitado verificable ampliaría indebidamente la
superficie de escritura.

## affectedKeys del primer ingreso real

Para `INV-0006`, dos pases disponibles, cero utilizados y primer ingreso:

| Campo | Write real | Propuesta permite | Validación |
|---|---:|---:|---|
| `pasesUtilizados` | `0 → 1` | Sí | incremento positivo y simétrico |
| `pasesDisponibles` | `2 → 1` | Sí | decremento igual |
| `llegadaRegistrada` | `false → true` | Sí | debe quedar `true` |
| `horaLlegada` | ausente/null → `request.time` | Sí | primera hora inmutable después |
| `estado` | pendiente → `llego` | Sí | valor exacto |
| `checkinSecuencia` | `N → N+1` | Sí | incremento exacto |
| `ultimoCheckinId` | anterior/ausente → `INV-0006-NNN` | Sí | exige create atómico |
| `fechaActualizacion` | anterior → `request.time` | Sí | timestamp del servidor |

El ruleset histórico solo permitía los seis campos anteriores al contador;
por ello rechazaba `checkinSecuencia`. También exigía un documento de check-in
sin el campo `checkinSecuencia`, mientras que el código actual sí lo crea.

## Documento check-in

Ruta: `eventos/EVT-0001/checkins/INV-0006-NNN`.

Campos exactos: `eventId`, `invitadoId`, `codigoInvitado`, `nombreInvitado`,
`pasesRegistrados`, `pasesDisponiblesDespues`, `fechaHora`, `registradoPor`,
`metodo`, `resultado`, `checkinSecuencia`.

La propuesta valida el formato `^INV-[0-9]{4,}-[0-9]{3,}$`, UID, timestamp,
aritmética, resultado, secuencia y correspondencia con el invitado resultante.

## Estadísticas

El write eliminado sobre el padre afectaba `statsRevision`, `estadisticas`,
`statsSchemaVersion` y `statsUpdatedAt`. En el caso de un invitado pendiente de
dos pases que registra uno, el delta calculado era:

- `pasesUtilizados +1`, `pasesDisponibles -1`.
- `pasesConfirmados +2`, `pasesPendientes -2`.
- `gruposConfirmados +1`, `gruposPendientes -1`, `gruposConLlegada +1`.

Este delta queda definido y probado para ejecutarse desde confianza. Mientras
no exista ese backend, el Portal muestra estadísticas en vivo desde invitados y
ADMIN puede reconciliar `event.estadisticas`; no se abre write del padre al
cliente.

## Access calls

La propuesta usa por operación el perfil, el evento y el invitado/check-in
correlacionado. Aun contando conservadoramente las evaluaciones de ambos writes,
queda por debajo de 10 llamadas por operación y 20 por transacción. Las rutas
repetidas pueden ser cacheadas por Firestore Rules.
