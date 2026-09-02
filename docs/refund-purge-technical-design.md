# Diseño técnico de preparación de purga por reembolso

Estado dry-run: `IMPLEMENTED`  
Estado executor destructivo: `IMPLEMENTED FOR EMULATOR TESTING ONLY`  
Ejecución productiva: `DISABLED / NOT EXPOSED`  
Admin UX: `HUMAN AUTHORIZATION IMPLEMENTED LOCALLY`
Fuente de refund: `MANUAL ADMINISTRATIVE / NOT PROVIDER-VERIFIED`
Termination intent: `SERVICE_CONTINUES` no elegible · `COMPLETE_TERMINATION` elegible sujeto a controles

## Alcance

La preparación valida evidencia estructurada de reembolso. El executor interno ejecuta la purga irreversible únicamente contra fixtures artificiales en emulador o Storage mock seguro. La capa humana local prepara y autoriza, pero no ejecuta producción.

## Backend y autorización

La entrada es la callable administrativa `prepareRefundProjectPurge`. La autorización se verifica en backend y exige claim real `role: CEO` o `userRole: CEO`. ADMINISTRADOR, ADMIN, DISENADOR, clientes y público quedan rechazados. No existe botón de purga ni parámetro `forceDelete`, `execute`, `purgeNow` o `skipChecks`.

## Registro administrativo

Se usa `administrativePurgeRecords/{PURGE-eventId}`, fuera del árbol operativo `eventos/{eventId}`. El registro utiliza `DRAFT`, `DRY_RUN_READY` o `BLOCKED`. No se añaden estados destructivos al evento ni al schema comercial.

La clave determinista por evento y el `operationId` evitan múltiples operaciones activas. La adquisición de preparación se realiza dentro de una transacción. Un registro `DRY_RUN_READY` se devuelve de forma idempotente; un `DRAFT` de otra operación bloquea la preparación concurrente.

## Precondiciones

Se exige evento existente, `demoMode !== true`, evidencia con `status: REFUNDED`, `refundReference`, `refundedAt` y `commercialFileReference`, actor CEO y descubrimiento completado. DEMO produce `DEMO_PURGE_BLOCKED`. Assets desconocidos producen `UNKNOWN_STORAGE_ASSET` y estado `BLOCKED`.

## Dry-run y manifest

El dry-run cuenta documentos del root, invitados, check-ins, RSVP, revisiones, proyecciones, media y perfiles que requerirían detach. El manifest guarda únicamente rutas e identificadores técnicos. Los IDs de documentos `rsvpAccess` y `rsvpResponses` se representan mediante hash; no se exponen tokens.

No se guardan nombres, emails, teléfonos, nombres de invitados, `qrToken`, `rsvpToken`, RSVP completo, contenido, imágenes, videos, música ni URLs personalizadas.

## Storage y Shared DEMO

Se inspecciona el media index, documentos media y el prefix `eventos/{eventId}/invitacion/media/` mediante un bucket inyectable. Cada referencia se clasifica como `OWN_EVENT`, `SHARED_DEMO` u `UNKNOWN`. Los objetos no presentes en metadata se reportan como `ORPHAN_CANDIDATE` y no se marcan para borrar. `demo-library/DML-...` sólo se registra como `DETACH_ONLY`; cualquier duda de origen bloquea la operación futura.

## Executor destructivo y guards absolutos

`executeRefundProjectPurge` no se exporta desde `functions/index.js`; sólo es importable por tests o servicios internos. Requiere simultáneamente `FIRESTORE_EMULATOR_HOST` local, `FIREBASE_STORAGE_EMULATOR_HOST`/`STORAGE_EMULATOR_HOST` local o mock marcado, proyecto demo permitido y `EVENTORA_ALLOW_DESTRUCTIVE_EMULATOR_PURGE=true`. Si falta cualquier guard devuelve `DESTRUCTIVE_PURGE_NOT_ALLOWED` y no tiene fallback.

La ejecución exige `DRY_RUN_READY`, revalida CEO, refund, `demoMode`, versión, blockers, Shared DEMO y lock. Un cambio desde el dry-run produce `MANIFEST_STALE` y cero deletes. El orden es proyección pública, RSVP Access/RSVP, invitados/check-ins, RSVP privado, Storage propio, metadata media/configuración, perfiles y root al final.

## Estados, checkpoints y reanudación

