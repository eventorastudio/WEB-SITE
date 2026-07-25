# 07 - Prompt Builder

## Propósito

Este documento describe el funcionamiento del Constructor de Prompts (Prompt Builder) de Aura.

Su objetivo es construir el prompt final que será enviado al modelo de lenguaje utilizando toda la información recopilada por los módulos anteriores.

El Prompt Builder no genera respuestas.

Su única responsabilidad consiste en organizar el contexto de forma clara, consistente y eficiente.

---

# Objetivos

El Prompt Builder debe ser capaz de:

- Construir un único prompt para el modelo.
- Integrar información proveniente de todos los módulos anteriores.
- Mantener una estructura consistente.
- Reducir información redundante.
- Optimizar el consumo de tokens.
- Proporcionar suficiente contexto para generar respuestas precisas.

---

# Ubicación dentro del Pipeline

```
Motor RAG
        │
        ▼
Prompt Builder
        │
        ▼
Gemini
```

---

# Responsabilidad

El Prompt Builder recibe toda la información producida por los módulos anteriores y construye el contexto que utilizará Gemini.

Este módulo:

- No consulta la Base de Conocimiento.
- No interpreta documentos.
- No genera respuestas.
- No modifica la memoria.
- No ejecuta herramientas.
- No toma decisiones de negocio.

Su responsabilidad termina cuando entrega el prompt final al modelo de lenguaje.

---

# Flujo

```
Recibir contexto

↓

Recibir documentos

↓

Organizar información

↓

Eliminar redundancias

↓

Construir Prompt

↓

Enviar a Gemini
```

---

# Componentes del Prompt

El Prompt final puede estar compuesto por diferentes secciones.

## Instrucciones del Sistema

Define el comportamiento general de Aura.

Ejemplos

- Rol del asistente.
- Objetivos.
- Restricciones.
- Reglas de comportamiento.
- Estilo de comunicación.

---

## Contexto Conversacional

Información proveniente de la Memoria Conversacional.

Ejemplo

```
Cliente

Luis

Evento

Boda

Fecha

14 de diciembre

Invitados

180
```

Este contexto permite que el modelo mantenga continuidad durante toda la conversación.

---

## Información Recuperada

Documentos obtenidos por el Motor RAG.

Ejemplos

- Paquetes.
- Servicios.
- Métodos de pago.
- Políticas.
- Procedimientos.
- Preguntas frecuentes.

Esta información constituye la fuente oficial para responder al cliente.

---

## Consulta del Cliente

Corresponde al mensaje más reciente enviado por el usuario.

Ejemplo

```
¿Cuánto cuesta el paquete Premium?
```

Siempre debe incluirse al final del contexto.

---

# Organización del Prompt

El Prompt Builder organiza la información siguiendo un orden consistente.

```
Instrucciones del Sistema

↓

Contexto Conversacional

↓

Información Recuperada

↓

Mensaje del Cliente
```

Esta estructura facilita que el modelo comprenda primero las reglas, después el contexto y finalmente la solicitud del usuario.

---

# Optimización

Antes de construir el Prompt, el sistema elimina información innecesaria.

Ejemplos

- Datos duplicados.
- Información irrelevante.
- Contexto obsoleto.
- Documentos repetidos.

El objetivo es reducir el consumo de tokens y mejorar la precisión de la respuesta.

---

# Consistencia

Todos los prompts generados por Aura deben seguir la misma estructura.

La organización nunca debe depender del tipo de consulta.

Esto garantiza un comportamiento uniforme del modelo.

---

# Límite de Contexto

Si la información disponible supera el límite permitido por el modelo de lenguaje, el Prompt Builder deberá priorizar el contenido más relevante.

La prioridad general será:

1. Instrucciones del Sistema.
2. Consulta actual del cliente.
3. Contexto Conversacional.
4. Información recuperada por el Motor RAG.

El objetivo es preservar la información más importante cuando exista una limitación de contexto.

---

# Entrada

El módulo recibe:

- Contexto de la conversación.
- Documentos recuperados por el Motor RAG.
- Mensaje actual del cliente.

---

# Salida

El Prompt Builder entrega un único Prompt listo para ser enviado al modelo de lenguaje.

La estructura exacta del Prompt y de sus componentes se define en:

```
09_data_models.md
```

---

# Responsabilidades

El Prompt Builder debe:

- Organizar el contexto.
- Integrar información de múltiples módulos.
- Eliminar redundancias.
- Optimizar el uso de tokens.
- Construir un Prompt consistente.
- Entregar el Prompt al modelo de lenguaje.

---

# Restricciones

El Prompt Builder NO debe:

- Generar respuestas.
- Consultar la Base de Conocimiento.
- Interpretar documentos.
- Ejecutar herramientas.
- Actualizar memoria.
- Modificar información recuperada.
- Aplicar lógica de negocio.

Toda la información utilizada debe provenir de módulos anteriores.

---

# Consideraciones

Un Prompt mal construido puede provocar:

- Respuestas incorrectas.
- Pérdida de contexto.
- Mayor consumo de tokens.
- Incremento de alucinaciones.
- Comportamiento inconsistente del modelo.

Por ello, el Prompt Builder debe limitarse a organizar información sin modificar su significado.

---

# Dependencias

## Entrada

Recibe información de:

- 06_rag_engine.md

## Salida

Entrega información a:

- 08_response_validator.md (a través del modelo de lenguaje)

## Relación con otros documentos

Este módulo trabaja junto con:

- 05_memory_system.md
- 06_rag_engine.md
- 08_response_validator.md
- 09_data_models.md

---

# Estado

**Versión:** 1.0

**Estado:** En diseño