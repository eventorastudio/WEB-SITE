# Invitation Builder · Arquitectura de Fases 1 a 6.4

## Alcance

Las fases 1 a 6.4 implementan una aplicación administrativa dedicada para
seleccionar un evento existente, paquete, colección y secciones; editar contenido
canónico, logística y multimedia estructurada por rol; y comprobar el resultado
en una preview real. El draft general, multimedia y la configuración RSVP usan
documentos separados. No existe autosave; la publicación administrativa genera
revisiones inmutables y una proyección sanitizada para la ruta pública estable.

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

La auditoría inicial de Fase 4 encontró el bucket sólo referenciado, sin
`getStorage`, Rules operativas ni configuración Firebase CLI. Fases 4.5 y 4.6
añadieron `getStorage(app)`, el servicio remoto, persistencia normalizada,
propuestas finales y configuración local de CLI/emuladores. Firestore y Storage
Rules pasan localmente en Emulator Suite, pero ninguna Rule fue desplegada y la
disponibilidad remota continúa **no verificada**. Por eso
`invitation-media-service.js` conserva
`canUpload: false` mediante feature flag y no realiza operaciones remotas en el
frontend actual.

`firestore.rules` es el archivo canónico local enlazado por `firebase.json`;
`firestore.rules.proposed` conserva la propuesta histórica anterior a Fase 6.1.
Ninguna Rule de esta fase fue desplegada. El archivo canónico define:

- lectura de eventos para roles internos;
- mutación de eventos/invitados para gestores de plataforma;
- edición de `themes` para CEO, Administrador y Diseñador;
- lectura y escritura acotada de `eventos/{eventId}/invitacion/config` y su
  subcolección `media` para esos mismos claims, con campos exactos, límites,
  paths, tipos y auditoría de servidor;
- lectura y escritura acotada de `eventos/{eventId}/invitacion/draft` para los
  roles con `invitations:edit`, con whitelist, ownership y auditoría estrictos;
- publicación transaccional en `invitacion/publication` y CREATE inmutable de
  sus revisiones para esos mismos roles;
- GET público exacto de `eventos/{eventId}/invitacionPublic/{publicKey}`, con
  LIST y escrituras públicas denegadas;
- lectura y escritura interna acotada de `eventos/{eventId}/invitacion/rsvp`,
  con ownership, schema, nested maps, touched paths y auditoría estrictos;
- acceso Portal por perfil `usuarios/{uid}`, asignación de evento y entitlements;
- denegación por defecto de cualquier ruta no declarada.

Las Rules todavía deben desplegarse y verificarse remotamente mediante un proceso
manual autorizado. El pointer y las revisiones permanecen privados; sólo la
proyección sanitizada admite GET exacto con su key.

### Reconciliación RSVP server-side

Fase 5.5 incorpora el primer codebase de Cloud Functions en `functions/`. Un
trigger Firestore v2 relee transaccionalmente cada create/update de
`eventos/{eventId}/rsvpResponses/{token}` y converge por `guestId` sobre la
proyección privada `eventos/{eventId}/rsvpState/{guestId}`. La proyección no
guarda el bearer y conserva el número exacto confirmado.

El invitado real representa RSVP exclusivamente con `estado` y su booleano
derivado `confirmado`; no contiene `pasesConfirmados`. La misma transacción
actualiza sólo esos campos y reutiliza `createEventStatsMutation` para el
resumen existente. Una llegada/check-in ya registrada siempre prevalece y no
puede ser revertida por RSVP. Rules no cambiaron: `rsvpState` cae en la
denegación recursiva por defecto y sólo Admin SDK puede escribirlo.

La comparación por `respondedAt` ignora respuestas antiguas, convierte retries
idénticos en no-op y reporta sin overwrite un empate con datos distintos. State,
guest y agregado se confirman o abortan juntos. La arquitectura detallada y su
suite de diez casos Emulator están en `docs/PHASE_5_5_RSVP_RECONCILIATION.md`.

