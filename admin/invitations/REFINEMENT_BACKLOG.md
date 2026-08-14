# Invitation Builder · Refinement Backlog

Defectos y límites visuales no bloqueantes que se conservaron para la pasada
final. Fases 3 y 4 no los usan como motivo para reescribir las plantillas.

| Colección | Sección | Problema observado | Severidad | Sugerencia |
|---|---|---|---|---|
| Aloha | Identidad / bienvenida | La plantilla histórica usa una jerarquía y markup distintos; nombres y copy largos dependen de fitting específico y pueden sentirse más densos que en las colecciones modernas. | Baja | Afinar tamaños y ritmo en la pasada final a 390 px, sin cambiar el binding. |
| Todas | Copy semántico Fase 2 | El wrapper seguro normaliza posicionamiento para evitar colisiones; algunos labels muy largos pueden perder parte de la alineación ornamental original. | Baja | Revisar por colección con contenido extremo y agregar ajustes CSS por adapter. |
| Personalizada | Contenido Fase 2 | La composición base es deliberadamente simple y no tiene todavía el editor visual completo ni la personalidad de una colección terminada. | Baja / conocida | Resolver en la fase dedicada a Personalizada, no dentro de Fase 3. |
| Todas | Galería Fase 4 | El adapter conserva el lenguaje del tema mediante variantes, pero una galería con 6–20 imágenes requiere una pasada visual por colección en 390 px y desktop. | Pendiente de QA | Afinar únicamente CSS del adapter tras evidencia visual; no mover metadata al tema. |
| Todas | Audio/video Fase 4 | Los controles nativos varían entre navegador y sistema operativo. | Baja / conocida | Validar contraste y ancho en Chrome real; conservar reproducción manual y accesibilidad nativa. |

## QA visual pendiente

Playwright MCP expuso una sesión autenticada, pero el control de aprobación
rechazó cargar la implementación local de Fase 4 bajo ese origen por conflicto
con una instrucción histórica de no avanzar de fase. No se intentó eludir ese
bloqueo y no se añaden conclusiones visuales ni screenshots sin evidencia.

Con autorización renovada, la pasada debe revisar 1366×768, 1440×900,
1920×1080 y preview M 390×844, con atención a overflow horizontal, cards,
drop zones, galerías de 1 y 6 fotos, video/poster, audio, cambios de tema y
`#invitation-builder-root.scrollTop`.
