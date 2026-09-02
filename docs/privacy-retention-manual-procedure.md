# Procedimiento manual de retención 30/50 — Eventora Studio

## Ruta separada de reembolso

La solicitud de reembolso no es una orden de purga. El expediente debe recorrer `REQUEST` → detener trabajo nuevo → evaluar → aprobar/rechazar → procesar reembolso → `PURGE_PENDING` → purga futura → registro final mínimo. Ninguna purga puede comenzar antes de confirmar el reembolso procesado. La purga por reembolso será irreversible y no se mezcla con las revisiones manuales de +30/+50.

Procedimiento interno. Actualización: 1 de septiembre de 2026. No crea automatizaciones ni promete eliminación física inmediata.

## Ficha de revisión

- Evento:
- Fecha del evento:
- Fecha límite día +30:
- Fecha límite día +50:
- Responsable de revisión:
- Fecha de cierre:

La fecha de referencia prevista es `eventos/{eventId}.fecha`, como fecha civil local `YYYY-MM-DD`. Antes de calcular días 30/50 debe verificarse que coincide con `invitacion/draft.content.schedule.date` mediante `scripts/audit-event-dates.mjs`. Un evento con `CONFLICT`, `MISSING` o cualquier estado `INVALID` requiere revisión manual y queda excluido.

## Día +30 — datos operativos de invitados

Revisar invitados, RSVP, pases, QR, check-in, mesa y estados operativos. Confirmar que cesó la necesidad operativa y aplicar, según corresponda, cancelación, bloqueo o supresión conforme a la finalidad y obligaciones de conservación.

Registrar acciones realizadas, incidencias y dependencias, datos conservados por obligación legal, contractual, seguridad o defensa de derechos, y fecha de cierre.

## Día +50 — invitación y contenido personal

Revisar acceso público, publicación, multimedia, nombres, textos, fotografías, videos y Storage relacionado. Despublicar el enlace o terminar el acceso público cuando corresponda. Registrar elementos bloqueados o suprimidos, incidencias y conservación legal necesaria.

No afirmar eliminación de backups del proveedor si no son controlables. La despublicación no garantiza desindexación en buscadores.

## Control y evidencia

Conservar una constancia administrativa de la revisión sin copiar tokens QR, contraseñas ni datos innecesarios. Si existe una reclamación, obligación legal o incidente, preservar únicamente la información necesaria y documentar la razón.

**AUTOMATIZACIÓN FUTURA: PENDIENTE**

La fecha canónica se sincroniza únicamente durante una escritura válida y atómica: Builder actualiza draft y raíz; Dashboard actualiza raíz y, si existe, sólo `content.schedule.date` del draft. Si alguna escritura falla, no se conserva un estado parcial. No se corrigen automáticamente estados históricos ni se ejecuta retención.
