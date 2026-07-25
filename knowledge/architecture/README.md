# Architecture

## Propósito

Esta carpeta documenta la arquitectura completa de Aura, el asistente inteligente de Eventora Studio.

Su objetivo es definir cómo funciona internamente el sistema antes de implementar el código, permitiendo que el desarrollo sea consistente, escalable y fácil de mantener.

La arquitectura establece el flujo completo de una conversación, desde que un cliente envía un mensaje hasta que Aura genera una respuesta basada en la base de conocimiento.

---

# Objetivos

- Definir la arquitectura completa del sistema.
- Reducir al mínimo las alucinaciones del modelo.
- Garantizar el uso correcto de la base de conocimiento.
- Mantener una separación clara entre lógica, datos y modelo de IA.
- Facilitar futuras mejoras sin modificar toda la aplicación.

---

# Filosofía

Aura no responde únicamente usando un modelo de lenguaje.

Cada respuesta es el resultado de un proceso compuesto por varios módulos especializados.

Antes de generar una respuesta, Aura:

1. Analiza la intención del cliente.
2. Extrae la información relevante del mensaje.
3. Consulta la memoria de la conversación.
4. Recupera únicamente los documentos necesarios mediante RAG.
5. Construye un contexto controlado para el modelo.
6. Genera una respuesta.
7. Valida que la respuesta sea consistente con la base de conocimiento.
8. Guarda la información relevante para futuras interacciones.

Este enfoque permite obtener respuestas más precisas, consistentes y fáciles de mantener.

---

# Arquitectura General

```
Cliente
    │
    ▼
Preprocesamiento
    │
    ▼
Detector de intención
    │
    ▼
Extractor de entidades
    │
    ▼
Memoria conversacional
    │
    ▼
Motor RAG
    │
    ▼
Constructor de Prompt
    │
    ▼
Gemini
    │
    ▼
Validador de Respuesta
    │
    ▼
Herramientas (Tool Calling)
    │
    ▼
Respuesta final
```

---

# Estructura de la carpeta

```
architecture/

README.md

01_system_overview.md
Descripción general del sistema.

02_request_pipeline.md
Flujo completo de una petición.

03_intent_detection.md
Detección y clasificación de intenciones.

04_memory_system.md
Funcionamiento de la memoria conversacional.

05_rag_engine.md
Motor de recuperación de documentos.

06_prompt_builder.md
Construcción dinámica del contexto enviado al modelo.

07_response_validator.md
Validación de respuestas antes de enviarlas al cliente.

08_tool_system.md
Integración con herramientas externas.

09_data_models.md
Modelos de datos utilizados por Aura.

10_deployment.md
Arquitectura de producción y despliegue.
```

---

# Principios de diseño

La arquitectura de Aura sigue los siguientes principios:

- Una única responsabilidad por módulo.
- Separación entre conocimiento y razonamiento.
- La base de conocimiento es la fuente principal de verdad.
- Nunca inventar información.
- Priorizar documentos según las reglas establecidas.
- Mantener el contexto de la conversación.
- Permitir la incorporación de nuevas herramientas sin modificar el núcleo del sistema.

---

# Orden de lectura recomendado

Para comprender completamente la arquitectura se recomienda leer los documentos en el siguiente orden:

1. 01_system_overview.md
2. 02_request_pipeline.md
3. 03_intent_detection.md
4. 04_memory_system.md
5. 05_rag_engine.md
6. 06_prompt_builder.md
7. 07_response_validator.md
8. 08_tool_system.md
9. 09_data_models.md
10. 10_deployment.md

---

# Estado

Versión: 1.0

Estado: En diseño