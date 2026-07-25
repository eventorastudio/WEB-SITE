# 06 - RAG Engine

## Propósito

Este documento describe el funcionamiento del Motor RAG (Retrieval-Augmented Generation) de Aura.

Su objetivo es recuperar la información más relevante desde la Base de Conocimiento de Eventora Studio para complementar el contexto antes de generar una respuesta.

El Motor RAG nunca genera respuestas.

Su única responsabilidad consiste en localizar y entregar información confiable.

---

# Objetivos

El Motor RAG debe ser capaz de:

- Consultar la Base de Conocimiento.
- Recuperar únicamente los documentos relevantes.
- Reducir información innecesaria.
- Priorizar documentos relacionados con la intención del cliente.
- Complementar el contexto proporcionado por la Memoria Conversacional.
- Entregar información preparada para el Prompt Builder.

---

# Ubicación dentro del Pipeline

```
Memoria Conversacional
        │
        ▼
Motor RAG
        │
        ▼
Prompt Builder
```

---

# Responsabilidad

El Motor RAG recibe el contexto consolidado de la conversación y realiza una búsqueda sobre la Base de Conocimiento.

Su responsabilidad termina cuando entrega los documentos más relevantes.

Este módulo:

- No interpreta políticas.
- No responde preguntas.
- No genera texto.
- No modifica documentos.
- No toma decisiones comerciales.

Toda generación de respuestas corresponde al modelo de lenguaje.

---

# Flujo

```
Recibir contexto

↓

Construir consulta

↓

Buscar documentos

↓

Evaluar relevancia

↓

Eliminar resultados irrelevantes

↓

Ordenar resultados

↓

Enviar documentos al Prompt Builder
```

---

# Base de Conocimiento

El Motor RAG consulta exclusivamente la Base de Conocimiento oficial de Eventora Studio.

Esta base puede contener información como:

- Paquetes.
- Servicios.
- Políticas.
- Métodos de pago.
- Preguntas frecuentes.
- Procedimientos internos.
- Información comercial.
- Restricciones.
- Configuración de productos.

Toda la información utilizada para responder al cliente debe provenir de esta fuente.

---

# Construcción de la Consulta

La búsqueda no depende únicamente del mensaje del cliente.

El Motor RAG utiliza información proveniente de:

- Intención detectada.
- Entidades extraídas.
- Memoria Conversacional.

Ejemplo

Cliente

```
¿Cuánto cuesta?
```

Memoria

```
Evento:
Boda

Invitados:
180

Paquete:
Premium
```

Consulta generada

```
Precio del paquete Premium para boda.
```

El objetivo es construir consultas más precisas que las realizadas únicamente con el mensaje original.

---

# Recuperación de Documentos

Una consulta puede devolver múltiples documentos.

Ejemplo

```
Documento 1

Paquete Premium
```

```
Documento 2

Métodos de Pago
```

```
Documento 3

Proceso de contratación
```

No todos los documentos recuperados serán utilizados.

---

# Evaluación de Relevancia

Después de recuperar los documentos, el Motor RAG determina cuáles aportan información útil.

Los documentos irrelevantes son descartados antes de continuar con el flujo.

El objetivo es reducir ruido y optimizar el contexto enviado al modelo de lenguaje.

---

# Priorización

Los documentos seleccionados son ordenados según su relevancia para la consulta.

La información más importante aparecerá primero.

Este orden permite que el Prompt Builder construya un contexto más eficiente y reduzca el consumo de tokens.

---

# Sin Resultados

Si la Base de Conocimiento no contiene información suficiente para responder una consulta, el Motor RAG devolverá un resultado vacío.

Nunca debe inventar documentos ni generar información inexistente.

La decisión sobre cómo responder ante esta situación corresponde a módulos posteriores.

---

# Fuente Única de Verdad

La Base de Conocimiento constituye la única fuente oficial de información para Aura.

La Memoria Conversacional únicamente proporciona contexto.

El modelo de lenguaje nunca debe utilizar conocimiento propio para reemplazar la información oficial de la Base de Conocimiento.

---

# Entrada

El módulo recibe:

- Contexto consolidado de la conversación.
- Información de la Memoria Conversacional.

---

# Salida

El Motor RAG devuelve una colección de documentos ordenados por relevancia junto con la información necesaria para construir el Prompt.

La estructura exacta del resultado se define en:

```
09_data_models.md
```

---

# Responsabilidades

El Motor RAG debe:

- Construir consultas.
- Buscar documentos.
- Recuperar información.
- Evaluar relevancia.
- Eliminar resultados irrelevantes.
- Priorizar documentos.
- Entregar contexto al Prompt Builder.

---

# Restricciones

El Motor RAG NO debe:

- Generar respuestas.
- Interpretar políticas.
- Ejecutar herramientas.
- Modificar documentos.
- Actualizar memoria.
- Inventar información.
- Responder utilizando conocimiento fuera de la Base de Conocimiento.

Toda respuesta debe fundamentarse exclusivamente en la información recuperada.

---

# Consideraciones

Una recuperación deficiente puede provocar:

- Respuestas incompletas.
- Información incorrecta.
- Recuperación de documentos irrelevantes.
- Mayor consumo de tokens.
- Incremento en el riesgo de alucinaciones.

Por ello, el Motor RAG debe priorizar siempre la calidad de la recuperación sobre la cantidad de documentos obtenidos.

---

# Dependencias

## Entrada

Recibe información de:

- 05_memory_system.md

## Salida

Entrega información a:

- 07_prompt_builder.md

## Relación con otros documentos

Este módulo trabaja junto con:

- 05_memory_system.md
- 07_prompt_builder.md
- 09_data_models.md

---

# Estado

**Versión:** 1.0

**Estado:** En diseño