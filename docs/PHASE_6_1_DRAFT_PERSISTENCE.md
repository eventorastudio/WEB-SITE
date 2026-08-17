# Fase 6.1 · Persistencia del draft general

## Path y responsabilidad

El draft general vive exclusivamente en:

```text
eventos/{eventId}/invitacion/draft
```

Es independiente de `invitacion/config` y su subcolección `media`, de
`invitacion/rsvp` y de todos los documentos RSVP públicos/operativos. Esta fase
no publica invitaciones y no modifica guest, QR ni check-in.

## Shape persistido

El documento tiene keys exactas:

```js
{
  schemaVersion: 2,
  contentSchemaVersion: 4,
  eventId,
  theme,
  sections,
  content,
  locations,
  itinerary,
  gifts,
  accommodations,
  links,
  appearance,
  settings: { renderMode: 'builder', packageId },
  updatedAt: serverTimestamp(),
  updatedBy: auth.currentUser.uid
}
```

`content` contiene sólo las catorce ramas generales y excluye `rsvp`. El
serializador reconstruye cada rama desde una whitelist, normaliza las cinco
colecciones y rechaza IDs, ownership, versiones o valores inválidos. En 6.1
`appearance` se conserva como mapa vacío versionado; no se inició el editor de
appearance. Nunca se copian `media`, `mediaIndex`, access tokens ni datos
guest/check-in.

Fase 6.1B eleva el schema de persistencia a 2 para incluir `accommodations`. Los
documentos schema 1, cuya forma exacta no contenía esa colección, se migran en
lectura usando el default vigente `[]`; la hidratación no provoca un write.

## Hidratación y guardado

El arranque lee el evento, inicializa los defaults y luego intenta cargar el
draft general antes de RSVP y multimedia. Un documento ausente conserva los
defaults sin escribir. Un documento compatible se normaliza al content schema
vigente, se hidrata y queda clean; versiones desconocidas o formas no canónicas
se rechazan.

El header ofrece **Guardar borrador**. `ui.generalDraftDirty` representa sólo
theme, sections, content general, locations, itinerary, gifts, accommodations,
links, appearance y settings. Un write exitoso lo limpia si su fingerprint aún
coincide; nunca limpia `rsvpDirty` ni `mediaDirty`. No existe autosave.

## Rules y pruebas

Rules permite GET/CREATE/UPDATE del documento exacto sólo a los claims que el
catálogo interno mapea a `invitations:edit`: CEO, Administrador y Diseñador
(`ADMIN` se conserva como alias legacy). CLIENTE, otros roles internos, público,
list y delete permanecen denegados.

Las pruebas dirigidas de Fase 6.1 cubren save+reload, ausencia de documento,
separación RSVP/media, dirty independiente, whitelist y denegación sin permiso.
Fase 6.1B añade roundtrip de accommodations y migración del documento schema 1.
Se ejecutan aisladas; no requieren ni realizan deploy.
