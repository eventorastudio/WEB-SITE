# Invitation Builder · Refinement Backlog

Defectos y límites visuales no bloqueantes que permanecen abiertos al cierre de
la Fase 8.6. No bloquean el cierre del Builder v1 ni justifican reescribir las
plantillas.

| Colección | Sección | Problema observado | Severidad | Sugerencia |
|---|---|---|---|---|
| Aloha | Identidad / bienvenida | La plantilla histórica usa una jerarquía y markup distintos; nombres y copy largos dependen de fitting específico y pueden sentirse más densos que en las colecciones modernas. | Baja | Afinar tamaños y ritmo en la pasada final a 390 px, sin cambiar el binding. |
| Todas | Copy semántico Fase 2 | El wrapper seguro normaliza posicionamiento para evitar colisiones; algunos labels muy largos pueden perder parte de la alineación ornamental original. | Baja | Revisar por colección con contenido extremo y agregar ajustes CSS por adapter. |
| Personalizada | Contenido Fase 2 | La composición base es deliberadamente simple y no tiene todavía el editor visual completo ni la personalidad de una colección terminada. El tema está oculto del selector para nuevas invitaciones y se conserva compatible con drafts existentes. | Baja / conocida | Resolver en una fase dedicada a Personalizada. |
| Todas | Galería Fase 4 | Los selectores históricos de varias colecciones interferían con el grid y los captions; el adapter ya quedó aislado y validado con 6–20 imágenes. | Cerrada en QA | Mantener la cobertura visual móvil/desktop al modificar estilos de colección. |
| Todas | Audio/video Fase 4 | Los controles nativos varían entre navegador y sistema operativo. | Baja / conocida | Validar contraste y ancho en Chrome real; conservar reproducción manual y accesibilidad nativa. |
| Todas | Presets de preview Fase 4 | Las etiquetas M/T/D indican tamaños de referencia (por ejemplo, 390×844), pero la altura real del iframe se reduce cuando el alto disponible del Builder es menor. | Baja | Mostrar también el tamaño efectivo o permitir un modo de preview desacoplado del alto del workspace. |
| Infraestructura | Huérfanos Fase 4.5 | Cerrar la pestaña entre upload completo y write de metadata, o perder red durante la compensación, puede dejar un objeto sin referencia. | Media / conocida | Añadir limpieza backend con período de gracia cuando se habiliten Functions y publicación. |
| Infraestructura | Delete Fase 4.5 | Storage delete exitoso seguido de fallo Firestore deja metadata apuntando a un objeto ausente. | Media / conocida | Registrar el incidente y añadir reconciliación backend; el cliente ya muestra el error sin fingir éxito. |
| Infraestructura | URLs públicas futuras | Las download URLs con token no equivalen a autorización por usuario. | Bloqueante para publicación | Definir la lectura pública durante publicación sin abrir indiscriminadamente el bucket. |

## Estado de cierre Fase 8.6

El Builder v1 conserva drafts persistentes, publicación versionada, proyección
pública, personalización opcional mediante RSVP Access y configuración RSVP.
Las protecciones contra cambios sin guardar y la validación previa a publicar
están integradas en la UX existente. Las once colecciones Prestige permanecen
visibles; Personalizada queda temporalmente fuera del selector, sin eliminar su
runtime ni compatibilidad de lectura.

El bloqueo histórico por feature flag ya no aplica: el flag de cliente está
activo. El QA remoto sigue requiriendo despliegue y verificación de Rules,
claims, App Check y disponibilidad real del proyecto.

## QA visual ejecutado

La pasada autenticada con Playwright MCP se completó en Chrome real sobre
EVT-0001. Se revisaron 1366×768, 1440×900, 1920×1080 y previews exactos
390×844, 768×1024 y 1440×900, incluyendo las once colecciones, galería de
6 y 20 imágenes, video/poster, audio, cambios de tema, restricciones por
paquete y `#invitation-builder-root.scrollTop`.

La galería quedó aislada de los selectores históricos de cada tema y validada
sin overflow horizontal. El único refinamiento visual abierto de esta pasada
es la diferencia entre el tamaño nominal y el tamaño efectivo del preset cuando
el workspace no dispone de altura suficiente.

## QA Fase 4.5

La interfaz habilitada y deshabilitada del Media Manager se validó con JSDOM y
service mock, incluida la acción separada `Guardar multimedia` y el tratamiento
textual de alt/caption maliciosos. En la sesión de Fase 4.5 el runtime de Browser
no expuso ninguna instancia disponible, por lo que no se generaron screenshots
Playwright nuevos ni se afirma una prueba visual de reload cloud. El QA remoto
continúa bloqueado además por el feature flag y por Rules no desplegadas.
