# Invitation Builder · Arquitectura de Fases 1, 2 y 2.1

## Alcance

Las fases 1, 2 y 2.1 implementan una aplicación administrativa dedicada para
seleccionar un evento existente, paquete, colección y secciones; editar contenido
canónico por módulo; y comprobar el resultado en una preview real. El draft vive
únicamente en memoria. No existe autosave, publicación, Storage ni escritura de
configuraciones en Firestore.

Ruta final: `/admin/invitations/builder.html?event={documentId}`.

Las dos entradas usan la misma aplicación:

- Dashboard → **Crear invitación** → selector de evento → Builder.
- Administrar evento → pestaña **Invitación** → **Crear / editar invitación** →
  Builder con el `documentId` en `?event=`.

## Auditoría de la arquitectura encontrada

### ADMIN

El ADMIN es vanilla HTML/CSS/JavaScript con módulos ES:

- `admin/dashboard.js` protege el Dashboard con Firebase Auth, resuelve el rol
  desde custom claims y verifica App Check antes de listar `eventos`. Este
  archivo aún consulta Firestore directamente para listado y creación.
- `admin/event.js` es el orquestador de un evento. Construye un contenedor de
  dependencias con `state`, `ui`, `eventBus`, servicios y `eventContext`.
- `admin/core/state.js` mantiene contexto efímero global de sesión/evento/UI. Su
  contrato prohíbe almacenar formularios grandes o drafts sin guardar.
- `admin/core/event-bus.js` implementa pub/sub y `event-types.js` mantiene las
  constantes centrales.
- `admin/core/roles.js` resuelve exclusivamente `role`/`userRole` de custom
  claims. La ausencia de claim no eleva a CEO.
- `admin/services/` es la frontera de Firebase para Auth, eventos, invitados,
  estadísticas y temas en la vista de evento.
- `admin/modules/event-controller.js` controla pestañas, información, invitados,
  estadísticas y configuración mediante el contenedor inyectado.
- Los módulos anteriores `modules/editor/invitation-editor.js` e
  `invitation-preview.js` pertenecen a un editor legacy oculto dentro de
  `event.html`; guardan en la colección raíz `themes` y no renderizan las once
  colecciones. No constituyen una base apropiada para el Builder nuevo.

Decisión: el Builder reutiliza Auth, roles, permisos, Event Bus, UI,
`eventService` y el contexto global mínimo. Conserva su propio estado porque el
contrato de `admin/core/state.js` excluye explícitamente drafts de formularios.

### Firebase

`admin/firebase.js` inicializa una sola app con Firebase Auth, Firestore y App
Check/reCAPTCHA. El Builder importa servicios existentes, por lo que no duplica
ni modifica `firebaseConfig`, Auth o App Check.

La propuesta local `firestore.rules.proposed` (no enlazada a `firebase.json` y
no necesariamente desplegada) define:

- lectura de eventos para roles internos;
- mutación de eventos/invitados para gestores de plataforma;
- edición de `themes` para CEO, Administrador y Diseñador;
- acceso Portal por perfil `usuarios/{uid}`, asignación de evento y entitlements;
- denegación por defecto de cualquier ruta no declarada.

Incompatibilidad futura documentada: la ruta recomendada para persistir drafts
no está contemplada por la propuesta actual y quedaría denegada. Las Rules
deberán diseñarse, probarse en Emulator Suite y desplegarse manualmente en una
fase de persistencia. No se cambiaron Rules en Fase 1.

### Modelo de evento real

La colección canónica es `eventos/{eventId}`; `eventId` es el ID del documento,
no necesariamente `codigoEvento`. La creación actual produce estos campos:

- identidad: `codigoEvento`, `claveAcceso`, `nombreEvento`, `tipoEvento`;
- agenda/lugar: `fecha`, `hora`, `pais`, `estado`, `ciudad`;
- presentación básica: `descripcion`, `portada`, `colorPrimario`,
  `colorSecundario`;
- operación: `tipoAcceso`, `estadoEvento`, `aforoEstimado`;
- estadísticas: `estadisticas`, `statsSchemaVersion`, `statsRevision`,
  `statsUpdatedAt`;
