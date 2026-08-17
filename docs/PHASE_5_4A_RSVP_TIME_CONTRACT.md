# Fase 5.4A · Contrato temporal canónico RSVP

## Resultado y alcance

Fase 5.4A elimina la ambigüedad de `deadline: YYYY-MM-DD` sin iniciar todavía
el RSVP público funcional. No crea `rsvpPublic`, `rsvpResponses`, acciones de
aceptar/declinar ni permisos públicos de escritura.

El schema global del draft permanece en 5. `contentSchemaVersion` sube de 3 a 4
y el documento privado `eventos/{eventId}/invitacion/rsvp` sube de
`schemaVersion: 1` a 2.

## Contrato editorial

La única raíz editable continúa siendo `draft.content.rsvp`:

```js
{
  deadline: '2026-12-20',
  deadlineTime: '18:30',
  deadlineTimeZone: 'America/Mexico_City'
}
```

`deadline` usa `YYYY-MM-DD`; `deadlineTime`, `HH:mm` de 24 horas; y
`deadlineTimeZone`, un ID IANA reconocido por `Intl.DateTimeFormat`. No se
aceptan abreviaturas como `CST`, offsets `UTC-6` ni zonas fijas `Etc/GMT+6`.

Los tres valores vacíos son un estado válido sin cierre. Cualquier combinación
parcial es inválida. Un deadline legacy se conserva, pero no recibe hora o zona
inventadas.

## Derivación y DST

`deriveRsvpResponseClosesAt()` interpreta explícitamente la fecha/hora en la
zona IANA, sin usar la zona del navegador. Compara candidatos UTC formateados
con `Intl.DateTimeFormat.formatToParts()` y produce un único `Date` que representa
el instante absoluto. El gateway administrativo lo convierte mediante
`Timestamp.fromDate()` antes de serializar.

Si no existe deadline, devuelve `null`. Si la hora local no existe durante un
adelanto DST, o corresponde a dos instantes durante un retroceso, la derivación
se rechaza. La política deliberada para ambos casos es pedir al administrador
otra hora; nunca se desplaza ni elige una ocurrencia silenciosamente.

## Documento privado v2

Además del contrato previo, el shape exacto añade:

```js
{
  schemaVersion: 2,
  contentSchemaVersion: 4,
  deadline,
  deadlineTime,
  deadlineTimeZone,
  responseClosesAt: Timestamp | null
}
```

`responseClosesAt` es derivado y no pertenece al draft. La hidratación devuelve
el Timestamp como metadata persistida, pero sólo copia fecha, hora y zona al
editor. Esto no activa `draftDirty`, `rsvpDirty` ni altera `mediaDirty`.

## Editor y touched paths

Paso 03 muestra Fecha límite, Hora límite y un input buscable respaldado por
`Intl.supportedValuesOf('timeZone')` cuando está disponible. La zona detectada
se presenta únicamente como placeholder sugerido: el administrador debe elegir
o escribir y confirmar el ID IANA.

`content.rsvp.deadlineTime` y `content.rsvp.deadlineTimeZone` forman parte de la
whitelist touched. Los paths anteriores se conservan; limpiar explícitamente
fecha, hora y zona sobrevive serialización, carga e hidratación.

## Migración

Drafts de contenido v3 se normalizan a v4. Documentos RSVP v1/v3 se leen con su
shape estricto anterior, conservan `deadline`, inicializan hora/zona vacías y
exponen `responseClosesAt: null`. Si el deadline legacy tenía valor, la validación
impide un nuevo write hasta que el administrador complete o elimine el cierre.
Todo save exitoso escribe únicamente v2/v4.

## Rules y frontera de confianza

Rules acepta dos estados:

- fecha, hora y zona vacías con `responseClosesAt == null`;
- fecha, hora y zona con formato válido y `responseClosesAt` Timestamp.

Firestore Rules no puede convertir una fecha IANA ni demostrar que el Timestamp
corresponde matemáticamente a los tres campos editoriales. La frontera de
confianza es que sólo CEO, `ADMINISTRADOR`/`ADMIN` y `DISENADOR` pueden crear o
actualizar el documento privado. Cliente y anónimo continúan denegados; delete
permanece denegado.

## Uso futuro

Fase 5.4 copiará el `responseClosesAt` ya persistido a su proyección pública y
autorizará con `responseClosesAt == null || request.time < responseClosesAt`.
El runtime público no lo recalculará y no confiará en `Date.now()` ni en la zona
del navegador invitado.
