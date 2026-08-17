# Fase 5.1 · Contrato canónico RSVP

## Estado anterior

El Builder ya tenía una raíz única `draft.content.rsvp` con `title`, `message`,
`buttonLabel` y `deadline`, cuatro bindings semánticos y una validación opcional
de deadline. Los once demos públicos ya incluían un área/CTA RSVP dentro de
`guest-control`. No existían método, teléfono, política de pases, textos de
respuesta ni un bloque RSVP para Personalizada.

La persistencia general del draft no está implementada. Firestore sólo persiste
el contrato multimedia normalizado en `eventos/{eventId}/invitacion/config` y su
subcolección `media`; esa frontera no cambia en esta fase.

## Contrato final

La fuente de verdad continúa siendo `draft.content.rsvp`:

```js
{
  enabled: true,
  title: '',
  message: '',
  buttonLabel: '',
  deadline: '',                 // YYYY-MM-DD
  method: 'internal',           // 'internal' | 'whatsapp'
  whatsapp: { phone: '', message: '' },
  guestPolicy: 'assigned-only', // o 'select-up-to-assigned'
  responses: {
    acceptedLabel: '',
    declinedLabel: '',
    confirmationMessage: ''
  }
}
```

Los cuatro campos anteriores se reutilizan sin aliases. Los campos nuevos son
`enabled`, `method`, `whatsapp`, `guestPolicy` y `responses`. El draft conserva
`schemaVersion: 5` porque ese valor también protege el write multimedia
productivo. La evolución estructural se expresa con `contentSchemaVersion: 3`.
`migrateInvitationDraftContent()` normaliza el shape anterior sin perder sus
cuatro campos.

## Arquitectura

- `rsvp-schema.js` define defaults, enums, normalización y policy efectiva.
- `builder-validation.js` expone `validateRsvpConfig()` y la reutiliza dentro de
  `validateInvitationDraft()`.
- `SECTION_EDITOR_REGISTRY.rsvp` declara switch, copy, método, WhatsApp, policy y
  textos de respuesta. Se mantiene en el paso 03 Información.
- `editor-fields.js` soporta boolean, select y condiciones visibles sin crear un
  segundo sistema de formularios.
- `phase5-rsvp-bindings.js` aplica un adapter común a las once colecciones y a
  Personalizada. Sólo añade DOM en Builder Template Mode; no modifica demos.
- El controlador continúa enviando `UPDATE` con debounce de 80 ms. Sólo un
  cambio de tema provoca `RENDER`.

## Paquetes y pases

RSVP proviene de la matriz comercial y está disponible desde Esencial. La policy
`select-up-to-assigned` deriva su disponibilidad de `pass-selection`, disponible
desde Premium. Un downgrade a Esencial aplica `assigned-only` en preview, pero
conserva la selección superior en el draft; un upgrade la restaura. Ninguna
opción permite pases o acompañantes fuera del límite futuro del invitado.

## Touched y explicit clear

Todo path editado entra en `meta.touchedPaths`, incluso si termina vacío.
Untouched permite el fallback propio de cada template; un valor real lo
reemplaza; explicit clear oculta el nodo y no revive al cambiar de tema. Apagar
`content.rsvp.enabled` o la sección RSVP sólo cambia visibilidad: no borra datos.

## Validación y seguridad

Con RSVP activo se valida fecha calendárica, método, policy y, para WhatsApp,
teléfono obligatorio de 7 a 15 dígitos. RSVP inactivo omite requisitos activos y
retiene datos. El sanitizador existente rechaza `javascript:`, `data:` y
`vbscript:` antes de extraer dígitos. `buildWhatsAppUrl()` continúa como único
constructor y produce exclusivamente `https://wa.me/...`.

Los bindings usan `textContent`, no crean `onclick`, eliminan `target`/`rel` del
CTA y el iframe intercepta WhatsApp/internal con “Vista del editor”. El switch
usa flujo normal (`position: static`) y el editor conserva `scrollTop` y foco.

## Persistencia y Firebase

En el alcance histórico de Fase 5.1, RSVP quedó preparado en el draft local y el
payload de preview, sin persistencia. Fase 5.2 añadió después un documento interno
independiente en `eventos/{eventId}/invitacion/rsvp`; el contrato y sus límites se
documentan en `docs/PHASE_5_2_RSVP_PERSISTENCE.md`. `mediaIndex` continúa siendo
exclusivamente multimedia y Fase 5.1 sigue sin incluir runtime público.

## Pruebas

`tests/invitation-builder-phase51.test.mjs` añade 35 casos: contrato/defaults,
enabled/disabled, fechas, métodos, teléfono/URL, touched/clear, paquetes, 11
temas, Personalizada, copy neutral, XSS, intercepción, UPDATE sin reload,
dirty/mediaDirty, scroll, regresiones Fase 3/Multimedia y root inmutable.

## Continuidad

Fase 5.2 persiste únicamente esta configuración administrativa. El runtime
público, autenticación/token RSVP, lectura del límite real de pases y respuestas
de invitados permanecen fuera de ambas fases y corresponden a Fase 5.3. No se
crearon endpoint público, tokens ni respuestas reales.
