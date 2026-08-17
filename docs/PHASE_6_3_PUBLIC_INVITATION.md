# Fase 6.3 · Invitación pública

## URL y datos

URL estable:

```text
/invitacion/?event={eventId}&key={publicKey}
```

Firestore:

```text
eventos/{eventId}/invitacion/publication
eventos/{eventId}/invitacion/publication/revisions/{revisionId}
eventos/{eventId}/invitacionPublic/{publicKey}
```

`publication` usa schema 2 y conserva un `publicKey` hexadecimal aleatorio de
192 bits. La key se crea sólo cuando el pointer todavía no tiene una y permanece
igual en publicaciones posteriores. Publicaciones schema 1 de Fase 6.2 se migran
sin duplicar su revisión si el contenido no cambió.

La proyección pública contiene exclusivamente schema/content schema, event/key,
revisión activa, las diez raíces renderizables y multimedia sanitizada. Los
assets conservan sólo URL HTTPS y metadata visual mínima; no exponen
`storagePath`, nombre original ni metadata del upload. RSVP, secciones de acceso
por invitado, auditoría, draft, tokens, invitados, QR y check-in quedan fuera.

## Runtime

`/invitacion/index.html` carga la proyección exacta y ejecuta el mismo
`admin/invitations/preview/frame.js` usado por el Builder. Por tanto usa los
mismos registries, adapters, bindings, plantillas y sanitización; no existe un
segundo renderer. Nunca consulta el draft ni usa defaults de Firestore. Un
documento ausente, una key incorrecta o una proyección inválida muestran
“Invitación no disponible”.

## Publicación y Rules

Una publicación nueva escribe revisión, pointer y proyección en la misma
transacción. Una publicación sin cambios no crea otra revisión; puede crear o
reparar la proyección existente. Las revisiones históricas permanecen
inmutables.

Rules permite GET únicamente al documento cuyo path, `eventId` y `publicKey`
coinciden. LIST/query y todas las escrituras públicas se deniegan. Los roles
internos de invitaciones conservan CREATE/UPDATE de pointer/proyección, con
enlace atómico a la revisión activa mediante `getAfter()`; no pueden rotar una
key ya establecida ni actualizar/borrar revisiones.

No hubo deploy ni push.
