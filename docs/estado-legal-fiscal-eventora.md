# Estado legal y fiscal de Eventora Studio

## Nota de FASE 2E2H2

## Nota de FASE 2E2H3

Los IDs de eventos asociados a una reserva administrativa de purga no se
reutilizan. Es un control técnico de integridad y trazabilidad; no modifica la
retención legal, fiscal o contractual ni habilita purgas productivas.

El cierre técnico de Storage no cambia obligaciones legales, fiscales ni de conservación. Se protege el contenido operativo con Rules cross-service, se cancelan uploads activos de forma best-effort y se prevé limpieza tardía de objetos aceptados por Storage. El Final Record no conserva rutas Storage, URLs firmadas, tokens, URI de sesión ni contenido personal.

La implementación permanece local/no productiva: no hay callable destructiva expuesta, trigger del sweeper habilitado, kill switch activado ni deploy.

Actualización documental intermedia: 1 de septiembre de 2026. Este documento no constituye la integración legal definitiva.

## RESUELTO / ESTABILIZADO

- Luis Pablo García Moncada, persona física, opera bajo el nombre comercial Eventora Studio.
- Servicio: diseño, personalización, publicación y operación de invitaciones digitales para eventos; no es un proveedor presencial del evento.
- Autoridad de privacidad: Secretaría Anticorrupción y Buen Gobierno o la autoridad que legalmente asuma sus atribuciones.
- Arquitectura dual: Eventora es Responsable de sus datos comerciales y Persona Encargada respecto de datos de invitados tratados por cuenta del organizador.
- Proveedores: Firebase/Google Cloud pueden ser Personas Encargadas o proveedores ulteriores; Google Maps y WhatsApp/Meta pueden tener roles independientes según el tratamiento.
- Ciclo de privacidad: día 30 cesa el tratamiento operativo de invitados, RSVP, lugares, pases y QR; día 50 termina el acceso público y cesa el tratamiento activo del contenido personal y multimedia.
- Finalidad temporal entre evento y día 50: consulta de la invitación como recuerdo del evento.
- Aceptación electrónica documentada mediante mensajes de datos atribuibles al cliente; no se declara que cualquier WhatsApp sea una firma definitiva.
- Artículo 56 LFPC: aplicación caso por caso; no hay excepción automática por iniciar diseño, pagar o publicar.
- Artículo 76 BIS IX: se reciben solicitudes de cancelación por canales publicados y se evalúan sus efectos conforme a contrato y ley.
- Bonificaciones de artículos 92 BIS y 92 TER: referencia prudente; no se promete automáticamente reembolso total más 20%.
- NMX-COE-001-SCFI-2018: referencia normativa/interna, sin afirmar certificación ni cumplimiento integral.
- IVA general del 16% y precios públicos como monto total aplicable, con “Desde” sólo cuando exista ese precio base real.
- RESICO para persona física según la situación fiscal efectivamente registrada; no se reproducen datos fiscales sensibles.
- Facturación manual inicial, sin portal, PAC, checkout ni automatización SAT. La CSF no es requisito obligatorio.
- CFDI global como procedimiento administrativo interno para operaciones sin CFDI individual, cuando corresponda.
- Mercado Pago: ingreso bruto cobrado; no se hardcodean comisiones. SPEI, PUE, PPD y REP se determinan según la operación fiscal concreta.
- Reembolsos: cuando corresponda, se evalúan CFDI de egreso, documentos relacionados o cancelación de CFDI sin automatización.
- Comprobante comercial separado del CFDI y con leyenda neutral.
- Procedimiento manual de contratación con solicitud, cotización, puesta a disposición de documentos, aceptación expresa, pago e inicio material.
- Plantillas estructuradas de cotización, Nota de Venta / Comprobante Comercial y mensaje de aceptación por WhatsApp.
- Registro documental de versión de Términos, fecha/URL puesta a disposición y evidencia de aceptación.
- Expediente comercial mínimo por cliente/evento y registro objetivo de etapas 15% / 55% / 30%.
- Procedimiento manual de cancelación y reembolso con separación de fechas y plazo comercial máximo de 7 días hábiles desde la confirmación de procedencia.

## FASE 2D1B — FECHA CANÓNICA SINCRONIZADA

- La fecha canónica prevista del ciclo de vida es `eventos/{eventId}.fecha`, con semántica de fecha civil local estricta `YYYY-MM-DD`.
- El draft conserva la representación equivalente en `invitacion/draft.content.schedule.date`; la creación inicial usa la fecha raíz.
- El auditor dry-run `scripts/audit-event-dates.mjs` detecta discrepancias sin corregir datos ni ejecutar retención.
- Rules permite a un editor autorizado actualizar únicamente `fecha` cuando es una cadena con forma `YYYY-MM-DD`; no permite combinarla con `demoMode`, `estado`, `owner`, `uid` u otros campos.
- Builder sincroniza draft y raíz en una sola transacción; Dashboard sincroniza raíz y el campo anidado del draft sólo cuando el draft existe. Un fallo aborta la operación completa.
- Los estados históricos discrepantes no se autocorrigen: requieren el auditor dry-run y revisión manual. No se implementa retención, borrado ni despublicación.

## ACTUALIZACIÓN DE POLÍTICA — PURGA POR REEMBOLSO

- Solicitud, aprobación, procesamiento del reembolso y purga son etapas distintas; solicitar un reembolso no elimina datos ni evidencia.
- Después de un reembolso procedente procesado, la futura purga operativa será irreversible y separada de la retención normal +30/+50.
- Se conservará por separado sólo el expediente comercial, legal y fiscal necesario para obligaciones, controversias o defensa de derechos.
- Shared DEMO Library no se borrará por referencias de proyectos; un posible origen en material del cliente requiere `[REQUIERE REVISIÓN DE ORIGEN DE ASSET ANTES DE PURGA]`.
- No se implementan campos PURGED, automatización, script de limpieza ni borrado en esta actualización. El diseño está documentado en `docs/refund-project-purge-policy.md`.

