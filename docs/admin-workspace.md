# Panel administrativo de Eventora Studio

El panel privado vive en `/admin/` y es el único punto visual de inicio de sesión. Usa Firebase Authentication y admite únicamente la combinación autorizada `ev3ntorastudio@gmail.com` + UID `aE9nvEOlExYjYxPfAEnoEt3XIdv2`. La contraseña nunca se guarda en el frontend.

## Módulos

- `#prospeccion`: control comercial de negocios, estados, canales, paquetes, propuestas, notas y fechas de contacto/seguimiento.
- `#proyectos`: proyectos, detalle, calendario, pagos, hosting, mantenimiento y revisiones.
- `#mensajes`: solicitudes web, filtros, estados y acciones operativas.

Los módulos existentes redirigen a `/admin/#proyectos` o `/admin/#mensajes` cuando se abren sin una sesión. Dentro del panel se cargan como vistas internas y comparten la sesión Firebase sin pedir login otra vez. El hash se conserva al actualizar y al usar los botones del navegador.

## Seguridad

La sesión visual no sustituye la autorización del servidor. Las Functions verifican el ID token con Firebase Admin SDK y validan UID/correo según el módulo. Firestore permanece con reglas deny-all y los datos administrativos se leen mediante Functions, no desde el navegador.

Mensajes conserva la autorización backend histórica de `messages@gmail.com` y `ev3ntorastudio@gmail.com`; la experiencia central de `/admin/` solo permite entrar a `ev3ntorastudio@gmail.com`.

## Prospección

La colección es `prospects`. El flujo operativo es:

`Nuevo` → `Contactado` → `Seguimiento pendiente` → `Respondió` → `Interesado` → `Cotización enviada` → `Negociación` → `Cliente`

Alternativas: `Por revisar`, `Listo para contactar`, `No interesado`, `Sin respuesta` y `Descartado`.

Los cuatro prospectos iniciales se cargan de forma idempotente al primer acceso autorizado si la colección está vacía. El seed contiene únicamente Dorcha Café, Cafetería Kala, Cafetto Ventus y Bon Cake. El primer contacto queda con canal Email, fecha `2026-10-08`, estado Contactado y seguimiento sugerido para `2026-10-11`.

## Operación diaria

1. Entrar a `/admin/`.
2. Elegir Prospección, Proyectos o Mensajes.
3. En Prospección actualizar el estado después de cada respuesta, registrar notas y mantener próxima fecha de seguimiento.
4. Cerrar sesión desde el encabezado del panel.

El panel y sus módulos usan `noindex,nofollow`; `/admin/`, `/proyectos/` y `/mensajes/` permanecen fuera del sitemap y bloqueados en `robots.txt`.
