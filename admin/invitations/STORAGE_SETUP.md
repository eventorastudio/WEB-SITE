# Persistencia multimedia del Invitation Builder · Fase 4.6

## Estado verificado

- Proyecto configurado en cliente: `eventorastudio-d6d95`.
- Bucket declarado: `eventorastudio-d6d95.firebasestorage.app`.
- `admin/firebase.js` conserva una sola llamada a `initializeApp()`, App Check con
  reCAPTCHA v3 e inicialización central de `getStorage(app)`.
- Los claims admitidos para edición multimedia son `CEO`, `ADMINISTRADOR`,
  `ADMIN` y `DISENADOR`, leídos desde `role` o `userRole`.
- Firebase CLI, SDK cliente, Rules Unit Testing y Emulator Suite están instalados
  localmente. `npm.cmd run test:rules` pasa con Firestore y Storage.
- Storage Rules desplegadas: **NO**.
- Firestore Rules desplegadas: **NO**.
- Writes a producción durante esta fase: **0**.
- `INVITATION_MEDIA_UPLOAD_ENABLED` está en `true` en el cliente actual.

## Decisión de arquitectura

El documento canónico de configuración es:

```text
eventos/{eventId}/invitacion/config
```

En Fase 4.6 contiene únicamente el índice compacto y auditoría:

```js
{
  schemaVersion: 5,
  mediaIndex: {
    schemaVersion: 1,
    coverId: 'MED-LOCAL-001' | null,
    galleryIds: ['MED-LOCAL-002'],
    videoId: 'MED-LOCAL-008' | null,
    posterId: 'MED-LOCAL-009' | null,
    audioId: 'MED-LOCAL-010' | null
  },
  updatedAt: serverTimestamp(),
  updatedBy: auth.currentUser.uid
}
```

La metadata individual vive en la subcolección acotada al evento:

```text
eventos/{eventId}/invitacion/config/media/{mediaId}
```

No existe colección global de media ni array monolítico dentro de `config`.
`mediaIndex` es la única fuente persistida de pertenencia y orden. En particular,
el orden de galería se obtiene exclusivamente de `galleryIds`; `sortOrder` sólo se
deriva al hidratar el estado de runtime y nunca se persiste.

La galería mantiene un máximo técnico de 20 elementos. Las Rules validan IDs,
unicidad, roles singulares no duplicados y el límite con expresiones acotadas. No
usan `exists()` o `get()` por cada referencia del índice: la integridad entre
índice y documentos la garantiza el `WriteBatch` del servicio, evitando que el
coste de Rules crezca con el número de assets.

El flag de cliente está activo. No se asume migración automática: cualquier dato
productivo y la compatibilidad con el esquema anterior deben verificarse antes de
un despliegue operativo.

## Namespace de Storage

```text
eventos/{eventId}/invitacion/media/{role}/{mediaId}-{objectVersion}.{ext}
```

Roles: `cover`, `gallery`, `video`, `videoPoster`, `music`.

El ID lógico se conserva durante un reemplazo. Cada binario usa una versión
hexadecimal de 12 caracteres y un path inmutable; nunca se sobrescribe el objeto
anterior. El servicio y Storage Rules comprueban que `eventId`, `mediaId`, `role`,
MIME y extensión coincidan con el path. Los objetos son create-only; update está
denegado.

## Contrato de cada media document

Campos funcionales exactos:

```text
id, role, kind, originalName, mimeType, size, width, height, duration,
alt, caption, storagePath, focalPoint, objectVersion
```

Campos de auditoría exactos:

```text
createdAt, updatedAt, updatedBy
```

En create, `createdAt` y `updatedAt` son `request.time`. En update, `createdAt`
permanece inmutable y `updatedAt` vuelve a ser `request.time`; `updatedBy` debe
coincidir con el UID autenticado. Las Rules validan además ID de documento,
evento, rol, kind, MIME/extensión, tamaño, focal point, longitudes y path.

No se persisten `status`, `sortOrder`, `downloadUrl`, `previewUrl`, progreso,
errores, `File`, `Blob`, object URLs, Data URLs, Base64 ni tokens de descarga.

## Políticas sincronizadas

