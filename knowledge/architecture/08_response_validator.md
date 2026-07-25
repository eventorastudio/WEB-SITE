# 08 - Response Validator

## Propósito

Este documento describe el funcionamiento del Validador de Respuestas de Aura.

Su objetivo es verificar que la respuesta generada por el modelo de lenguaje cumpla con las reglas de calidad, seguridad y funcionamiento definidas por el sistema antes de ser enviada al cliente.

El Response Validator no genera respuestas.

Su única responsabilidad consiste en evaluar si la respuesta puede entregarse al usuario.

---

# Objetivos

El Response Validator debe ser capaz de:

- Verificar la calidad de la respuesta.
- Detectar información no respaldada.
- Validar el cumplimiento de las reglas del sistema.
- Detectar respuestas incompletas.
- Detectar respuestas inconsistentes.
- Decidir si una respuesta puede enviarse al cliente.

---

# Ubicación dentro del Pipeline

```
Gemini
        │
        ▼
Response Validator
        │
        ▼
Tool System / Respuesta Final
```

---

# Responsabilidad

El Response Validator recibe la respuesta generada por Gemini y realiza una validación antes de que sea enviada al cliente.

Este módulo:

- No genera respuestas.
- No consulta la Base de Conocimiento.
- No modifica la memoria.
- No interpreta documentos.
- No ejecuta herramientas.

Su única responsabilidad consiste en validar el resultado producido por el modelo.

---

# Flujo

```
Recibir respuesta

↓

Validar contenido

↓

Aplicar reglas

↓

Detectar inconsistencias

↓

Aprobar o rechazar

↓

Enviar al siguiente módulo
```

---

# Reglas de Validación

Antes de entregar una respuesta, el sistema debe verificar que cumpla con diferentes criterios.

## Coherencia

La respuesta debe ser consistente con la conversación.

No debe contradecir información previamente conocida.

---

## Información Respaldada

Toda información relacionada con Eventora Studio debe estar respaldada por la Base de Conocimiento.

El modelo nunca debe responder utilizando conocimiento no verificado.

---

## Completitud

La respuesta debe atender la solicitud realizada por el cliente.

Las respuestas incompletas deberán marcarse como inválidas.

---

## Consistencia

La información presentada debe mantener coherencia entre todos sus elementos.

No deben existir contradicciones internas.

---

## Claridad

La respuesta debe ser comprensible para el cliente.

Debe evitar ambigüedades innecesarias.

---

## Seguridad

La respuesta debe cumplir con las políticas de seguridad y funcionamiento definidas para Aura.

---

# Resultado de la Validación

Después de aplicar las reglas, el Response Validator determina uno de los siguientes resultados.

## Respuesta Aprobada

La respuesta cumple con todas las validaciones y puede continuar hacia el siguiente módulo.

---

## Respuesta Rechazada

La respuesta incumple una o más reglas de validación.

En este caso, el sistema podrá:

- Solicitar una nueva generación.
- Ejecutar una herramienta.
- Aplicar otra estrategia definida por la arquitectura.

La decisión específica pertenece al flujo general del sistema y no al Response Validator.

---

# Ejemplos

## Respuesta válida

Cliente

```
¿Qué métodos de pago aceptan?
```

Respuesta

```
Aceptamos transferencia bancaria, tarjeta y los métodos de pago especificados en nuestra información oficial.
```

La respuesta está respaldada por la Base de Conocimiento.

---

## Respuesta inválida

Cliente

```
¿Qué métodos de pago aceptan?
```

Respuesta

```
Aceptamos criptomonedas.
```

Si esa información no existe dentro de la Base de Conocimiento, la respuesta debe rechazarse.

---

# Información No Disponible

Cuando el modelo indique que no existe información suficiente para responder una consulta, el Response Validator podrá aprobar la respuesta siempre que esta sea consistente con la información recuperada por el Motor RAG.

Nunca debe obligarse al modelo a inventar información.

---

# Entrada

El módulo recibe:

- Respuesta generada por Gemini.
- Contexto utilizado durante la generación.

---

# Salida

El Response Validator entrega el resultado de la validación junto con la información necesaria para que el siguiente módulo continúe el flujo.

La estructura exacta de esta salida se define en:

```
09_data_models.md
```

---

# Responsabilidades

El Response Validator debe:

- Verificar coherencia.
- Verificar consistencia.
- Validar información respaldada.
- Detectar respuestas incompletas.
- Detectar respuestas inválidas.
- Aprobar o rechazar respuestas.

---

# Restricciones

El Response Validator NO debe:

- Generar respuestas.
- Reescribir respuestas.
- Consultar la Base de Conocimiento.
- Ejecutar herramientas.
- Modificar la memoria.
- Inventar información.
- Aplicar lógica de negocio.

Su función termina al emitir el resultado de la validación.

---

# Consideraciones

Una validación deficiente puede provocar:

- Información incorrecta enviada al cliente.
- Alucinaciones.
- Contradicciones.
- Pérdida de confianza.
- Comportamiento inconsistente del asistente.

Por ello, toda respuesta generada por el modelo debe pasar por este módulo antes de considerarse válida.

---

# Dependencias

## Entrada

Recibe información de:

- 07_prompt_builder.md (a través del modelo de lenguaje)

## Salida

Entrega información a:

- 09_tool_system.md

## Relación con otros documentos

Este módulo trabaja junto con:

- 06_rag_engine.md
- 07_prompt_builder.md
- 09_tool_system.md
- 09_data_models.md

---

# Estado

**Versión:** 1.0

**Estado:** En diseño