El registro administrativo puede pasar por `PURGE_PENDING`, `FIRESTORE_PURGING`, `STORAGE_PURGING`, `VERIFYING`, `PURGED`, `BLOCKED` o `FAILED_RETRYABLE`. Cada etapa persiste `checkpoint`; un error no hace rollback. Los archivos Storage ya eliminados se registran en `storageDeletedPaths`, por lo que el siguiente intento continúa sin recrear datos ni fallar por documentos inexistentes. Una segunda ejecución de `PURGED` devuelve `ALREADY_PURGED`.

El root mantiene `purgeLock` mientras la operación está activa. `syncRsvpResponseToGuest` rechaza reconciliaciones durante la purga para impedir recreación concurrente.

## Lock, fallos e idempotencia

El registro administrativo funciona como lock de preparación. Un timeout deja el estado reintentable, pero no restaura ni borra información. La fase destructiva futura deberá usar checkpoints separados para Firestore y Storage, porque no existe una transacción conjunta entre ambos.

## Audit log y lifecycle

El registro conserva metadata de operación, actor, timestamps, counts, blockers, warnings y manifest técnico. Antes de `PURGED`, el manifest será necesario para reanudar; después deberá reducirse o eliminarse conforme a política futura. No se implementa TTL.

## Final Record y verificación

`administrativePurgeRecords/PURGE-{eventId}` sobrevive como Final Record con `PURGED`, `purgedAt`, `performedBy`, `verification`, counts y referencias técnicas. No contiene nombres, emails, teléfonos, tokens, URLs personalizadas ni contenido de invitación. La verificación confirma root/colecciones/proyección/Storage propios inexistentes, perfiles separados y Shared DEMO conservado.

## Autorización humana 2E2C

La UI `admin/refund-purge.html` es visible sólo para CEO mediante claims resueltos en frontend; las callables vuelven a validar el claim en backend. La UI carga eventos desde Firebase, solicita dry-run, muestra identidad y conteos técnicos, diferencia blockers/warnings y nunca llama al executor destructivo.

`authorizeRefundProjectPurge` exige `DRY_RUN_READY`, manifest hash estable, refund y folio coincidentes, cuatro confirmaciones, frase exacta `PURGAR {eventId} {commercialFileReference}` y `auth_time` menor a 15 minutos. Genera una autorización server-side aleatoria, ligada al operation/event/CEO/hash/refund, con expiración corta, `used=false` y hash persistido; el token crudo no se persiste. `cancelRefundProjectPurgeAuthorization` devuelve a `DRY_RUN_READY` sin borrar nada. No se almacena la frase ni la confirmación en localStorage.

`READY_FOR_EXECUTION` es sólo autorización administrativa: no tiene trigger, scheduler ni transición automática a `PURGED`. La fresh auth está implementada con `auth_time`; MFA/step-up adicional queda como endurecimiento futuro antes de producción.

## Evidencia administrativa de reembolso 2E2D

No existe integración de proveedor: no se implementan API, webhook, checkout ni conciliación automática de Mercado Pago. La evidencia manual, de frontend o de fixtures se marca `[REFUND EVIDENCE NOT PRODUCTION READY]`. El registro backend `administrativeRefundRecords/{refundRecordId}` conserva únicamente `eventId`, `commercialFileReference`, `refundReference`, `amount`, `currency`, `paymentMethod`, `refundedAt`, `recordedAt`, `recordedBy`, `status` y `recordVersion`, además de metadata de confirmación.

El flujo es `RECORDED` → `CONFIRMED`; sólo `CONFIRMED` se acepta para preparación. La callable recibe únicamente el ID del registro y lo vuelve a leer en servidor. El registro se vincula al evento y folio comercial, y `linkedPurgeOperationId` impide su reutilización. No se almacenan tarjetas, CLABE, contraseñas, capturas ni datos de invitados. Un refund parcial no se interpreta como total: `[OWNER DECISION REQUIRED: PARTIAL REFUND PURGE]`.

`terminationIntent` es obligatorio y sólo admite `SERVICE_CONTINUES` o `COMPLETE_TERMINATION`. `SERVICE_CONTINUES` rechaza `prepareRefundProjectPurge` y nunca crea ni enlaza un purge record. La elegibilidad nunca se infiere por monto, porcentaje, refund total, estado o fecha.

