# Monitoreo de hosting

## Arquitectura

El módulo privado `/admin/#hosting` lee únicamente proyectos de `projects` que tienen `hostingEnabled === true`, `hostingStatus === "active"`, no están cancelados y tienen una `productionUrl` HTTPS válida. La sincronización es idempotente: cada proyecto usa un monitor `project_<projectId>` en `websiteMonitors` y nunca se hardcodea Yogurt Arte Sanar. Un proyecto puede seguir monitorizado en estados `active`, `published` o `completed` mientras el servicio operativo permanezca activo.

El navegador solicita datos a Functions protegidas; no consulta Firestore directamente ni hace el check principal desde el navegador.

## Checks y scheduler

`scheduledHostingChecks` se ejecuta cada cinco minutos en `America/Mexico_City`. Cada check usa primero `HEAD` y cae a un `GET` ligero si el servidor responde 405/501. El timeout es de 10 segundos y se permiten hasta cinco redirecciones, validando cada destino.

Se registra únicamente el resultado técnico en `websiteMonitors/{monitorId}/checks`: hora, estado, HTTP, latencia, categoría de error y mensaje sanitizado. No se guarda HTML ni el body remoto. Los checks detallados se retienen durante 30 días; la limpieza se ejecuta durante los checks.

## Estados y umbrales

- `healthy` / En línea: HTTP 2xx–3xx y respuesta menor a 1,000 ms.
- `degraded` / Lento: respuesta válida con 1,000 ms o más, o HTTP 4xx. Un 404, 401 o 403 indica un problema HTTP, no una caída del servidor.
- `down` / Caído: timeout, DNS, TLS, conexión rechazada o HTTP 5xx confirmado en dos checks consecutivos.
- `unknown` / Sin datos: primer fallo aislado o ausencia de check reciente.
- `paused` / Pausado: monitor deshabilitado.

Un solo fallo no abre incidente. El segundo fallo consecutivo abre `websiteMonitors/{monitorId}/incidents`; al recuperar respuesta el incidente se cierra con hora, duración, HTTP y latencia de recuperación.

## Diagnóstico

Las categorías observadas son `TIMEOUT`, `DNS`, `TLS`, `CONNECTION_REFUSED`, `HTTP_4XX`, `HTTP_5XX`, `REDIRECT_LOOP`, `INVALID_URL`, `PRIVATE_IP` y `UNKNOWN`. La interfaz muestra la causa observada. No afirma causas raíz que el monitor externo no puede demostrar.

## Seguridad

Las Functions requieren el mismo Auth + UID/correo autorizado + App Check del resto del Admin. Firestore permanece deny-all. Las URLs se limitan a HTTPS, bloquean localhost, metadata.google.internal, IPs privadas y credenciales embebidas; cada redirect se revalida. El check manual tiene un límite de 30 segundos por sitio.

## Uptime y UI

La V1 calcula uptime como checks exitosos (`healthy` o `degraded`) dividido entre checks observados del periodo. Se muestran 24 horas, 7 días y 30 días únicamente con los datos disponibles; sin checks se muestra “—”. La pantalla se actualiza cada 60 segundos sin disparar checks nuevos. Los incidentes técnicos no se mezclan con Calendario.

## Rollback

Desactivar `scheduledHostingChecks` y revertir el commit del módulo permite retirar el monitoreo sin cambiar proyectos, prospectos, mensajes ni reglas de Firestore. Las Functions nuevas pueden desplegarse de forma independiente.