- invitados: `guestListFinalized`, `guestSequence` y banderas temporales de
  renumeración cuando aplican;
- auditoría: `fechaCreacion`, `fechaActualizacion`, `administrador`;
- Portal, cuando está contratado/configurado: mapa `funcionalidades` con
  `portalCliente`, `checkInQR`, `seguimientoEnVivo` e `historialAccesos`.

Relaciones encontradas:

- `eventos/{eventId}/invitados/{guestId}`: invitados, pases, RSVP y QR.
- `eventos/{eventId}/checkins/{checkinId}`: historial inmutable de accesos.
- `usuarios/{uid}`: perfil Portal, estado y `eventosPermitidos`.
- `themes/{themeId}`: temas del editor ADMIN legacy; no es un segundo sistema de
  eventos ni el registro de colecciones públicas.

El Portal Prestige usa el mismo evento, sus invitados y entitlements. No importa
módulos ADMIN y no fue modificado.

Riesgo de datos encontrado: los eventos creados actualmente no incluyen un
campo comercial de paquete. El Builder intenta leer `packageId`, `paqueteId` o
`paquete`; si no existe o no es válido, conserva `packageId = null` y exige una
selección local explícita antes de permitir secciones. No inventa Esencial ni
escribe esa elección. `meta.packageSource` distingue `event`, `local-selection`
y `unselected`.

### Página pública y colecciones

`principal/index.html` declara once colecciones. Sus rutas reales son:

| ID del Builder | Colección | Plantilla local |
| --- | --- | --- |
| `aloha` | Aloha | `/principal/demos/xv-renatta/index.html` |
| `luxury` | Luxury | `/principal/demos/luxury/index.html` |
| `botanical` | Botanical | `/principal/demos/botanical/index.html` |
| `midnight` | Midnight | `/principal/demos/midnight/index.html` |
| `romance` | Romance | `/principal/demos/romance/index.html` |
| `minimal` | Minimal | `/principal/demos/minimal/index.html` |
| `celestial` | Celestial | `/principal/demos/celestial/index.html` |
| `vintage` | Vintage | `/principal/demos/vintage/index.html` |
| `garden` | Garden | `/principal/demos/garden/index.html` |
| `champagne` | Champagne | `/principal/demos/champagne/index.html` |
| `neon-party` | Neon Party | `/principal/demos/neon-party/index.html` |

Aloha conserva el ID comercial `aloha`, aunque su carpeta histórica real sea
`xv-renatta`. Los covers del selector apuntan a assets existentes en
`principal/demos/assets/images/`; no se duplican en ADMIN.

### Arquitectura Prestige y demos

`principal/demos/prestige-contract.js` es el contrato ejecutable. Exporta la
matriz comercial, capacidades observables, secciones/interacciones requeridas y
campos de configuración. Las once demos cargan `demo-runtime.js` y un `EVENT`
propio con `demoMode: true`, fecha, música, enlaces y copys.

El runtime compartido cubre apertura, personalización `?nombre=&pases=`, música
tras interacción, countdown, pases, acceso digital/impreso, video, reveals y
Demo Notice. En `demoMode`, Maps, WhatsApp, regalos, hotel, Instagram y calendario
no salen de la página. Una invitación futura usaría `demoMode: false`; el Builder
usa un tercer contexto explícito, `renderMode: "builder"`, sin convertir Demo
Mode en producto.

Las demos públicas no fueron editadas. El adaptador de preview consume su HTML y
CSS local como plantillas de solo lectura.

### Paquetes y matriz funcional

Fuente comercial: `/paquetes/index.html`. Premium acumula Esencial y Prestige
acumula Premium. `section-registry.js` importa directamente `PACKAGE_MATRIX` y
`PRESTIGE_COMMERCIAL_DEMO_MAP` para evitar otra fuente comercial divergente.