## FASE 2E2A — MOTOR DE PURGA EN PREPARACIÓN

- `prepareRefundProjectPurge` existe únicamente como preparación backend y dry-run protegido por claim CEO.
- El registro administrativo separado usa sólo `DRAFT`, `DRY_RUN_READY` y `BLOCKED`; no avanza a estados destructivos.
- `PURGE ENGINE: PREPARATION / DRY-RUN IMPLEMENTED`.
- En el alcance de 2E2A no se implementó ejecución destructiva; el executor de 2E2B queda limitado a emulador.
- No se modifican eventos DEMO, publicación, RSVP, QR, check-ins, Storage ni Shared DEMO.

## FASE 2E2B — EXECUTOR DE PURGA SÓLO EN EMULADOR

- `executeRefundProjectPurge` es un servicio interno no exportado como callable/HTTP.
- El executor exige Firestore Emulator, Storage Emulator/mock seguro, proyecto demo permitido y flag destructivo explícito; fuera de esas condiciones aborta.
- Implementa `PURGE_PENDING` → `FIRESTORE_PURGING` → `STORAGE_PURGING` → `VERIFYING` → `PURGED`, con `BLOCKED` y `FAILED_RETRYABLE`.
- La publicación pública y RSVP se neutralizan primero; el root se elimina al final; el Final Record sobrevive.
- DEMO, manifest stale, UNKNOWN y Shared DEMO físico bloquean o se conservan; Shared DEMO sólo permite `DETACH_ONLY`.
- No se modifica Rules, no se implementa UI de ejecución y no hay ejecución productiva.
- La capa administrativa local CEO-only sí fue implementada en 2E2C para PREPARE, REVIEW y HUMAN CONFIRMATION; no ejecuta la purga.

## FASE 2E2D — EVIDENCIA ADMINISTRATIVA Y GATE DE PRODUCCIÓN

- No existe fuente de refund provider-verified: no se implementan API, webhook, checkout ni conciliación automática. La evidencia manual, frontend o fixture queda marcada `[REFUND EVIDENCE NOT PRODUCTION READY]`.
- `administrativeRefundRecords` es backend-managed, con `RECORDED` → `CONFIRMED`; sólo `CONFIRMED` puede preparar una purga. El registro queda ligado a evento y folio comercial, es inmutable una vez confirmado y no puede justificar dos purgas.
- `terminationIntent` es obligatorio: `SERVICE_CONTINUES` significa `NOT PURGE ELIGIBLE`; `COMPLETE_TERMINATION` significa `PURGE ELIGIBLE` sujeto a controles. No se infiere mediante monto, porcentaje, refund total, estado o fecha.
- El procedimiento se denomina “Confirmación administrativa de reembolso procesado”; no equivale a confirmación del proveedor. Los refunds parciales requieren `[OWNER DECISION REQUIRED: PARTIAL REFUND PURGE]`.
- La reautenticación implementada usa Email/Password oficial de Firebase, con fresh auth de 15 minutos. No se detectaron proveedores externos en el flujo actual; MFA no está configurado.
- El gate de producción conserva allowlist exacta para `eventorastudio-d6d95` y `eventorastudio-d6d95.firebasestorage.app`, con kill switch `false`. No existe callable de ejecución productiva y no se realizó ninguna eliminación real.

### Fase 2E2F2A

Se endureció exclusivamente el executor de Emulator: autorización CEO vinculada y single-use, refund confirmado de terminación completa, verificación pre/post raíz, bloqueo de huérfanos y minimización del registro administrativo. La ejecución productiva permanece deshabilitada; no se alteró el gate, no se creó callable productiva y no se realizaron borrados reales. La coordinación global entre RSVP/QR y purga permanece pendiente para una fase posterior.

### Fase 2E2F2B

Se cerró el blocker de concurrencia con freeze operativo canónico, Rules para writers cliente, guards backend auditados y serialización global persistente con lease/recovery. La única limitación residual documentada es una subida Storage ya iniciada antes del freeze; no se oculta como protección total.

## PENDIENTE

- Política comercial Eventora: etapas económicas 15% configuración inicial, 55% diseño/personalización y 30% publicación/operación; requiere validación legal antes de publicación.
- Política comercial Eventora: reembolsos procedentes dentro de máximo 7 días hábiles desde la confirmación de procedencia; los tiempos de acreditación pueden depender del proveedor de pagos.

- Domicilio final del responsable.
- Domicilio contractual y jurisdicción final.
- Respuesta de PROFECO/DGCARA sobre aplicabilidad de NOM-174-SCFI-2007 y registro RPCA.
- Validación legal de las etapas y criterios económicos objetivos en las cotizaciones antes de su publicación.
- Implementación operativa del plazo comercial de reembolsos en cada acuerdo y canal de pago.
- Cualquier ajuste que solicite PROFECO o que autorice expresamente el propietario.
- Eventos legacy con `CONFLICT`, `MISSING` o `INVALID` requieren revisión manual antes de cualquier futura retención.

## NO INCLUIDO EN ESTA FASE

Portal de facturación, formulario SAT, módulo CFDI, integración PAC/API SAT, checkout, nuevo flujo Mercado Pago, automatización de reembolsos o cambios de funcionalidad.

DPA recomendado para una futura operación B2B con planners, empresas u otros organizadores profesionales; no se crea ni se publica en esta fase.
