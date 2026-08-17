# Fase 6.4 · Invitaciones personalizadas

## Ruta

```text
/invitacion/?event={eventId}&key={publicKey}&token={rsvpToken}
```

`token` es opcional. Sin él, la página conserva el mismo render público genérico
de Fase 6.3. Con token, la página carga el RSVP Access existente mediante el
loader público canónico y sólo conserva `displayName` y `passLimit`.

El Access debe pertenecer al mismo evento, estar activo y no haber expirado. Una
key o publicación inválida mantiene “Invitación no disponible”; un RSVP token
inválido, inexistente, revocado, expirado o cross-event sólo desactiva la
personalización y no revela datos.

El CTA personalizado abre:

```text
/rsvp/?event={eventId}&token={rsvpToken}
```

La invitación pública nunca consulta `eventos/{eventId}/invitados`.

## Guest Manager

La acción **Copiar invitación** está disponible para roles internos con
`invitations:edit`. Lee el `publicKey` activo de
`eventos/{eventId}/invitacion/publication` y busca el RSVP Access activo y
vigente del invitado. Sólo compone y copia el enlace; no crea, sincroniza ni rota
tokens.

No se cambiaron Rules: las Rules existentes de RSVP Access ya permiten GET
exacto únicamente para Access válidos, activos y vigentes. No hubo deploy ni
push.
