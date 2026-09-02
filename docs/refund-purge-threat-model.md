# Threat model — autorización humana para purga por reembolso

Estado: `HUMAN AUTHORIZATION: IMPLEMENTED LOCALLY` · `PRODUCTION EXECUTION: DISABLED` · `REFUND EVIDENCE: MANUAL ADMINISTRATIVE / NOT PROVIDER-VERIFIED`

La capa 2E2C separa PREPARE → REVIEW → HUMAN CONFIRMATION → AUTHORIZATION READY. No habilita ejecución productiva ni permite que la UI escriba estados destructivos.

| Riesgo | Impacto | Probabilidad | Control actual | Control requerido |
|---|---:|---:|---|---|
| Cuenta CEO comprometida / session theft | CRITICAL | MEDIUM | Claim CEO en backend, fresh auth, confirmación doble, frase exacta, token corto | MFA/step-up Auth y monitoreo antes de producción |
| Callable invocada manualmente, DevTools o frontend modificado | HIGH | HIGH | Backend ignora confianza del frontend; validaciones server-side | Mantener Rules cerradas, App Check y auditoría |
| CSRF / replay / Function replay | HIGH | MEDIUM | Firebase callable, token server-side single-use modelado, expiración 15 min | Validar App Check y consumo atómico al habilitar ejecución |
| XSS con nombre, folio o eventId | HIGH | MEDIUM | UI usa `textContent`, no `innerHTML` con datos del evento | Revisión CSP y pruebas de DOM antes de producción |
| Pestaña vieja, cambio de evento o manifest stale | CRITICAL | HIGH | Selector cargado desde Firebase, reset de estado local, manifest hash y `MANIFEST_STALE` | Revalidar hash justo antes del executor |
| eventId/folio/reembolso equivocados | CRITICAL | MEDIUM | Evento seleccionado, identidad visible, dos identificadores y comparación backend | Confirmación independiente en procedimiento operativo |
| Click accidental / confirmación incompleta | HIGH | MEDIUM | Checkboxes obligatorios, frase no autocompletada, botón inicialmente disabled | Revisión humana documentada |
| Operación duplicada o autorizaciones concurrentes | HIGH | MEDIUM | Transacción, `AUTHORIZATION_ALREADY_ACTIVE`, operationId determinista | Lock final single-use en executor |
| DEMO confundido con cliente / Shared DEMO | CRITICAL | LOW | DEMO bloqueado; Shared DEMO sólo detach | Revisión de origen de assets |
| Manipulación de Storage path o permisos escalados | CRITICAL | MEDIUM | Executor Emulator-only, prefix exacto, segundo guard Shared DEMO | Auditoría de configuración y least privilege |
| Timeout, ejecución concurrente o reembolso modificado | HIGH | MEDIUM | Checkpoints, retryable, fresh refund/manifest validation | Runbook de reanudación y revisión de evidencia |
| Final Record manipulado o discrepancia comercial/Firebase | HIGH | LOW | Final Record server-side y expediente comercial separado | Inmutabilidad/auditoría externa futura |

## Antes vs. después

Antes, la preparación 2E2A producía un dry-run protegido por CEO, pero todavía no existía una revisión humana formal, expiración ni autorización separada. Después, la UI sólo puede cargar eventos, solicitar dry-run, mostrar resumen, registrar confirmaciones y cambiar el registro a `READY_FOR_EXECUTION` mediante backend CEO-only. `READY_FOR_EXECUTION` no dispara ningún trigger, scheduler ni executor productivo.

## Fresh auth, CSRF, App Check y límites

Firebase Auth expone `auth_time` en el token; la callable exige que no tenga más de 15 minutos y devuelve `REAUTH_REQUIRED` cuando falta o caduca. No se implementa contraseña propia ni firma electrónica. La UI solicita App Check usando la configuración existente; no se crea bypass. La protección CSRF se apoya en callable + Auth/App Check y validación backend, pero no se declara riesgo cero.

## Riesgo residual

Una cuenta CEO comprometida, una futura configuración Firebase incorrecta, un bug de backend o una revisión humana equivocada siguen siendo riesgos altos/críticos. Por ello la ejecución productiva permanece deshabilitada y esta fase no autoriza despliegue.

## Cierre 2E2D — riesgos y controles de readiness

