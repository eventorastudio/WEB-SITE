# Política técnica futura de purga por reembolso

## FASE 2E2H2 — límites operativos

## FASE 2E2H3 — EVENT ID NON-REUSE

Una vez que existe una reserva de purge, el `eventId` queda reservado
permanentemente. No puede liberarse eliminando el Final Record desde cliente ni
creando un nuevo root con el mismo ID. Esta regla evita colisiones con hashes,
referencias administrativas y late-upload sweeper.

La política incorpora freeze de escrituras Storage, cancelación best-effort de uploads en vuelo y limpieza tardía por sweeper. Esto no modifica la retención legal separada ni promete borrar copias de proveedores, respaldos o descargas de terceros. El Final Record sigue siendo mínimo y no contiene contenido de invitación, multimedia, invitados, RSVP, QR, tokens, URLs de descarga ni rutas Storage.

No se ejecuta ninguna purga productiva en esta fase. La ventana transitoria de un objeto entre `PURGED` y el sweeper es controlada y no constituye residual permanente.

Documento interno de arquitectura. Esta política no ejecuta borrados, no crea automatización y no autoriza operaciones sobre producción.

Estado técnico actual: dry-run `IMPLEMENTED`; executor destructivo `IMPLEMENTED FOR EMULATOR TESTING ONLY`; autorización humana `IMPLEMENTED LOCALLY`; evidencia de refund `MANUAL ADMINISTRATIVE / NOT PROVIDER-VERIFIED`; producción `DISABLED / NOT EXPOSED`.

Actualización 2E2F2A: la ejecución local exige autorización `READY_FOR_EXECUTION`, refund confirmado con `COMPLETE_TERMINATION`, lock y consumo single-use. No se ejecutan borrados con `DRY_RUN_READY`, `SERVICE_CONTINUES`, evidencia stale, assets huérfanos/desconocidos o residuales post-root. La raíz sólo se elimina tras verificación pre-root y el registro final se minimiza. No se habilita purga productiva ni se modifica el kill switch.

Actualización 2E2F2B: `PURGE_PENDING` congela las escrituras operativas mediante `eventos/{eventId}.purgeLock`; el lock global persistente serializa una sola purga irreversible activa y conserva recovery por `operationId`. Las subidas Storage in-flight quedan como limitación técnica explícita, sin ampliación de permisos.

## Flujo obligatorio

`REQUEST` → `REFUND_REQUESTED` → `REFUND_APPROVED` o rechazo → `REFUNDED` → `PURGE_PENDING` → `PURGED` → `FINAL RECORD`.

Una solicitud de reembolso no equivale a una purga. Mientras se evalúa la solicitud debe detenerse el trabajo nuevo, conservarse la evidencia necesaria y mantenerse separada la decisión comercial de la operación de pago. La purga sólo podrá comenzar después de que el reembolso procedente haya sido procesado.

La evidencia operativa se registra en `administrativeRefundRecords` con estados `RECORDED` y `CONFIRMED`. Es una confirmación administrativa de reembolso procesado, no una verificación del proveedor de pagos. No hay API, webhook, checkout ni conciliación automática. Los reembolsos parciales no se consideran automáticamente aptos para purga: `[OWNER DECISION REQUIRED: PARTIAL REFUND PURGE]`.

`SERVICE_CONTINUES` significa que la contratación permanece activa y es `NOT PURGE ELIGIBLE`. `COMPLETE_TERMINATION` significa que el reembolso forma parte de la terminación completa y es `PURGE ELIGIBLE` sujeto a todos los controles. La intención debe declararse expresamente; no se infiere por monto, porcentaje, refund total, estado o fecha.

## PURGED

`PURGED` será un estado irreversible del proyecto operativo. No habrá `reactivate`, `restore`, `recover` ni `unpurge`. Para volver a trabajar con el cliente deberá abrirse una nueva contratación y un nuevo proyecto.

## Alcance operativo futuro

La purga deberá retirar, cuando existan y pertenezcan exclusivamente al proyecto, la publicación, proyecciones públicas, revisiones, draft, configuración, datos del evento, invitados, pases, mesas, acompañantes, notas, RSVP, tokens, QR, check-ins, URLs personalizadas, contenido personal, multimedia y objetos Storage.

No se debe eliminar un binario de `demo-library/DML-...` por el solo hecho de que un proyecto lo referencie. Debe eliminarse únicamente la referencia del proyecto. Si un asset compartido pudo originarse en material del cliente, aplica: `[REQUIERE REVISIÓN DE ORIGEN DE ASSET ANTES DE PURGA]`.

## Conservación separada

El expediente comercial, legal y fiscal no forma parte del proyecto recuperable. Se conservará únicamente lo necesario para obligaciones legales, fiscales, contractuales, seguridad o defensa de derechos: cotización, folio, aceptación, versiones documentales, pagos, comprobantes, evidencia del reembolso, fechas, monto, medio, referencias y estado administrativo.

La formulación externa deberá ser prudente: Eventora Studio eliminará o suprimirá los datos y archivos operativos de sus sistemas activos bajo su control, sujeto a periodos de bloqueo o conservación exigidos y a ciclos técnicos de proveedores. No se promete borrar de inmediato logs, respaldos de proveedores, descargas de terceros, historial del navegador ni desindexación universal.

## Registro final mínimo

Se diseñará posteriormente un registro de trazabilidad que no contenga nombres de invitados, RSVP, QR, fotografías, videos, multimedia ni contenido de invitación. Sus campos definitivos quedan pendientes de revisión arquitectónica y legal; podrían limitarse a una referencia de evento, folio comercial, fecha de reembolso, fecha de purga y estado administrativo.

## Separación de políticas

La purga por reembolso es independiente de la retención normal post-evento. No utiliza `eventos/{eventId}.fecha`, no espera automáticamente +30/+50 y no crea todavía campos, Functions, scripts ni automatización.

La Fase 2D2 normal (`ACTIVE`/`RETIRED`) conserva su necesidad para retiros temporales y para la futura retención normal. El hallazgo `[BLOQUEO: PUBLICACIÓN NO RECONSTRUIBLE DE FORMA REVERSIBLE]` sigue vigente para esa ruta y no se elimina por esta política.
