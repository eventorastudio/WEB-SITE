# Fase 1: seguridad y estabilidad

## App Check

Las Functions HTTP sensibles verifican el header `X-Firebase-AppCheck` mediante Firebase Admin SDK. Las Functions administrativas validan primero el ID Token y después App Check. La respuesta para App Check ausente o inválido es HTTP 401, sin exponer tokens ni detalles internos.

El formulario público obtiene el token desde el proveedor reCAPTCHA v3 configurado y lo envía junto con `submitWebsiteRequest`. Auth no depende de App Check y no se modificaron providers.

## Rate limiting

`submitWebsiteRequest` usa una ventana de 15 minutos y permite hasta 5 solicitudes por identificador derivado de la IP. El identificador se almacena como SHA-256; no se guarda la IP en texto plano. Al superar el límite responde HTTP 429 y `Retry-After: 900`.

## Timeouts

Los módulos administrativos y el formulario usan `shared/api.js`, con `AbortController` y timeout base de 12 segundos. Los errores de timeout muestran un mensaje reintentable y no exponen detalles técnicos.

## Flujo y pruebas

La prueba de integración automatizada es controlada y no escribe en Firestore de producción. Verifica el payload, headers Auth/App Check, timeout y respuestas HTTP. No se generaron solicitudes ficticias ni se modificaron datos reales.

## Despliegue y rollback

Sólo se despliegan las Functions modificadas. El rollback consiste en volver al commit estable anterior y desplegar selectivamente las Functions afectadas; no se requiere reset destructivo.
