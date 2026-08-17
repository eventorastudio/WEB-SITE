# Fase 6.2 · Publicación versionada

## Paths

```text
eventos/{eventId}/invitacion/publication
eventos/{eventId}/invitacion/publication/revisions/{revisionId}
```

`publication` guarda el pointer activo con `schemaVersion`, `eventId`,
`currentRevisionId`, `currentRevisionNumber`, `publishedAt` y `publishedBy`.
Los IDs son secuenciales y deterministas: `REV-000001`, `REV-000002`, etc.

Cada revisión contiene `schemaVersion`, `contentSchemaVersion`, `eventId`,
`revisionNumber`, `publishedAt`, `publishedBy` y un snapshot de:

- `theme`
- `sections`
- `content`
- `locations`
- `itinerary`
- `gifts`
- `accommodations`
- `links`
- `appearance`
- `settings`

El snapshot reutiliza la whitelist y validación del draft general. Por ello no
incluye `content.rsvp`, media, archivos, tokens, guest, QR ni check-in.

## Transacción e idempotencia

Publicar lee el pointer y su revisión activa dentro de `runTransaction()`. El
snapshot actual se normaliza y compara sin timestamps. Si no cambió, el servicio
devuelve `unchanged` y no escribe. Si cambió, comprueba que el siguiente ID no
exista, crea la revisión y actualiza el pointer en la misma transacción.

Las revisiones previas nunca se reescriben. El botón **Publicar** no guarda el
draft ni limpia `generalDraftDirty`; **Guardar borrador** conserva su ciclo
independiente.

## Rules

CEO, Administrador y Diseñador pueden leer el pointer/lista de revisiones y crear
una publicación transaccional. Rules exige raíces persistidas exactas, ownership,
límites, secuencia, timestamp/UID de servidor y enlace atómico mediante `getAfter()`. UPDATE y DELETE
de revisiones están siempre denegados. CLIENTE, VENTAS y público no pueden leer ni
escribir estos paths.

No hubo deploy ni se habilitó una invitación pública.