| Funcionalidad | Esencial | Premium | Prestige |
| --- | :---: | :---: | :---: |
| Diseño 100% personalizado | ✓ | ✓ | ✓ |
| Música personalizada | ✓ | ✓ | ✓ |
| Confirmación RSVP | ✓ | ✓ | ✓ |
| Cuenta regresiva | ✓ | ✓ | ✓ |
| Google Maps | ✓ | ✓ | ✓ |
| Dress Code | ✓ | ✓ | ✓ |
| Compatible con cualquier dispositivo | ✓ | ✓ | ✓ |
| Video de bienvenida |  | ✓ | ✓ |
| Galería de fotografías |  | ✓ | ✓ |
| Mesa de regalos |  | ✓ | ✓ |
| Selección inteligente de pases |  | ✓ | ✓ |
| Animaciones premium |  | ✓ | ✓ |
| Múltiples ubicaciones |  |  | ✓ |
| Itinerario del evento |  |  | ✓ |
| Pases personalizados |  |  | ✓ |
| Control avanzado de invitados |  |  | ✓ |
| Personalización avanzada |  |  | ✓ |

Atención personalizada, más cambios incluidos y atención prioritaria son
beneficios de servicio; no se convierten artificialmente en secciones.

## Arquitectura del Builder

```text
admin/invitations/
├── builder.html                 shell y tres áreas de trabajo
├── builder.css                  UI productiva y responsive
├── builder.js                   auth, routing, DI y ciclo de vida
├── core/
│   ├── builder-events.js        mensajes tipados de preview/dispositivos
│   ├── builder-routing.js       contrato ?event=
│   ├── builder-state.js         draft local central e inmutable al leer
│   ├── builder-validation.js    validación canónica pura y no bloqueante
│   ├── content-schema.js        schema, whitelist de paths y precarga
│   ├── section-editor-registry.js campos editables de cada sección
│   ├── section-registry.js      paquetes, capacidades y secciones
│   ├── template-binding-registry.js adapters de las once colecciones
│   └── theme-registry.js        doce opciones de tema
├── editors/
│   ├── editor-fields.js         controles reutilizables y contadores
│   ├── identity-editor.js       información general canónica
│   └── section-copy-editor.js   editores modulares según sección activa
├── modules/
│   ├── event-selector.js
│   ├── package-selector.js
│   ├── theme-selector.js
│   ├── section-selector.js
│   └── preview-controller.js
└── preview/
    ├── frame.html               documento aislado
    ├── frame.css                estados base y tema Personalizada
    └── frame.js                 loader/adaptador seguro de plantillas
```

`basic-information.js` se conserva únicamente como adaptador legacy y mapea sus
campos al schema anidado; el flujo actual monta los editores de `editors/`.

`builder.js` es un orquestador, no un contenedor de toda la lógica. La frontera
de Firestore sigue siendo `eventService`; los módulos visuales no importan
Firebase.

### Seguridad y permisos

Se añadió el permiso central `invitations:edit`:

- CEO: incluido por `Object.values(PERMISSIONS)`.
- Administrador: permitido.
- Diseñador: permitido.
- Ventas, Soporte y Cliente: denegado.

El Builder exige sesión, rol interno válido y el permiso. Un usuario autenticado
sin claim no accede y nunca se interpreta como CEO. Los accesos del Dashboard y
del evento se revelan únicamente cuando el mismo permiso está presente.

### Plataforma de producción: computadora

El editor ADMIN es exclusivo para computadora. La decisión se toma después de
Auth/roles y antes de cargar el evento o montar módulos. El contrato central está
en `core/builder-platform.js`:

- ancho mínimo: `1100px`, derivado de las tres columnas mínimas del workspace;
- entrada primaria con `hover: hover` y `pointer: fine`;
- teléfono o tablet táctil: pantalla **Disponible en computadora** y cero montaje
  de selectores, state del draft o controlador de preview;
- computadora con ventana menor a 1100px: **Amplía la ventana para continuar**;
- si el editor ya inició, reducir y restaurar la ventana nunca reinicializa ni
  destruye el draft local.

La plataforma física del Builder no modifica `ui.previewDevice`. Desde una PC se
mantienen las previews Mobile, Tablet y Desktop de la invitación pública.

`#invitation-builder-root` es una referencia inmutable. Sidebar, editor y preview
son regiones permanentes (`data-builder-region`) y ningún módulo interno puede
ejecutar `replaceChildren`, `innerHTML`, `replaceWith` o `remove` sobre el root.
Cada render controla únicamente su contenedor asignado.

