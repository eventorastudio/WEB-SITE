# Frontera privada de ejecución de purge

## Alcance C2A1

Esta implementación es local y no crea ni despliega Cloud Run. La arquitectura seleccionada es un Cloud Run **Service privado protegido por IAM**, no un Job: recibe una única operación ya autorizada y evita execution overrides de argumentos, entorno, tareas y timeout.

La frontera propuesta es `POST /v1/execute` con el body exacto `{ "operationId": "PURGE-<eventId>" }`. No admite query parameters, campos adicionales, CORS, navegador, Firebase Auth, App Check, tokens CEO, `eventId`, paths Storage, manifiestos, `force`, `skipChecks` ni `killSwitch`.

## Trust boundaries

El futuro invocador será una identidad operator con `run.invoker` únicamente sobre el servicio. La runtime identity será una service account dedicada y de mínimo privilegio. El adapter crea internamente el contexto `OPERATOR_IAM`; nunca lo acepta del body ni de headers libres. El executor vuelve a resolver el record por `operationId` y conserva la autorización CEO web previamente registrada, su binding, hashes, expiry y single-use.

La identidad web que autoriza y la identidad IAM que ejecuta son distintas. La aplicación no confía en un email declarado por el operador. La identidad real deberá quedar en IAM/Cloud Audit Logs.

## Guards y recuperación

El proyecto esperado es `eventorastudio-d6d95` y el bucket esperado `eventorastudio-d6d95.firebasestorage.app`; el código no confía solo en la ubicación del despliegue. El kill switch permanece `false`; el executor mantiene el guard emulator-only, por lo que un despliegue accidental no puede purgar hoy. La generación Storage usa `ifGenerationMatch`, y el root continúa con transición atómica y recuperación por checkpoint. Shared DEMO solo se desvincula; assets UNKNOWN/orphan bloquean.

La desconexión HTTP no cancela ni revierte la operación. El estado persistido y los checkpoints son la fuente de verdad; el operador reintenta explícitamente con el mismo `operationId`. No hay auto-retry HTTP.

## CLI local

`node scripts/refund-purge-operator.mjs OPERATION_ID` acepta solo un argumento, exige TTY y la frase exacta `EXECUTE <operationId>`. No tiene `--yes`, `-y`, `--force`, `--key-file`, bypass no interactivo ni almacenamiento de credenciales. En C2A1 termina con backend no desplegado y no hace request cloud.

## Diseño futuro de despliegue

IAM requerido: autenticación obligatoria, `allowUnauthenticated: false`, concurrency 1, max instances 1, min instances 0, sin CORS. La auditoría read-only confirmó Firestore en `northamerica-south1`, Storage en `US-EAST1`, Functions administrativas en `us-central1` y sweeper en `us-east1`. Se recomienda `northamerica-south1` para el futuro servicio porque el executor depende principalmente de lecturas/escrituras/transacciones Firestore; Storage tendrá una llamada cross-region que debe medirse antes del despliegue.

No se aplican roles. Matriz de permisos mínima de referencia para la futura runtime identity:

| Recurso | Acción del call graph | Permiso IAM | Motivo |
| --- | --- | --- | --- |
| Firestore | leer documentos/colecciones y consultar records | `datastore.entities.get`, `datastore.entities.list` | preflight, manifests, locks, verificación y resolución por `operationId` |
| Firestore | crear/actualizar records, locks y perfiles | `datastore.entities.create`, `datastore.entities.update` | checkpoints, autorización single-use, locks y detach |
| Firestore | borrar documentos y root | `datastore.entities.delete` | purga de datos operativos y root final |
| Firestore | transacciones | permisos de entidades anteriores | lock acquisition y root delete/checkpoint atómico usan transacciones |
| Storage | listar/leer metadatos de objetos | `storage.objects.list`, `storage.objects.get` | inventario y validación de generación |
| Storage | borrar objetos con generación | `storage.objects.delete` | eliminación exacta con `ifGenerationMatch` |
| Cloud Logging | escribir logs técnicos | `logging.logEntries.create` | trazas mínimas de operación/stage/result |

Los permisos deberán limitarse por recurso/prefijo cuando el producto lo permita y validarse contra el call graph real; no se otorgan roles todavía. El operador no recibe permisos directos destructivos ni impersonation por defecto; no se recomienda Owner/Editor.
