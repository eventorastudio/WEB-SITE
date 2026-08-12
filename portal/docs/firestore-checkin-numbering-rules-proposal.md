# Parche propuesto de Rules para check-in secuencial

El repositorio no contiene las Rules desplegadas. El archivo
`firestore.rules.proposed` es una reconstrucción revisable basada en el último
ruleset que existió en Git; **no afirma representar producción y no fue
desplegado**. Antes de usarlo se debe copiar el ruleset real desde Firebase
Console a `firestore.rules` y comparar ambos archivos.

## Writes reales después de la corrección

La transacción del Portal contiene exactamente dos escrituras:

1. `UPDATE eventos/{eventId}/invitados/{guestId}`.
2. `CREATE eventos/{eventId}/checkins/{guestId}-{secuencia}`.

El cliente Portal no actualiza `eventos/{eventId}`. Darle ese permiso permitiría
alterar el agregado sin que la Rule del documento padre pueda descubrir qué
invitado originó el delta. Esa reconciliación pertenece a un backend confiable.

La whitelist del invitado es:

```text
pasesUtilizados, pasesDisponibles, llegadaRegistrada, horaLlegada, estado,
checkinSecuencia, ultimoCheckinId, fechaActualizacion
```

`ultimoCheckinId` permite que la Rule del invitado use `existsAfter()` y
`getAfter()` para exigir la creación atómica del historial correspondiente. Sin
ese enlace, una Rule que solo valida `checkinSecuencia + 1` permitiría incrementar
el contador sin crear un check-in.

El documento nuevo admite exclusivamente:

```text
eventId, invitadoId, codigoInvitado, nombreInvitado, pasesRegistrados,
pasesDisponiblesDespues, fechaHora, registradoPor, metodo, resultado,
checkinSecuencia
```

El ID debe satisfacer `^INV-[0-9]{4,}-[0-9]{3,}$`, corresponder al invitado y
ser igual a `ultimoCheckinId`. El contador del documento debe coincidir con el
contador incrementado del invitado.

## Access calls

Cada evaluación consulta como máximo el perfil, el evento y el par relacionado
invitado/check-in. Las rutas repetidas son cacheables por Rules. La transacción
queda debajo de los límites de 10 llamadas por operación y 20 por transacción.
No se exige `historialAccesos` ni `seguimientoEnVivo` para registrar: solo
cliente activo, evento asignado, `portalCliente` y `checkInQR`.

## Publicación

No se debe copiar la propuesta a producción a ciegas. Primero hay que fusionar
las rutas o roles adicionales presentes en las Rules reales y ejecutar las
pruebas con Emulator Suite. El repositorio no contiene `firebase.json`, por lo
que el archivo propuesto tampoco queda conectado accidentalmente a un deploy.