El stepper tampoco usa `scrollIntoView()` sobre regiones del shell. Cambiar de
etapa desplaza sólo `.builder-editor`, lo que impide mover el documento raíz y
dejar fuera de viewport el sidebar o el preview.

El modo `?debugBuilder=1` registra viewport, estado no sensible y geometría de las
regiones, además de `message`, archivo, línea, columna y stack para errores globales.
No registra usuario, tokens, claims ni credenciales. Los assets del Builder usan
una versión explícita en la URL porque el hosting puede conservar JavaScript/CSS
durante cuatro horas; así no se mezclan módulos de dos despliegues distintos.

### THEME_REGISTRY

Contiene `aloha`, `luxury`, `botanical`, `midnight`, `romance`, `minimal`,
`celestial`, `vintage`, `garden`, `champagne`, `neon-party` y `custom`. Cada
entrada define nombre, descriptor, categoría, cover, `templatePath`, paleta,
capacidades y `bindingAdapterId`. Las rutas aparecen una sola vez. Los selectores
DOM viven exclusivamente en `TEMPLATE_BINDING_REGISTRY`, no duplicados dentro de
la metadata del tema.

`custom` renderiza una base simple y comunica que el control visual avanzado
pertenece a una fase futura.

### TEMPLATE_BINDING_REGISTRY

Define un adapter explícito para Aloha, Luxury, Botanical, Midnight, Romance,
Minimal, Celestial, Vintage, Garden, Champagne y Neon Party. Cada adapter declara
los nodos de identidad, fecha/contexto y bienvenida propios de la colección; el
resto de módulos usa los hooks semánticos existentes de Prestige. El registry:

- escribe contenido administrativo sólo mediante `textContent`;
- conserva los nodos originales del template como fallback visual sólo mientras
  su campo o sección no se haya configurado;
- reemplaza el copy demo completo de una sección en cuanto cualquiera de sus
  campos contiene valor o fue editado;
- transforma nombres y fecha sin homogeneizar el estilo de cada colección;
- construye un contrato de visibilidad por sección y un grupo compuesto para
  RSVP, pases y acceso, que comparten contenedor en las demos.

Las demos de `/principal/demos/` siguen siendo archivos de solo lectura para el
Builder y no fueron modificadas en Fase 2.1.

### Builder Template Mode

La preview distingue dos contextos sin modificar las colecciones públicas:

- **Public Demo Mode** ejecuta el HTML de demostración tal como existe en
  `/principal/demos/`, incluidos sus ejemplos de boda, XV o fiesta.
- **Builder Template Mode** carga una copia DOM dentro del iframe, elimina scripts
  demo y ejecuta `prepareBuilderTemplate()` antes de aplicar contenido. Los
  adapters asignan ownership semántico, ocultan decoración/event copy incompatible
  y preparan hooks de visibilidad exclusivamente en esa copia.

La secuencia final es:

```text
load template -> remove demo scripts -> prepare builder template
              -> apply canonical content -> apply enabled sections -> render
```

La política central de fallback usa `draft.meta.touchedPaths`:

| Estado del campo/sección | Resultado en Builder |
| --- | --- |
| Untouched y sin valor | fallback demo permitido |
| Touched con valor | contenido del draft |
| Touched y vacío | nodo oculto; el demo no reaparece |
| Sección con cualquier campo real/touched | sólo copy canónico; media demo permitida |

`sectionHasRealContent()` toma la decisión una sola vez para todas las
colecciones. Cada path adquiere un nodo con `data-builder-binding-owner`; si dos
paths intentan escribir el mismo nodo, el renderer reporta una colisión. La
neutralización de textos event-specific se hace mediante nodos DOM y metadata del
adapter, nunca con reemplazos globales de strings.

### Cobertura semántica Fase 2.1

La métrica se deriva de `INVITATION_EDITABLE_FIELDS`, los campos de los editores
y los paths realmente declarados por los bindings. El contrato actual contiene
46 fields editables y los 11 adapters resuelven 46/46 sin ownership collisions.

