# Calendario de proyectos

El panel privado `/proyectos/#calendario` muestra en una vista mensual las fechas operativas de Eventora Studio. El acceso mantiene el flujo existente de Firebase Authentication, App Check y Functions protegidas por el administrador de proyectos.

## Eventos automáticos

Se derivan en tiempo de consulta desde cada documento de `projects`; no se copian a otra colección:

- `nextMaintenanceReviewAt`: mantenimiento preventivo, sólo si `maintenanceEnabled` es `true`.
- `nextQuarterlyReviewAt`: revisión trimestral, sólo si `maintenanceEnabled` es `true`.
- `maintenanceRenewalDate`: renovación de mantenimiento, sólo si `maintenanceEnabled` es `true`.
- `hostingRenewalDate`: renovación de hosting, sólo si `hostingEnabled` es `true`.

Los eventos automáticos son de sólo lectura en el calendario. Para cambiar una fecha se abre el proyecto relacionado.

## Eventos manuales

Los eventos creados desde `+ Añadir evento` se guardan en `calendarEvents` con título, fecha, hora opcional, tipo, proyecto opcional, notas, auditoría de creación y actualización. Los tipos disponibles son mantenimiento, revisión, renovación, recordatorio, cliente y otro.

Pueden editarse o eliminarse desde su detalle. El proyecto relacionado es opcional; elegir “Sin proyecto” crea un recordatorio general de Eventora.

## Fechas, filtros y responsive

Las fechas se guardan como `YYYY-MM-DD` y se interpretan en la zona de operación `America/Mexico_City`, evitando conversiones UTC que cambien el día visual. El mes visible consulta su cuadrícula completa y los eventos manuales dentro de ese rango. En móvil se presenta una agenda por fecha para conservar legibilidad.

Los estados Hoy, Próximo y Vencido se derivan al leer los eventos. La tab muestra un badge discreto cuando existen eventos vencidos.

## Seguridad

El navegador nunca lee Firestore directamente. `getCalendarEvents`, `createCalendarEvent`, `updateCalendarEvent` y `deleteCalendarEvent` verifican el ID Token con la whitelist actual de proyectos y conservan App Check en el cliente. Las reglas de Firestore permanecen deny-all.
