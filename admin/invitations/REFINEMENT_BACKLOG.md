# Invitation Builder · Refinement Backlog

Defectos y límites visuales no bloqueantes que se conservaron para la pasada
final. Fases 3 y 4 no los usan como motivo para reescribir las plantillas.

| Colección | Sección | Problema observado | Severidad | Sugerencia |
|---|---|---|---|---|
| Aloha | Identidad / bienvenida | La plantilla histórica usa una jerarquía y markup distintos; nombres y copy largos dependen de fitting específico y pueden sentirse más densos que en las colecciones modernas. | Baja | Afinar tamaños y ritmo en la pasada final a 390 px, sin cambiar el binding. |
| Todas | Copy semántico Fase 2 | El wrapper seguro normaliza posicionamiento para evitar colisiones; algunos labels muy largos pueden perder parte de la alineación ornamental original. | Baja | Revisar por colección con contenido extremo y agregar ajustes CSS por adapter. |
| Personalizada | Contenido Fase 2 | La composición base es deliberadamente simple y no tiene todavía el editor visual completo ni la personalidad de una colección terminada. | Baja / conocida | Resolver en la fase dedicada a Personalizada, no dentro de Fase 3. |
| Todas | Galería Fase 4 | Los selectores históricos de varias colecciones interferían con el grid y los captions; el adapter ya quedó aislado y validado con 6–20 imágenes. | Cerrada en QA | Mantener la cobertura visual móvil/desktop al modificar estilos de colección. |
| Todas | Audio/video Fase 4 | Los controles nativos varían entre navegador y sistema operativo. | Baja / conocida | Validar contraste y ancho en Chrome real; conservar reproducción manual y accesibilidad nativa. |
| Todas | Presets de preview Fase 4 | Las etiquetas M/T/D indican tamaños de referencia (por ejemplo, 390×844), pero la altura real del iframe se reduce cuando el alto disponible del Builder es menor. | Baja | Mostrar también el tamaño efectivo o permitir un modo de preview desacoplado del alto del workspace. |

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