| Theme | Identity | Welcome | Countdown | Location | DressCode | RSVP | Music | Video | Gallery | Gifts | Passes | Itinerary | Access |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Aloha | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Luxury | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Botanical | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Midnight | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Romance | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Minimal | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Celestial | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Vintage | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Garden | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Champagne | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Neon Party | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

### SECTION_REGISTRY

El registro deriva capacidades de Prestige/paquetes y expone: bienvenida e
historia, countdown, ubicación/mapa, Dress Code, RSVP, música, video, galería,
regalos, selección de pases, itinerario, pase personalizado y sección especial.

Una sección bloqueada no puede activarse. Si se activa en un paquete superior y
después se baja el paquete, su ID permanece en `enabledSections`, aparece como
**Conservada** y no se borra. La advertencia/decisión final de downgrade queda
para la fase de persistencia.

`SECTION_EDITOR_REGISTRY` es el contrato separado de edición. Cubre las trece
secciones y declara título, texto de alcance futuro y fields pertenecientes a la
whitelist del schema. Sólo se muestran editores de secciones activas; desactivar
una sección oculta el editor y el preview, pero nunca borra su contenido.

### Modelo `invitationDraft`

```js
{
  schemaVersion: 3,
  contentSchemaVersion: 1,
  eventId,
  packageId: null | 'esencial' | 'premium' | 'prestige',
  themeId,
  enabledSections: [],
  content: {
    identity: { primaryName, secondaryName, eventType, phrase },
    schedule: { date, time },
    place: { city, state },
    welcome: { title, message, story },
    countdown: { title, preMessage },
    location: { title, description, buttonLabel },
    dressCode: { title, name, description, paletteLabel },
    rsvp: { title, message, buttonLabel, deadline },
    music: { title, description },
    video: { title, description },
    gallery: { title, subtitle, description },
    gifts: { title, message, buttonLabel },
    passes: { title, message },
    itinerary: { title, intro },
    access: { title, message }
  },
  media: { hero, gallery, audio, video },
  locations: [{ name, address, city, state, mapsUrl }],
  itinerary: [],
  gifts: [],
  links: {},
  appearance: {},
  settings: { renderMode: 'builder' },
  meta: { packageSource, loadedAt, touchedPaths: [] }
}
```

Tema y contenido están desacoplados: `setTheme()` solo cambia `themeId`.
`isDirty` vive en UI state y se activa con cambios del draft. Cambiar dispositivo
de preview no ensucia el draft.

La prioridad de inicialización es: valor real y válido del evento, valor vacío
canónico y fallback semántico exclusivo del preview. Los textos decorativos de
las demos nunca se copian al draft. `builder-state` registra todo path editado,
incluso cuando el valor final es vacío, para soportar explicit clear. La whitelist
`INVITATION_EDITABLE_FIELDS` limita paths, tipos y longitud antes de aceptar un
cambio. `touchedPaths` permanece local y no introduce persistencia.

Las validaciones de nombre, fecha, hora y deadline actualizan `ui.validationErrors`
sin bloquear la edición. Un snapshot de estado es una copia profunda: un módulo
consumidor no puede mutar el draft central por referencia.

### Estrategia de preview

Se eligió un iframe `sandbox="allow-scripts allow-same-origin"` con un adaptador
propio, en lugar de embeber CSS o copiar colecciones al ADMIN.

Flujo:

```text
input / selector
  → builderState
  → preview-controller
  → postMessage `RENDER` o `UPDATE`, validado por origin/source
  → preview/frame.js
  → HTML + CSS reales de la colección
```

El adaptador:

1. limita el template a la misma origin;
2. hace `fetch` de la plantilla local sólo al cambiar colección;
3. elimina scripts, apertura, audio y controles musicales;
4. resuelve imágenes y estilos contra la ruta real de la colección;
5. activa el cuerpo/hero y los reveals para preview;
6. prepara el template en Builder Mode y limpia copy demo/event-specific;
7. aplica contenido con `textContent` y ownership del registro;
8. aplica visibilidad de secciones desde el registro;
9. intercepta enlaces y submits en captura;
10. reutiliza el DOM cargado para cambios de texto, evitando refetch por tecla;
11. agrupa ráfagas de escritura con un debounce de 80 ms antes de emitir `UPDATE`.