### Estado operativo y conflictos RSVP

Fase 5.6 hace consultables los empates reales mediante
`eventos/{eventId}/rsvpConflicts/{conflictId}`. El ID SHA-256 es determinista y
no contiene bearer; cada documento guarda sólo event, guest, tipo, timestamp,
los dos pares status/pases comparables y `createdAt`. La misma transacción crea
el conflicto una vez y un retry conserva el documento existente.

La pestaña Invitados escucha `rsvpState` y `rsvpConflicts` mediante un servicio
de sólo lectura. Tabla y tarjetas muestran Confirmado/No asistirá/Pendiente,
pases exactos de state e indicador de conflicto, siempre separados de Estado y
Llegada. Rules conceden GET/LIST sólo a roles internos y niegan toda escritura
de cliente. El detalle ejecutable está en `docs/PHASE_5_6_RSVP_OPERATIONS.md`.

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
53 fields editables: 39 paths generales y 14 paths de configuración RSVP. Los
11 adapters resuelven 53/53 sin ownership collisions.

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
  schemaVersion: 5,
  contentSchemaVersion: 4,
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
    dressCode: { title, name, description, note, recommendedColors, avoidedColors },
    rsvp: {
      enabled, title, message, buttonLabel,
      deadline, deadlineTime, deadlineTimeZone,
      method,
      whatsapp: { phone, message },
      guestPolicy,
      responses: { acceptedLabel, declinedLabel, confirmationMessage }
    },
    music: { title, description },
    video: { title, description },
    gallery: { title, subtitle, description },
    gifts: { title, message, buttonLabel },
    passes: { title, message },
    itinerary: { title, intro },
    access: { title, message }
  },
  media: {
    schemaVersion: 1,
    cover: null | mediaAsset,
    gallery: mediaAsset[],
    video: null | mediaAsset,
    videoPoster: null | mediaAsset,
    music: null | mediaAsset
  },
  locations: [],
  itinerary: [],
  gifts: [],
  accommodations: [],
  links: [],
  appearance: {},
  settings: { renderMode: 'builder' },
  meta: { packageSource, loadedAt, touchedPaths: [], touchedCollections: [], touchedMediaRoles: [], entitySequences: {} }
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
cambio. `touchedPaths` permanece local para el resto del draft. Fase 5.2
persiste sólo los doce paths RSVP permitidos porque son necesarios para
distinguir untouched de explicit clear después de reabrir el Builder.

Las validaciones de nombre, fecha, hora y deadline actualizan `ui.validationErrors`
sin bloquear la edición. Un snapshot de estado es una copia profunda: un módulo
consumidor no puede mutar el draft central por referencia.

### Multimedia Contract · Fase 4

`draft.media` es la única fuente canónica de metadata. No guarda archivos. Cada
asset usa un ID estable `MED-LOCAL-001` y este contrato:

```js
{
  id,
  role: 'cover' | 'gallery' | 'video' | 'videoPoster' | 'music',
  kind: 'image' | 'video' | 'audio',
  originalName,
  mimeType,
  size,
  width,
  height,
  duration,
  alt,
  caption,
  storagePath,
  downloadUrl,
  previewUrl,       // efímera, blob:, excluida de una persistencia futura
  status: 'local' | 'processing' | 'ready' | 'uploading' | 'uploaded' | 'error',
  uploadProgress,
  error,
  focalPoint: { x, y },
  sortOrder
}
```

El archivo procesado vive en `MediaObjectUrlRegistry`, fuera del draft. El
registro crea object URLs y las revoca al reemplazar, eliminar o destruir el
editor. El payload del iframe recibe únicamente strings y metadata serializable.
No existe File/Blob, Base64 ni Data URL en state, Firestore o mensajes.

