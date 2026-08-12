# Invitation Builder · Arquitectura de Fase 1

## Alcance

Esta fase implementa una aplicación administrativa dedicada para seleccionar un
evento existente, paquete, colección, secciones y datos básicos, y comprobar el
resultado en una preview real. El draft vive únicamente en memoria. No existe
autosave, publicación, Storage ni escritura de configuraciones en Firestore.

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
campo comercial de paquete. Fase 1 intenta leer `packageId`, `paqueteId` o
`paquete`; si no existe, muestra Esencial como selección local explícita y marca
`meta.packageSource = "phase-1-default"`. No escribe esa elección.

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
│   ├── builder-validation.js    validación básica pura
│   ├── section-registry.js      paquetes, capacidades y secciones
│   └── theme-registry.js        doce opciones de tema
├── modules/
│   ├── event-selector.js
│   ├── package-selector.js
│   ├── theme-selector.js
│   ├── section-selector.js
│   ├── basic-information.js
│   └── preview-controller.js
└── preview/
    ├── frame.html               documento aislado
    ├── frame.css                estados base y tema Personalizada
    └── frame.js                 loader/adaptador seguro de plantillas
```

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

### THEME_REGISTRY

Contiene `aloha`, `luxury`, `botanical`, `midnight`, `romance`, `minimal`,
`celestial`, `vintage`, `garden`, `champagne`, `neon-party` y `custom`. Cada
entrada define nombre, descriptor, categoría, cover, `templatePath`, paleta,
capacidades y bindings mínimos de preview. Las rutas aparecen una sola vez.

`custom` renderiza una base simple y comunica que el control visual avanzado
pertenece a una fase futura.

### SECTION_REGISTRY

El registro deriva capacidades de Prestige/paquetes y expone: bienvenida e
historia, countdown, ubicación/mapa, Dress Code, RSVP, música, video, galería,
regalos, selección de pases, itinerario, pase personalizado y sección especial.

Una sección bloqueada no puede activarse. Si se activa en un paquete superior y
después se baja el paquete, su ID permanece en `enabledSections`, aparece como
**Conservada** y no se borra. La advertencia/decisión final de downgrade queda
para la fase de persistencia.

### Modelo `invitationDraft`

```js
{
  schemaVersion: 1,
  eventId,
  packageId,
  themeId,
  enabledSections: [],
  content: { title, date, time, eventType, city },
  media: { hero, gallery, audio, video },
  locations: [],
  itinerary: [],
  gifts: [],
  links: {},
  appearance: {},
  settings: { renderMode: 'builder' },
  meta: { packageSource, loadedAt }
}
```

Tema y contenido están desacoplados: `setTheme()` solo cambia `themeId`.
`isDirty` vive en UI state y se activa con cambios del draft. Cambiar dispositivo
de preview no ensucia el draft.

### Estrategia de preview

Se eligió un iframe `sandbox="allow-scripts allow-same-origin"` con un adaptador
propio, en lugar de embeber CSS o copiar colecciones al ADMIN.

Flujo:

```text
input / selector
  → builderState
  → preview-controller
  → postMessage tipado y validado por origin/source
  → preview/frame.js
  → HTML + CSS reales de la colección
```

El adaptador:

1. limita el template a la misma origin;
2. hace `fetch` de la plantilla local elegida;
3. elimina scripts, apertura, audio y controles musicales;
4. resuelve imágenes y estilos contra la ruta real de la colección;
5. activa el cuerpo/hero y los reveals para preview;
6. aplica contenido con `textContent` y bindings del registro;
7. aplica visibilidad de secciones desde el registro;
8. intercepta enlaces y submits en captura;
9. reutiliza el DOM cargado para cambios de texto, evitando refetch por tecla.

Ventajas: aislamiento CSS, reutilización de assets, comportamiento local,
actualización inmediata, rutas compatibles con el sitio estático y una frontera
clara para reemplazar el adaptador por configuración productiva en el futuro.
El iframe no ejecuta `demo-runtime.js`; por tanto no mezcla `demoMode` con la
preview de producción ni permite CTAs externos.

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
- Los templates actuales contienen texto estructural hardcodeado; Fase 1 cambia
  nombre/fecha por bindings centralizados, pero convertir todo su contenido en
  configuración requerirá adaptadores de sección en Fase 2.
- `admin/dashboard.js` todavía accede a Firestore directamente; no se reescribió
  por no ampliar el alcance.
- El editor legacy oculto y `themes` continúan existiendo para compatibilidad;
  no se eliminaron ni se reutilizaron como persistencia de drafts.
- Los layouts de las demos son Prestige; la selección de paquete controla
  secciones/capacidades, pero la simplificación visual completa por paquete
  requiere el modelado de contenido de fases posteriores.

## Roadmap recomendado

1. Fase 2: schemas y editores completos de contenido por sección.
2. Fase 3: ubicaciones, itinerario, Dress Code, regalos y enlaces.
3. Fase 4: Storage y flujo multimedia optimizado/licenciado.
4. Fase 5: RSVP, selección de pases y configuración de acceso enlazada a
   invitados existentes.
5. Fase 6: appearance avanzada y editor del tema Personalizada.
6. Fase 7: Rules, persistencia del draft, debounce y autosave.
7. Fase 8: validación, snapshot publicado y URL de producción.
8. Fase 9: edición post-publicación, versiones, rollback y auditoría.

No se implementó ninguna de estas fases en este cambio.