| Rol | MIME | Máximo |
| --- | --- | ---: |
| Cover, galería, poster | `image/jpeg`, `image/png`, `image/webp` | 20 MiB |
| Video | `video/mp4`, `video/webm` | 80 MiB |
| Música | `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/ogg` | 20 MiB |

SVG y `application/octet-stream` permanecen denegados. El límite de imagen se
probó en ambos bordes: 20 MiB exactos permitido y 20 MiB + 1 byte denegado.

## Lectura e hidratación

1. Se lee `config` y se valida `mediaIndex`.
2. Se solicitan concurrentemente sólo los media IDs referenciados, mediante
   lecturas directas; `list` de la subcolección está denegado.
3. Los documentos se validan contra evento, rol, path y versión.
4. Se reconstruye `draft.media`; el índice asigna pertenencia y orden.
5. Las download URLs se resuelven únicamente en runtime con concurrencia máxima
   de cuatro.

Un documento referenciado ausente o corrupto se omite y se reporta como
inconsistencia sin derribar el resto de la hidratación. Un documento huérfano no
referenciado no se consulta ni aparece en la UI.

## Escritura y atomicidad

La fase Firestore usa un único `WriteBatch` que incluye:

- reemplazo completo de `config` con el `mediaIndex` nuevo;
- create/update sólo de media documents nuevos o modificados;
- delete de media documents retirados.

El batch publica todo o nada. Un reorder puro cambia únicamente `mediaIndex`; no
reescribe los 20 documentos. Storage no puede formar parte de una transacción
Firestore, por lo que el servicio aplica las secuencias y compensaciones
siguientes.

### Guardado y compensación

1. Selección, validación y procesamiento local.
2. Preview `blob:` sin upload automático.
3. Upload explícito, máximo tres objetos en paralelo.
4. Al terminar Storage, commit atómico de `config` y media documents.
5. Hidratación cloud y resolución de URLs.

Si el batch falla, se intenta borrar cada objeto recién subido y se informa el
número de compensaciones fallidas. No se presenta esta secuencia como una
transacción distribuida.

### Reemplazo

El objeto A y su documento siguen canónicos mientras B es local. Después se sube
B, el batch actualiza el mismo ID lógico hacia la versión B y sólo tras el commit
se elimina A. Si upload o batch fallan, A continúa funcional. Si la limpieza de A
falla, B sigue canónico y A queda como posible huérfano reportado.

### Eliminación

El batch retira primero la referencia de `mediaIndex` y elimina el media document.
Sólo después se borra Storage. Si Firestore falla, el asset anterior permanece
completamente funcional. Si Storage falla después del batch, no queda una
referencia rota: se reporta el path binario huérfano para limpieza posterior.

### Huérfanos pendientes

- cierre del navegador entre upload y commit;
- pérdida de red durante compensación;
- fallo al limpiar una versión reemplazada;
- fallo de Storage después de un delete ya publicado.

No se añadieron cron jobs ni Cloud Functions. Una limpieza backend futura podrá
listar versiones sin referencia canónica y aplicar un período de gracia.

## UX y feature flag

- El flag está en `true`: el editor expone upload, retry, cancel y guardado
  multimedia, además de preview local.
- `canUpload` y `canDelete` dependen también de autenticación, claims y Rules
  remotas correctamente desplegadas; esa disponibilidad requiere validación
  operativa independiente.
- `ui.mediaDirty` está separado de `ui.draftDirty`.
- Downgrade, toggle y cambio de tema no eliminan media persistida.

## Validación local

`firebase.json` enlaza `firestore.rules` y `storage.rules` como reglas canónicas,
con emuladores Firestore en 8080 y Storage en 9199. No incluye Hosting ni
Functions dentro de este documento.

```powershell
npm.cmd run test:rules
npm.cmd test
```

La suite de Emulator cubre roles admitidos, cliente, usuario anónimo,
cross-event, MIME, tamaños, metadata mismatch, create-only, contrato Firestore,
índices 1/6/20/>20, batch de 20 documentos, hidratación, reorder, replacement y
delete. Usa exclusivamente el proyecto demo `demo-eventorastudio-phase45`.

## Activación remota posterior

La operación productiva requiere autorización: revisar bucket, región, billing,
CORS, retención y App Check; desplegar Rules; y probar un evento no productivo
con claims reales. El flag ya está activo en el cliente, pero no sustituye esa
validación remota.