`refundEvidenceHash` liga de forma derivada evento, folio, referencia, monto, moneda, fecha, medio e intención sin copiar el refund completo al manifest técnico. Prepare y authorize recalculan y comparan este hash; un cambio administrativo válido vuelve obsoleta la evidencia anterior.

## Gate de producción diseñado, cerrado

El allowlist exacto previsto es proyecto `eventorastudio-d6d95` y bucket `eventorastudio-d6d95.firebasestorage.app`. `PRODUCTION_PURGE_KILL_SWITCH` permanece `false`; no existe activación por frontend, entorno, query string o booleano manual. La futura callable `executeAuthorizedRefundProjectPurge` está documentada únicamente como diseño futuro y no fue implementada ni exportada. No se crean nuevos deletes en esta fase.

La reautenticación implementada es la oficial Email/Password de Firebase. No se detectó flujo Google/externo en el código auditado; MFA/step-up adicional queda como endurecimiento futuro obligatorio antes de producción. App Check reCAPTCHA v3 se conserva.

## Siguiente fase

Debe definir y probar el ejecutor backend, bloqueo de operaciones concurrentes RSVP/QR, confirmación humana fuerte, borrado por lotes, Storage seguro, verificación post-purga y Final Record. No debe reutilizar esta callable como vía secreta de borrado.

## Fase 2E2F2A — executor endurecido

El executor local sólo acepta un registro en `READY_FOR_EXECUTION` (o una reanudación explícita de `FAILED_RETRYABLE`), una autorización CEO vinculada por `eventId`, `operationId`, `manifestHash`, `refundEvidenceHash` y `refundRecordId`, y un token que se consume una sola vez dentro de la transacción de lock. `DRY_RUN_READY` no es ejecutable.

Antes del primer delete se vuelven a leer el refund confirmado, el evento y el inventario técnico. `SERVICE_CONTINUES`, evidencia stale, cambios en campos de seguridad del evento, manifest stale, assets desconocidos, huérfanos o no propios bloquean con cero deletes. Cada objeto de Storage se vuelve a proteger contra el prefijo exacto del evento.

La raíz sólo se borra después de una verificación pre-root. Se registra `ROOT_DELETE_READY` y, después del borrado, `ROOT_DELETED`; la verificación post-root exige cero residuales y permite recuperación. Un residual nunca produce `PURGED`. El Final Record se minimiza y conserva únicamente referencias administrativas y hashes; no conserva token ni rutas de Storage. Todo continúa limitado a Emulator/mock seguro.

El mapa detallado de writers, lease, recovery y la limitación de uploads in-flight está en [refund-purge-write-freeze.md](refund-purge-write-freeze.md).
# FASE 2E2H1 — cierre Firestore

## FASE 2E2H2 — cierre Storage

## FASE 2E2H3 — reserva permanente de eventId

`eventIdIsAvailable(eventId)` se aplica únicamente al create de
`eventos/{eventId}` y consulta `administrativePurgeRecords/PURGE-{eventId}`.
CEO, ADMINISTRADOR, ADMIN y cualquier platform manager quedan sujetos a la
misma barrera cuando escriben mediante Firestore Rules. La creación normal con
`addDoc()` no cambia. No se modifica el executor ni se crea un tombstone
duplicado.

El freeze de Storage es autoritativo en Rules y usa el mismo `eventos/{eventId}.purgeLock` que Firestore. La consulta cross-service exige que el root exista y no tenga lock; un evento ausente falla cerrado. No se modificaron IAM, buckets, lifecycle policies ni producción.

Los uploads resumibles del Builder se indexan por `eventId` para solicitar cancelación al entrar en purga. El sweeper tardío queda separado del executor destructivo hasta una futura activación aprobada: mantiene el Final Record y no almacena rutas, URLs firmadas, tokens ni URI de sesión.

La defensa Firestore se implementa en Rules mediante `eventNotPurging(eventId)`
con una lectura `getAfter()` del root. Se aplica también al documento padre
para impedir cambios de fecha, `demoMode` o campos operativos durante
`PURGE_PENDING`, sin impedir al Admin SDK adquirir o renovar el lock.

La protección de `invitacion/config` y `invitacion/config/media` es
autoritativa; los prechecks del Builder sólo mejoran UX y no sustituyen Rules.
La compatibilidad de batches grandes debe conservar la coherencia del índice;
no se acepta retirar el freeze como solución.

Storage permanece fuera del alcance de 2E2H1 y conserva el riesgo documentado
de escritura directa/in-flight.