La selección valida límite de bytes, MIME declarado, firma mágica y decode real.
SVG, HEIC, HTML, JavaScript y ejecutables quedan fuera de la allowlist. Imágenes
se decodifican con orientación aplicada, se limitan a 40 MP y se reencodan en
canvas para retirar EXIF/metadata: PNG conserva alpha; JPEG/WebP producen WebP
calidad 0.88. Cover limita el lado largo a 2400 px; galería/poster a 1920 px.
Video y audio sólo validan metadata en navegador; no hay transcodificación pesada.

Capacidades derivadas del contrato comercial:

- `cover`: Diseño personalizado, disponible desde Esencial.
- `music`: Música personalizada, disponible desde Esencial y ligada a la sección.
- `video`/`videoPoster`: Video de bienvenida, Premium y Prestige.
- `gallery`: Galería, Premium y Prestige. Máximo técnico local: 20 imágenes; no
  constituye promesa comercial.

Cambiar tema no recrea archivos. Desactivar sección o bajar paquete no elimina
metadata ni object URLs; los controles quedan bloqueados y el contenido reaparece
al restaurar capacidad/sección. Sólo una eliminación explícita borra el asset.
Reemplazar conserva ID y posición; mover galería normaliza `sortOrder`.

`TEMPLATE_BINDING_REGISTRY` contiene un adapter multimedia explícito para las once
colecciones. `phase4-media-bindings.js` aplica portada/punto focal, galería, video,
poster y audio sobre el DOM aislado. Untouched conserva media demo; configured la
reemplaza; explicit cleared la oculta. Audio y video tienen controles, `preload`
de metadata y nunca `autoplay`.

### Location Contract

`draft.locations` es la única fuente de verdad para sedes. No existen copias en
`content`, en el protocolo o en el frame. Cada elemento usa este contrato:

```js
{
  id: 'LOC-LOCAL-001',
  type: 'ceremony' | 'reception' | 'party' | 'session' | 'accommodation' | 'other',
  title,
  venueName,
  address,
  city,
  state,
  time,
  mapsUrl,
  wazeUrl,
  description,
  notes
}
```

Maps pertenece a Esencial. La capacidad `multiple-locations` proviene del
contrato comercial y sólo existe en Prestige. El state nunca recorta el array
al bajar de paquete: el preview deriva `getRenderableLocations()` y muestra sólo
la ubicación principal hasta que el draft vuelve a Prestige.

### Itinerary Contract

```js
{
  id: 'ACT-LOCAL-001',
  time,
  title,
  locationId: '' | 'LOC-LOCAL-001',
  description,
  notes
}
```

El orden del array es el orden de presentación. `locationId` es una referencia,
no una copia de dirección. Al eliminar una location, una sola mutación conserva
las actividades y limpia cada referencia afectada. La validación no permite
guardar una referencia nueva hacia un ID inexistente.

### Dress Code Contract

El copy permanece en `content.dressCode`. Las paletas semánticas viven en la
misma estructura como `recommendedColors` y `avoidedColors`:

```js
{ id: 'CLR-LOCAL-001', name: 'Champagne', value: '#E6D2AE' }
```

El color se normaliza a hexadecimal de seis dígitos. Las plantillas deciden si
lo presentan como swatch, leyenda, guía editorial u otra composición.

### Gifts Contract

```js
{
  id: 'GFT-LOCAL-001',
  type: 'store' | 'transfer' | 'cash' | 'other',
  name,
  url,
  reference,
  description,
  details: { bank, beneficiary, account, clabe, concept, instructions }
}
```

`draft.gifts` es local durante Fase 3. Los datos de transferencia no se mandan
a analytics, logs, query strings ni persistencia. Pueden aparecer como texto en
la preview segura. Sólo una URL web HTTPS válida produce un control enlazable.

### Accommodation Contract

```js
{
  id: 'HOT-LOCAL-001',
  name,
  address,
  description,
  phone,
  reservationUrl,
  mapsUrl,
  reservationCode,
  notes
}
```

