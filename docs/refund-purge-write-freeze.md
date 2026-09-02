# Fase 2E2F2B — Event Freeze y Global Purge Serialization

## Fuente canónica

El único indicador de freeze es `eventos/{eventId}.purgeLock.operationId`. No se crean booleanos paralelos. `PURGE_PENDING` activa el freeze operativo; `DRY_RUN_READY` y `READY_FOR_EXECUTION` todavía permiten cancelación.

## Lock global

`administrativeLocks/refundProjectPurge` se adquiere transaccionalmente junto con el `purgeLock` del evento. Sólo contiene `operationId`, `eventId`, `acquiredBy`, `acquiredAt`, `leaseExpiresAt` y `lockVersion`. Una operación distinta recibe `GLOBAL_PURGE_ALREADY_RUNNING`; una lease expirada no permite takeover automático de una operación incompleta.

La lease es de cinco minutos y el executor la renueva entre etapas. La misma `operationId` puede recuperar el lock durante `FAILED_RETRYABLE` o `ROOT_DELETED`. El lock global se libera sólo en `PURGED` o en un bloqueo seguro anterior al primer delete. No se libera después de iniciar destrucción.

## Writers auditados

| Área | Writers relevantes | Protección |
|---|---|---|
| Builder/draft | `invitation-draft-service`, sincronización de fecha | Rules + precheck transaccional |
| Publication | `invitation-publication-service`, revisiones y proyección pública | Rules + precheck transaccional |
| Media | metadata/config y eliminación manual | config: Rules; media batch: precheck de servicio |
| Storage | `uploadBytesResumable` de media | precheck cliente + Storage Rules; limitación in-flight |
| Invitados/QR | `guest-service`, QR y pases | Firestore Rules |
| RSVP | respuesta pública, access, state/conflicts y reconciliación | Rules + guard backend en reconciliation |
| Check-in | `portal/services/checkin-service` | Firestore Rules |
| Dashboard | alta/edición operativa | Firestore Rules |
| Functions/admin | refund, preparación, autorización y executor | guards backend; Admin SDK bypass Rules intencional |
| Calendar/lecturas | calendar HTTP y loaders | read-only |

## Rules y backend

Las escrituras cliente operativas consultan el evento y rechazan un `purgeLock` activo. La excepción conocida es el batch histórico de hasta 20 documentos de media: añadir una lectura del evento a cada operación supera el límite de access calls de Rules; el servicio hace precheck y la escritura de `config` queda protegida, pero el documento media individual no tiene todavía una barrera Rule independiente. Admin SDK no queda bloqueado por Rules; por eso las Functions sensibles deben llamar guards backend propios. La UI sólo ofrece una señal neutral y no es frontera de seguridad.

## Storage limitation

`storage.rules` no puede consultar de forma fiable el documento Firestore del evento en esta arquitectura. Por ello existe precheck de servicio antes de iniciar el upload, pero una transferencia ya iniciada no puede cancelarse mágicamente: permanece el warning `[IN-FLIGHT STORAGE UPLOAD GAP]`. El manifest stale y la verificación final detectan el objeto residual; no se amplían permisos ni se toca `demo-library/`.

También permanece `[FIRESTORE MEDIA BATCH RULES LIMITATION]` para el writer directo de metadata media; requiere una futura partición/reestructura del batch antes de afirmar cobertura total de Rules.

## Recovery y TOCTOU

Tras adquirir ambos locks, el executor vuelve a validar evento, refund y manifest antes del primer delete. Las etapas y checkpoints permiten reanudar sin otra operación paralela. `ROOT_DELETE_READY` exige verificación pre-root; `ROOT_DELETED` habilita recuperación post-root; cualquier residual impide `PURGED`.

## Alcance

Todo el flujo destructivo continúa restringido a Emulator/mock seguro. No existe callable destructiva productiva, no se habilitó el kill switch y no se hizo deploy.
# FASE 2E2H1 — Freeze autoritativo Firestore

## FASE 2E2H2 — Storage freeze y late uploads

## FASE 2E2H3 — EVENT ID NON-REUSE

La reserva administrativa `administrativePurgeRecords/PURGE-{eventId}` es la
fuente autoritativa para impedir que un ID asociado a una purga vuelva a ser
un proyecto operativo. El create cliente del root consulta esa reserva y falla
cerrado, sin depender de campos enviados en el payload. El Final Record no se
elimina ni se usa un tombstone en el root.

`storage.rules` aplica `eventNotPurging(eventId)` mediante lectura cross-service del root de Firestore. Create y delete de media fallan si existe `purgeLock` o si falta el root; se conservan rol, path, metadata, MIME, extensión y tamaño. `demo-library` no participa en esta decisión.

El Builder registra uploads activos por evento y expone `cancelUploadsForEvent(eventId)` para cancelar tasks resumibles al comenzar la purga. Es una cancelación best-effort: un upload ya aceptado por Storage puede finalizar después del freeze.

`functions/src/purge/late-upload-sweeper.js` es interno y testeable, no un trigger productivo. Inspecciona sólo el prefijo propio de media, consulta root y Final Record, y elimina late objects con `ifGenerationMatch` cuando hay generación. Los errores no-404 se propagan para retry. La ventana transitoria `PURGED -> late finalize -> sweeper delete` queda aceptada; no existe residual permanente diseñado.

La garantía presupone que `eventId` no se reutiliza. La creación actual usa IDs generados por Firestore y no se habilita una ruta manual de reutilización.

El freeze canónico continúa siendo `eventos/{eventId}.purgeLock`. Las Rules
consultan el estado final del documento raíz con una única lectura `getAfter()`
por evaluación y bloquean las escrituras cliente operativas mientras el lock
está activo.

La protección cubre raíz, RSVP, invitados, check-ins, draft, config, media,
publication, revisions y proyección pública. El root tampoco permite que un
cliente cree, quite o modifique `purgeLock`; el Admin SDK de Functions continúa
fuera del alcance de Rules.

Los batches históricos de media se mantienen en Firestore Client SDK y deben
respetar el límite de access calls de Rules. La operación de 20 media más el
documento config se considera una operación de 21 documentos; el test de
reordenamiento escribe únicamente config. La atomicidad exacta del batch y la
compatibilidad final deben confirmarse en Emulator con JDK 21.

Storage no se modifica en esta fase. El bloqueo de uploads directos y de
uploads en vuelo permanece pendiente para FASE 2E2H2.
