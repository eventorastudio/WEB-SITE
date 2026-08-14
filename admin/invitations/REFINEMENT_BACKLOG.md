# Invitation Builder · Refinement Backlog

Defectos y límites visuales no bloqueantes de Fase 2 que se conservaron para la
pasada final. Fase 3 no los usa como motivo para reescribir las plantillas.

| Colección | Sección | Problema observado | Severidad | Sugerencia |
|---|---|---|---|---|
| Aloha | Identidad / bienvenida | La plantilla histórica usa una jerarquía y markup distintos; nombres y copy largos dependen de fitting específico y pueden sentirse más densos que en las colecciones modernas. | Baja | Afinar tamaños y ritmo en la pasada final a 390 px, sin cambiar el binding. |
| Todas | Copy semántico Fase 2 | El wrapper seguro normaliza posicionamiento para evitar colisiones; algunos labels muy largos pueden perder parte de la alineación ornamental original. | Baja | Revisar por colección con contenido extremo y agregar ajustes CSS por adapter. |
| Personalizada | Contenido Fase 2 | La composición base es deliberadamente simple y no tiene todavía el editor visual completo ni la personalidad de una colección terminada. | Baja / conocida | Resolver en la fase dedicada a Personalizada, no dentro de Fase 3. |

## QA visual pendiente

La sesión actual no expuso una instancia del navegador integrado. Por ello no se
añaden conclusiones visuales nuevas ni screenshots sin evidencia. La pasada final
debe revisar 1366×768, 1440×900, 1920×1080 y preview M 390×844, con atención a
overflow horizontal, cards, timeline, paletas y `#invitation-builder-root.scrollTop`.