- La fuente de refund actualmente disponible no es una API, webhook, checkout ni conciliación automática de Mercado Pago. La entrada histórica manual, de frontend o de fixtures se clasifica como `[REFUND EVIDENCE NOT PRODUCTION READY]`.
- La nueva evidencia operativa vive en `administrativeRefundRecords`, la registra y confirma backend un CEO y queda ligada al evento y al folio comercial. `CONFIRMED` es inmutable desde frontend; las correcciones requieren un procedimiento explícito.
- `terminationIntent` debe ser `SERVICE_CONTINUES` o `COMPLETE_TERMINATION`. La primera opción bloquea la preparación; la segunda sólo hace elegible el proyecto sujeto a todos los controles. Nunca se infiere la terminación por monto o porcentaje.
- La autorización compara `refundEvidenceHash` contra el registro confirmado actual; si la evidencia cambia antes de autorizar, se rechaza como stale. La futura ejecución deberá repetir esta consulta antes del primer delete.
- Sólo un registro `CONFIRMED` puede preparar una purga. `linkedPurgeOperationId` impide reutilizar el mismo refund para dos operaciones. Los reembolsos parciales quedan pendientes de decisión del propietario: `[OWNER DECISION REQUIRED: PARTIAL REFUND PURGE]`.
- La reautenticación local usa la credencial oficial Email/Password de Firebase (`EmailAuthProvider` + `reauthenticateWithCredential`), con `auth_time` fresco de 15 minutos. No hay proveedor Google/externo detectado en el flujo actual y MFA no está configurado.
- App Check reCAPTCHA v3 se conserva en las callables administrativas. No se amplían Rules ni se confía en booleanos, referencias o fechas enviadas por el navegador.
- El gate productivo está diseñado con allowlist exacta de proyecto `eventorastudio-d6d95` y bucket `eventorastudio-d6d95.firebasestorage.app`, pero el kill switch permanece `false` y la callable futura `executeAuthorizedRefundProjectPurge` no existe.

### Cierre 2E2F2A

El executor ahora requiere `READY_FOR_EXECUTION` y autorización single-use ligada servidor a operación, evento, manifest, refund confirmado y actor CEO. La relectura pre-delete cubre `COMPLETE_TERMINATION`, hashes de evidencia y hash de seguridad del evento. Los candidatos huérfanos, desconocidos, compartidos o no clasificados no se borran. La raíz tiene checkpoints pre/post y recuperación; los residuales bloquean y evitan `PURGED`. El riesgo concurrente global queda documentado como pendiente de infraestructura antes de cualquier apertura productiva.

La Fase 2E2F2B cierra ese riesgo para las escrituras cliente y Functions auditadas mediante freeze canónico, Rules, guards backend y lock global persistente. Permanece explícitamente el warning `[IN-FLIGHT STORAGE UPLOAD GAP]`: una subida ya iniciada puede terminar, pero será detectada por stale/verification y no convierte la operación en `PURGED` si deja residuales.
- Las callables administrativas relacionadas ya declaran `enforceAppCheck: true`; el test de App Check en emulador queda pendiente de validación integrada con un token de test compatible.
# FASE 2E2H1 — estado de amenazas

## FASE 2E2H2 — estado actualizado

## FASE 2E2H3 — cierre non-reuse

`[EVENT ID NON-REUSE RESOLVED]`: si existe
`administrativePurgeRecords/PURGE-{eventId}`, la creación cliente del root es
DENY aunque el payload omita, anule o falsee `purgeLock`. El registro
administrativo no es borrable por cliente y sobrevive como evidencia para el
late-upload sweeper.

`[FIRESTORE WRITE FREEZE RESOLVED]` y `[STORAGE WRITE FREEZE RESOLVED VIA RULES + SWEEPER]` quedan respaldados por pruebas del Emulator. El cross-service check bloquea uploads directos y deletes durante `purgeLock`, incluido el root ausente, y aísla por `eventId`.

La subida iniciada antes del freeze sigue siendo una carrera inevitable de la API resumible. La cancelación por evento reduce el riesgo y el sweeper elimina late objects por prefijo exacto, incluso con root eliminado si el Final Record indica `PURGED` o checkpoint destructivo. Un fallo temporal de delete se propaga para retry; no se acepta limpieza con residuales.

Resuelto para Firestore:

- cliente directo no puede modificar el root durante `purgeLock`;
- cliente directo no puede escribir draft, config, media, publication ni RSVP
  privado durante el freeze;
- el cliente no puede manipular el propio campo `purgeLock`.

Pendiente para FASE 2E2H2:

- upload directo a Storage durante el freeze;
- upload iniciado antes del freeze que termina después;
- residual Storage posterior a `PURGED`.

Por tanto, no debe marcarse `[CONCURRENT WRITE GAP]` como resuelto de forma
global: el estado correcto es `[FIRESTORE WRITE FREEZE RESOLVED]` y
`[STORAGE WRITE FREEZE PENDING]`, sujeto a la validación Emulator pendiente.