La raíz canónica es `draft.accommodations`. El contrato comercial no declara
múltiples hoteles, por lo que Fase 3 permite exactamente uno y no inventa una
capacidad adicional. Se presenta dentro del bloque logístico de Ubicación.

### Links Contract

```js
{
  id: 'LNK-LOCAL-001',
  type: 'whatsapp' | 'instagram' | 'calendar' | 'transport' | 'contact' | 'custom',
  label,
  url,
  description,
  phone,
  message
}
```

Maps/Waze permanecen en location, la URL de tienda en gift y la reservación en
accommodation. Calendar deriva título, fecha, hora y ubicación principal del
draft. WhatsApp normaliza un número internacional de 7 a 15 dígitos y construye
una URL futura sin imponer país. Una publicación futura podrá ofrecer además un
`.ics` generado en servidor o como descarga estática; Fase 3 no genera archivos.

### Safe URL Policy

`core/safe-url.js` es el único helper de protocolos. Bloquea de forma explícita
`javascript:`, `data:` y `vbscript:`. Maps, Waze, regalos, reservaciones y links
web aceptan `https:`. Un link de tipo contacto puede aceptar además `mailto:` y
`tel:`. Una URL inválida permanece visible en el editor con error, pero nunca
crea `<a href>` en preview. Todos los controles externos se interceptan dentro
del iframe con el diálogo “Vista del editor”.

### Relaciones, IDs y preservación

Los IDs locales son correlativos y estables por draft: `LOC`, `ACT`, `GFT`,
`HOT`, `LNK` y `CLR`, con formato `XXX-LOCAL-001`. El índice del array nunca es
identidad lógica. `meta.entitySequences` evita reutilizar IDs después de borrar.

`touchedCollections` extiende la política de Fase 2.1:

- untouched: la colección puede conservar el fallback demo;
- configured: se renderizan sólo datos reales;
- explicit cleared: se oculta el bloque y no reaparece copy demo.

`gift-registry` es el ID canónico de sección y `draft.gifts` su colección de
datos. El renderer común promueve a su contenedor temático cualquier marcador
que la plantilla haya declarado directamente sobre un enlace o botón; así la
neutralización de acciones demo nunca puede ocultar las cards reales. Si una
plantilla no aporta markup reutilizable, Builder Template Mode crea una sección
mínima sin modificar la demo pública.

Los módulos JavaScript publicados pueden permanecer en caché hasta cuatro horas.
Por eso un hotfix del renderer debe cambiar la misma versión desde `builder.html`
hasta `frame.html`, `frame.js`, el registry y `phase3-template-bindings.js`; cambiar
sólo el archivo final dejaría al iframe ejecutando el grafo anterior.

Cambiar tema, desactivar sección o bajar paquete no muta estas colecciones. Sólo
una eliminación explícita borra una entidad. Las secciones retenidas fuera del
paquete siguen en `enabledSections`, pero el protocolo envía al frame únicamente
la intersección efectiva permitida por `SECTION_REGISTRY`.

### Editores Fase 3

`SECTION_EDITOR_REGISTRY` declara `advancedEditors`; no existe un segundo sistema
de secciones. `logistics-editor.js` monta los editores especializados de
locations, itinerary, Dress Code, gifts, accommodations y links. Todos comparten
cards colapsables, confirmación interna de borrado, controles subir/bajar y
restauración de `#builder-editor.scrollTop`. El foco de un elemento recién creado
usa `preventScroll`.

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
En Fase 4 el payload incluye `packageId`, `media`, `locations`, `itinerary`, `gifts`,
`accommodations`, `links`, `touchedPaths`, `touchedCollections` y
`touchedMediaRoles`. Los arrays son
pequeños y viajan completos; no se implementó un diff engine. Los once adapters
declaran una variante Fase 3 y consumen las mismas entidades sin guardar estilos
en el draft. Personalizada utiliza el mismo contrato con una composición base.

