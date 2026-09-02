# Procedimiento manual de cancelación y reembolso

## Actualización de arquitectura de purga

La solicitud de reembolso no elimina el proyecto. El flujo conceptual es `REQUEST` → detener trabajo nuevo → evaluar procedencia → aprobar o rechazar → procesar el reembolso procedente → `PURGE_PENDING` → purga operativa → `FINAL RECORD`. La purga sólo puede iniciar después de confirmar el procesamiento del reembolso.

La futura purga operativa será irreversible para la invitación y no tendrá restauración ni reactivación. No comprende automáticamente el expediente comercial, legal o fiscal que deba conservarse, ni permite eliminar assets independientes de Shared DEMO Library. Esta sección es diseño interno: no autoriza borrados actuales.

## 1. Solicitud recibida

Registrar fecha, hora, cliente, evento y canal. Asignar un folio administrativo `EV-CAN-YYYY-0001`.

## 2. Detener trabajo nuevo

Detener el trabajo futuro mientras se revisa la solicitud. Registrar el estado actual del proyecto sin borrar evidencia ni alterar retrospectivamente el expediente.

## 3. Revisión

Revisar la etapa alcanzada, actividades ejecutadas, cotización, versión de Términos, aceptación, pagos, acuerdo aplicable y derechos legales de la persona consumidora. Consultar `docs/service-stage-record.md`.

## 4. Determinación

Registrar por separado la fecha de solicitud y la fecha en que se determinó la procedencia. Documentar la razón, el importe y cualquier documentación adicional requerida.

## 5. Reembolso procedente

Procesar conforme a la política comercial dentro de un máximo de 7 días hábiles desde la confirmación de procedencia. Registrar folio `EV-REE-YYYY-0001`, fecha de procesamiento, medio, importe y referencia.

Separar:

- fecha de cancelación;
- fecha de determinación;
- fecha de procesamiento del reembolso;
- fecha de acreditación bancaria.

No garantizar la última fecha, porque puede depender de la institución financiera o proveedor de pagos.

## 6. Privacidad y archivo

Conservar sólo la información necesaria para documentar la solicitud, decisión y operación. Limitar el acceso y evitar copias innecesarias de conversaciones completas.