Ventajas: aislamiento CSS, reutilización de assets, comportamiento local,
actualización inmediata, rutas compatibles con el sitio estático y una frontera
clara para reemplazar el adaptador por configuración productiva en el futuro.
El iframe no ejecuta `demo-runtime.js`; por tanto no mezcla `demoMode` con la
preview de producción ni permite CTAs externos.

`RENDER` transporta el snapshot estructurado completo y carga/cambia la plantilla.
`UPDATE` transporta el mismo contrato completo, pero actualiza el DOM ya montado.
El frame rechaza mensajes con schema incompatible y conserva el último DOM válido.
Cada respuesta incluye `requestId`, de modo que el controlador puede ignorar
confirmaciones obsoletas. El countdown se recalcula desde `content.schedule`.

## Persistencia futura recomendada (no implementada)

Opciones evaluadas:

1. `eventos/{eventId}.invitationConfig`: simple, pero mezcla estadísticas y
   operación con un documento que cambiará frecuentemente, aumenta conflictos y
   acerca el límite de 1 MiB.
2. colección raíz paralela: facilita consultas globales, pero debilita la
   pertenencia canónica al evento y aumenta el riesgo de invitaciones huérfanas.
3. `eventos/{eventId}/invitacion/config`: conserva propiedad, separa frecuencia
   de writes y permite Rules específicas. Es la opción recomendada.

Contrato propuesto para el documento canónico:

```js
{
  schemaVersion,
  status: 'draft' | 'published',
  packageId,
  themeId,
  enabledSections,
  content,
  media,       // metadatos y URLs, nunca binarios/Base64
  locations,
  itinerary,
  gifts,
  links,
  appearance,
  settings,
  version,
  updatedAt,
  updatedBy,
  publishedAt,
  publishedVersion
}
```

Las publicaciones/versiones inmutables pueden vivir en
`eventos/{eventId}/invitacionVersiones/{versionId}`. La publicación debe copiar
un snapshot validado, no usar el draft mutable como release en vivo.

Multimedia futura: Firebase Storage bajo un prefijo ligado al evento, por
ejemplo `eventos/{eventId}/invitacion/...`; Firestore conserva URL, path,
dimensiones, MIME, tamaño, alt y estado de procesamiento. **Nunca se guardarán
imágenes, audio o video Base64 dentro del documento Firestore.**

## Riesgos y pendientes

- No existe paquete en el contrato actual de creación de eventos.
- Las Rules propuestas no cubren aún `invitacion` ni `invitacionVersiones`.
- Los adapters de Fase 2.1 neutralizan el copy hardcodeado en Builder. Contenido
  repetible, multimedia real y estructuras avanzadas siguen fuera de alcance.
- `admin/dashboard.js` todavía accede a Firestore directamente; no se reescribió
  por no ampliar el alcance.
- El editor legacy oculto y `themes` continúan existiendo para compatibilidad;
  no se eliminaron ni se reutilizaron como persistencia de drafts.
- Los layouts de las demos son Prestige; la selección de paquete controla
  secciones/capacidades, pero la simplificación visual completa por paquete
  requiere el modelado de contenido de fases posteriores.

## Roadmap recomendado

1. Fases 1, 2 y 2.1 completadas: shell productivo, schema canónico, editores de
   copy, selección explícita, adapters semánticos de once colecciones y preview
   en vivo sin mezcla de copy demo configurado.
2. Fase 3: editores estructurados de ubicaciones, itinerario, Dress Code,
   regalos y enlaces.
3. Fase 4: Storage y flujo multimedia optimizado/licenciado.
4. Fase 5: RSVP, selección de pases y configuración de acceso enlazada a
   invitados existentes.
5. Fase 6: appearance avanzada y editor del tema Personalizada.
6. Fase 7: Rules, persistencia del draft, debounce y autosave.
7. Fase 8: validación, snapshot publicado y URL de producción.
8. Fase 9: edición post-publicación, versiones, rollback y auditoría.

No se implementó Fase 3 ni ninguna fase posterior en este cambio.