## Persistencia general del draft · Fase 6.1

El borrador general mutable vive en `eventos/{eventId}/invitacion/draft`. Es un
documento hermano de `config` (índice multimedia), `rsvp` y
`rsvpPublication`; cada uno conserva su propio ciclo de escritura y dirty.

Contrato persistido:

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
  settings,
  updatedAt,
  updatedBy
}
```

La serialización usa whitelist y normalización estrictas. Excluye `content.rsvp`,
`media`, `mediaIndex`, access tokens, guest, QR y check-in. Al
abrir, un documento existente se valida y migra al content schema vigente antes
de hidratar; uno ausente conserva los defaults del evento. La hidratación no
ensucia el estado.

Fase 6.1B incorpora `accommodations` y migra documentos schema 1 sin esa clave al
schema 2 usando el default vigente `[]`, sin escribir durante la hidratación.

`ui.generalDraftDirty` separa este ciclo de `rsvpDirty` y `mediaDirty`. El botón
**Guardar borrador** escribe el documento completo y sólo limpia el dirty general
si el fingerprint confirma que no aparecieron cambios nuevos durante el write.
No hay autosave y este documento no se usa como publicación.

### Publicación versionada · Fase 6.2

`eventos/{eventId}/invitacion/publication` conserva únicamente el pointer activo:
schema, ownership, `currentRevisionId`, `currentRevisionNumber` y auditoría de
servidor. Cada snapshot vive en
`eventos/{eventId}/invitacion/publication/revisions/{revisionId}` con ID
secuencial `REV-000001`, número de revisión, content schema, auditoría y las diez
raíces generales del draft.

El servicio compara el snapshot normalizado contra la revisión activa. Si son
idénticos devuelve `unchanged` sin writes. Si cambió, una sola transacción lee el
pointer y la revisión vigente, verifica que el siguiente ID esté libre, crea la
nueva revisión y mueve el pointer. La transacción de Firestore reintenta ante
concurrencia; Rules enlaza ambos documentos con `getAfter()`. Las revisiones sólo
admiten CREATE y nunca UPDATE/DELETE.

La publicación excluye `content.rsvp`, media y binarios. No guarda draft dirty ni
lo limpia: **Guardar borrador** y **Publicar** son acciones independientes. Esta
fase no crea una vista pública ni cambia RSVP, uploads, QR o check-in.

### Invitación pública · Fase 6.3

`publication` schema 2 añade una key aleatoria de 192 bits creada una sola vez.
La misma transacción que avanza la revisión actualiza
`eventos/{eventId}/invitacionPublic/{publicKey}`. Esta proyección excluye
auditoría, draft, RSVP, invitados, tokens, QR/check-in y metadata interna de
uploads; conserva sólo snapshot renderizable y referencias HTTPS sanitizadas.

`/invitacion/?event={eventId}&key={publicKey}` lee exclusivamente ese documento.
La página ejecuta el mismo `preview/frame.js`, registries, adapters y bindings
del Builder. Nunca cae al draft: ausencia, key incorrecta o shape inválido
producen “Invitación no disponible”. Rules permite sólo GET exacto público y
deniega LIST/query y writes públicos.

### Invitación personalizada · Fase 6.4

La ruta pública admite opcionalmente `token={rsvpToken}`. Primero carga la misma
proyección publicada de Fase 6.3 y después reutiliza `PublicRsvpAccessLoader`;
nunca consulta `invitados`. Sólo un Access del mismo evento, activo y vigente se
reduce a `{ displayName, passLimit }` y activa una bienvenida personalizada con
CTA a `/rsvp/?event={eventId}&token={rsvpToken}`. Un token ausente, inválido,
revocado, expirado o cross-event conserva exactamente el render genérico.

Guest Manager muestra **Copiar invitación** únicamente a roles con
`invitations:edit`. El servicio administrativo lee el `publicKey` activo y el
RSVP Access vigente del invitado para construir el enlace; no genera ni rota
tokens. Las Rules no cambiaron: la validación pública estricta de `rsvpAccess`
ya existía y sus LIST/writes continúan privados.

Fase 4.6 conserva la capa de upload bajo
`eventos/{eventId}/invitacion/media/{role}/{mediaId}-{objectVersion}.{ext}`.
Firestore conserva el `storagePath` estable y metadata; `downloadUrl` sólo existe
en runtime y se vuelve a resolver al hidratar. **Nunca se guardan imágenes, audio,
video, Base64, Data URLs u object URLs dentro del documento Firestore.** La
capacidad remota permanece bloqueada por feature flag hasta completar y desplegar
los pasos de `STORAGE_SETUP.md` con autorización explícita.

### Persistencia multimedia normalizada · Fase 4.6

`eventos/{eventId}/invitacion/config` almacena sólo `schemaVersion`, el
`mediaIndex` compacto y auditoría de servidor. Los documentos individuales viven
en `eventos/{eventId}/invitacion/config/media/{mediaId}`. No existe colección
global, documento paralelo ni array monolítico. `mediaIndex.galleryIds` es la
única fuente persistida del orden; el `sortOrder` del estado se deriva al hidratar.
El límite técnico de galería continúa en 20.

`invitation-media-service.js` es la frontera única para Storage y Firestore; el
editor no importa primitivas Firebase. La fase Firestore usa un solo `WriteBatch`
para publicar config, media documents modificados y eliminaciones de forma
atómica. Un reorder puro sólo modifica el índice. Las Rules validan cada documento
con campos exactos y no hacen lecturas referenciales por asset, manteniendo el
coste acotado para 20 elementos.

La hidratación lee concurrentemente sólo los IDs referenciados, asigna roles y
orden desde el índice y resuelve URLs efímeras con máximo cuatro solicitudes. Un
documento faltante o corrupto se reporta y se omite; un huérfano no referenciado no
se muestra.

Storage permanece fuera de la atomicidad de Firestore. Después de uploads, un
fallo del batch intenta borrar todos los objetos nuevos. El reemplazo publica la
versión nueva antes de limpiar la anterior. El delete retira índice y documento
en batch antes de borrar Storage; así un fallo Firestore conserva el asset
funcional y un fallo Storage posterior deja sólo un binario huérfano, no una
referencia rota. La galería limita los uploads a tres en paralelo.

No existe migración productiva: el flag remoto nunca fue activado y el esquema
monolítico anterior no produjo datos reales. La futura persistencia de las demás
raíces deberá ampliar explícitamente el contrato de `config`; las versiones
publicadas continuarán separadas en `invitacionVersiones`.

`builderState.ui.mediaDirty` y `draftDirty` separan la persistencia multimedia del
resto del borrador. Hidratar o guardar media no afirma que contenido o logística
estén guardados. Downgrade, toggle y cambio de tema no mutan `draft.media`.

### Persistencia RSVP · Fase 5.2

`eventos/{eventId}/invitacion/rsvp` almacena únicamente el contrato semántico
RSVP, versiones, `eventId`, touched paths RSVP y auditoría de servidor. Se eligió
un documento hermano porque `config` permanece exacto y exclusivamente
multimedia. `invitation-rsvp-service.js` centraliza lectura, write completo,
ownership, serialización e hidratación. Un documento ausente no provoca writes.

`ui.rsvpDirty` permite limpiar sólo el scope guardado sin afirmar que tema,
logística o multimedia estén persistidos. Un fingerprint evita limpiar ediciones
locales realizadas mientras el write estaba en vuelo; los conflictos entre
sesiones continúan last-write-wins hasta incorporar una revisión general.

### Contrato temporal RSVP · Fase 5.4A

El draft editable conserva la fecha local `deadline` y añade `deadlineTime`
(`HH:mm`) y `deadlineTimeZone` (ID IANA). Los tres campos deben estar vacíos o
completos. La zona detectada del navegador sólo se sugiere en el editor y nunca
se copia automáticamente al draft.

El servicio administrativo deriva un instante independiente del timezone del
dispositivo mediante `Intl`, rechaza horas locales inexistentes o ambiguas por
DST y lo convierte con `Timestamp.fromDate()`. El resultado vive únicamente en
el documento privado como `responseClosesAt`; no es editable ni se hidrata al
draft. El documento RSVP usa `schemaVersion: 2` y `contentSchemaVersion: 4`.
Documentos v1/v3 pueden leerse para migración: conservan su deadline y dejan
hora/zona vacías, por lo que requieren intervención antes de volver a guardarse.

Rules exige que los cuatro campos temporales estén totalmente vacíos con
`responseClosesAt: null` o totalmente presentes con un Timestamp. La conversión
IANA no puede verificarse matemáticamente en Rules; la frontera de confianza es
el write exclusivo de CEO, Administrador y Diseñador. Fase 5.4 reutilizará el
Timestamp persistido y aplicará `request.time < responseClosesAt`; no volverá a
derivar el instante en el cliente público.

### Identidad y acceso público RSVP · Fase 5.3

`eventos/{eventId}/rsvpAccess/{token}` contiene una proyección versionada y
mínima por invitado: ownership, nombre de display, `passLimit`, estado,
expiración, `configKey` y la referencia estable `guestId`; desde Fase 5.4 su
schema es 2 y su forma cruda tiene exactamente ocho campos sin auditoría.
`passLimit` deriva exclusivamente de `guest.pases`
(entero 1–999); nunca de estadísticas del evento ni de pases disponibles de
check-in. El invitado completo continúa privado y no recibe campos RSVP.
`guestId` se conserva para correlación futura y sincronización interna; no
habilita lectura del invitado ni query público. Firestore no filtra campos en un
`get`, por lo que la privacidad reside en la forma almacenada y no en el loader.

El token RSVP usa 32 bytes de Web Crypto y base64url sin padding. Es independiente
de `qrToken`, vive sólo como Document ID y parámetro de la ruta
`/rsvp/?event=...&token=...`. `rsvp-access-service.js` centraliza provisioning,
verificación, query interno por `guestId`, sync explícito, rotación create-verify-
revoke y revocación `active:false`; no existen listeners permanentes.

El loader público valida ruta antes de Firebase y hace un solo `getDoc` exacto.
Rules habilita ese GET bearer tanto para sesiones anónimas como autenticadas,
siempre sobre documentos activos y no expirados. List/query y toda escritura
sin rol interno permanecen denegados. La página pública sólo muestra estado de
acceso. Fase 5.4 extiende este flujo sin abrir el invitado canónico.

### RSVP público protegido · Fase 5.4

`eventos/{eventId}/invitacion/rsvpPublication` guarda privadamente una
`configKey` de 256 bits, estable por evento y separada del bearer individual.
El guardado RSVP usa una transacción para mantener atómicamente config privada,
metadata y `eventos/{eventId}/rsvpPublic/{configKey}`. La proyección pública
contiene exactamente copy/método/policy/responses/WhatsApp y el cierre derivado;
excluye touched, auditoría e identidad del invitado. Sólo permite GET exacto
válido; list/query/write/delete públicos se deniegan.

Cada respuesta vive en `eventos/{eventId}/rsvpResponses/{token}` con seis campos:
schema, ownership, `status`, `passesConfirmed` y `respondedAt`. Rules resuelve en
coste constante el Access y su public config, exige método interno, deadline
abierto, pases dentro de policy y `respondedAt == request.time`. El runtime
reutiliza App Check, hidrata respuesta existente, evita writes idempotentes,
bloquea submits concurrentes y nunca escribe el guest.

La rotación crea/verifica Access nuevo, copia/verifica cualquier respuesta con
su timestamp original y sólo después revoca el anterior. La excepción interna
de Rules para esa copia admite únicamente CREATE histórico exacto; no existe
UPDATE administrativo. Un fallo conserva el Access anterior y nunca borra
respuestas.

### Hardening RSVP público · Fase 5.4B

La forma física de Access permanece en schema 2 con ocho campos exactos:
`schemaVersion`, `eventId`, `guestId`, `configKey`, `displayName`, `passLimit`,
`active` y `expiresAt`. El token nunca es data: solo es Document ID/route
parameter. Auth no altera una capability valida ni eleva permisos sin bearer.
Si revoke del Access anterior falla, se revoca compensatoriamente el nuevo; un
doble fallo produce `reconciliation-required` con IDs redactados y exige futura
reparación administrativa, sin borrar responses históricas.

## Riesgos y pendientes

- No existe paquete en el contrato actual de creación de eventos.
- Las Rules locales cubren `eventos/{eventId}/invitacion/config`, `draft`,
  `publication`, sus revisiones, `invitacionPublic`, la subcolección `media`, `rsvp`,
  `rsvpPublication`, `rsvpAccess`, `rsvpPublic` y
  `rsvpResponses`; pasan Emulator Suite local,
  pero no fueron desplegadas.
- Los adapters neutralizan el copy hardcodeado en Builder y alimentan también el
  render público. Thumbnails server-side, transcodificación y appearance avanzada
  siguen fuera de alcance.
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
2. Fase 3 completada: ubicaciones, itinerario, Dress Code avanzado, regalos,
   un hospedaje, enlaces, URLs seguras y adapters de preview.
3. Fase 4 completada: Media Manager local-first, optimización, adapters y
   preparación segura de Storage sin habilitar escrituras remotas.
4. Fase 4.5 completada localmente: servicio Storage, ciclos iniciales de
   upload/replace/delete, Rules propuestas y flag remoto deshabilitado.
5. Fase 4.6 completada localmente: `mediaIndex`, subcolección por asset,
   `WriteBatch`, hidratación escalable, compensaciones y pruebas Emulator
   1/6/20/>20. El flag remoto continúa deshabilitado.
6. Fase 5.1 completada: contrato, editor, validación, WhatsApp seguro, policy de
   pases y preview RSVP.
7. Fase 5.2 completada: persistencia administrativa RSVP, hidratación, save
   central, Rules estrictas y Emulator aislado.
8. Fase 5.3 completada localmente: identidad RSVP, token independiente, access
   projection, ruta/lookup público exacto, rotación/revocación y Rules mínimas.
9. Fase 5.4A completada localmente: fecha/hora/zona IANA, Timestamp de cierre,
   migración v1/v3 y Rules privadas v2.
10. Fase 5.4 completada localmente: capability de config, proyección protegida,
    respuesta pública, policies, deadline, idempotencia y rotación sin pérdida.
11. Fase 5.5 completada localmente: sincronización confiable e idempotente de
    respuesta al invitado, estado privado por `guestId`, agregado canónico y
    preservación estricta de pases operativos, check-in y QR.
12. Fase 5.6 completada localmente: conflicto privado idempotente y estado RSVP
    observable en ADMIN, sin edición manual.
13. Fase 6.1/6.1B completada localmente: persistencia explícita del draft general,
    accommodations, hidratación versionada, dirty independiente y Rules privadas.
14. Fase 6.2 completada localmente: revisiones inmutables, pointer activo,
    transacción, deduplicación semántica y Rules privadas.
15. Fase 6.3 completada localmente: publicKey estable, proyección sanitizada,
    runtime público compartido y GET exacto sin queries.
16. Fase 6.4 completada localmente: personalización opcional desde RSVP Access,
    CTA RSVP seguro y enlace copiable desde Guest Manager.
17. Fase 6.5 y posteriores: pendientes; no iniciadas.

No se implementó ninguna fase posterior a Fase 6.4.
