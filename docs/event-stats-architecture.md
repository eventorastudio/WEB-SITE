# Contrato de estadísticas de eventos

La única fuente persistida de estadísticas agregadas es
`eventos/{eventId}.estadisticas`. Admin y Portal comparten el contrato puro de
`shared/event-stats.js`; no existe un segundo resumen de aplicación.

Los campos de raíz `totalInvitados`, `confirmados`, `pendientes` y `llegaron`
son legacy. Pueden permanecer temporalmente en Firestore, pero el frontend no
los lee, escribe, sincroniza ni utiliza como fallback. Su presencia solo puede
ser observada por herramientas de diagnóstico de solo lectura.

En ADMIN, el estado activo vive en `state.event.stats` y representa exactamente
el mapa `event.estadisticas`. Las mutaciones de invitados y check-in actualizan
el resumen canónico y las vistas reaccionan mediante `EVENT_STATS_UPDATED`.

## Regla de Eventos en curso

`estadoEvento` es el campo canónico del ciclo de vida administrado por los
formularios de ADMIN. Un evento está "en curso" si, y solo si,
`estadoEvento === "Activo"` después de normalizar mayúsculas y acentos.

`estadoevento` se considera una variante legacy no gobernada y se ignora.
`estado` representa la región geográfica y nunca participa en el ciclo de vida.
No se infiere el estado operativo desde fecha u hora.

## Auditoría sin mutaciones

```powershell
npm run audit-legacy-event-stats -- EVT-0001
```

Si se omite el ID, la herramienta consulta todos los documentos de `eventos`.
El comando requiere credenciales de Firebase Admin y nunca modifica Firestore.
La eliminación física de campos legacy queda reservada para una migración
posterior e independiente.
