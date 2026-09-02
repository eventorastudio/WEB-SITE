# Retención y borrado de datos — Eventora Studio

## Purga futura por reembolso

La purga por reembolso es independiente de la retención normal 30/50. Una solicitud no activa borrado: primero se detiene trabajo nuevo, se evalúa la procedencia, se aprueba o rechaza y, sólo después de procesar un reembolso procedente, podrá planearse `PURGE_PENDING` y una purga irreversible. `PURGED` no admitirá reactivación ni recuperación.

La purga futura abarcará datos operativos y contenido bajo control de Eventora cuando corresponda, pero preservará por separado el expediente comercial, legal y fiscal estrictamente necesario. No se prometerá borrado inmediato de logs, respaldos de proveedores, descargas de terceros o historial del navegador. Shared DEMO Library no se elimina automáticamente: sólo se retirará la referencia del proyecto; si existe posible origen en contenido del cliente, aplica `[REQUIERE REVISIÓN DE ORIGEN DE ASSET ANTES DE PURGA]`.

Documento interno. Actualizado: 27 de agosto de 2026. No crea plazos comerciales ni autoriza borrados destructivos.

## Fecha canónica para una futura retención

La fuente canónica prevista del ciclo de vida del evento es `eventos/{eventId}.fecha`, con semántica de fecha civil local en formato estricto `YYYY-MM-DD`, sin conversión UTC. El Builder conserva una representación equivalente en `invitacion/draft.content.schedule.date`; las escrituras de eventos nuevos se inicializan con la misma fecha y las ediciones válidas sincronizan ambas ubicaciones atómicamente. Los eventos sin draft sólo conservan la fecha raíz hasta que el Builder inicialice el draft.

Los eventos existentes deben pasar primero por el auditor dry-run `scripts/audit-event-dates.mjs`. Los estados `CONFLICT`, `MISSING`, `INVALID_ROOT` e `INVALID_DRAFT` quedan excluidos de cualquier futura selección de retención hasta revisión manual. La retención automática 30/50 todavía no está implementada.

## Clasificación

- **CONFIRMADO:** ciclo documentado de conservación, bloqueo y supresión: día 30 para cesar el tratamiento operativo de invitados, RSVP, lugares, pases y QR; día 50 para despublicar la invitación y cesar el tratamiento activo del contenido personal y multimedia.
- **PENDIENTE TÉCNICO:** la política objetivo todavía no equivale a una purga automática integral.
- **PENDIENTE PROPIETARIO:** depuración operativa de cuentas y ciclo de vida administrativo de demos.
- **PENDIENTE ABOGADO/PROVEEDOR:** retención de logs y excepciones de conservación.

| Tipo | Ubicación | Mecanismo observado | Revisión | Responsable | Pendiente |
|---|---|---|---|---|---|
| Cuenta | Authentication / `usuarios` | gestión administrativa; no baja integral confirmada | relación comercial y obligaciones posteriores | operación/admin | [PENDIENTE: DEFINIR DEPURACIÓN OPERATIVA; conservar mientras sea necesario para obligaciones legales, contractuales, fiscales, seguridad o defensa de derechos] |
| Evento | `eventos/{eventId}` | eliminación administrativa existente, por auditar | acceso público termina al día 50; después, bloqueo/supresión conforme corresponda | operación/admin | [PENDIENTE: MAPEAR BORRADO COMPLETO] |
| Invitados | subcolección `invitados` | eliminación individual en Guest Manager | 30 días posteriores a la fecha del evento como objetivo | organizador/operación | política objetivo confirmada; falta automatización integral |
| RSVP | subcolecciones `rsvp*` | operaciones funcionales; no supresión integral | 30 días posteriores a la fecha del evento como objetivo | operación/admin | política objetivo confirmada; falta automatización integral |
| QR/accesos | invitado y documentos de acceso | revocación/regeneración funcional | 30 días posteriores a la fecha del evento como objetivo | operación/admin | política objetivo confirmada; falta automatización integral |
| Media | documentos media + Storage | eliminación por flujo existente; pueden quedar huérfanos en casos controlados | cesa tratamiento activo al día 50; conservación posterior sólo cuando corresponda legalmente | operación/admin | [PENDIENTE: MAPEAR BORRADO COMPLETO Y GARBAGE COLLECTION] |
| Shared DEMO media | `demo-library/` + referencias | no borrar binario al quitar una referencia local | mientras sea necesario para demos activas; revisión periódica | operación/admin | [PENDIENTE: DEFINIR PROCEDIMIENTO ADMINISTRATIVO Y CICLO DE VIDA DE DEMOS] |
| Logs | proveedor | no control propio confirmado | según proveedor/necesidad | operación/proveedor | [PENDIENTE: CONFIRMAR RETENCIÓN DE LOGS CON CONFIGURACIÓN Y PROVEEDORES] |

Entre el evento y el día 50 la finalidad adicional es permitir la consulta temporal de la invitación como recuerdo del evento. Antes de borrar, verificar obligaciones legales, reclamaciones, dependencias, referencias compartidas y preservación de evidencia. La conservación posterior que resulte legalmente necesaria no implica uso operativo de los datos ni garantiza eliminación física automática exacta.
