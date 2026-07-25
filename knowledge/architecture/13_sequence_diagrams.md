# 13 - Sequence Diagrams

## Propósito

Este documento describe el comportamiento dinámico de Aura mediante diagramas de secuencia.

Mientras los documentos anteriores definen la arquitectura, responsabilidades y modelos de datos, este documento muestra cómo colaboran los componentes durante la ejecución de distintos escenarios.

Los diagramas aquí presentados representan el comportamiento esperado del sistema y sirven como referencia para la implementación.

---

# Objetivos

Este documento debe:

- Mostrar el flujo completo de ejecución.
- Ilustrar la interacción entre módulos.
- Facilitar la comprensión de la arquitectura.
- Servir como referencia durante el desarrollo.
- Reducir ambigüedades sobre el orden de ejecución.

---

# Convenciones

Todos los diagramas utilizan la sintaxis Mermaid.

Los participantes mantienen siempre el mismo nombre en todos los escenarios.

## Participantes

| Participante | Descripción |
|-------------|-------------|
| Client | Usuario final. |
| Frontend | Interfaz de usuario. |
| Backend | Orquestador principal de Aura. |
| Intent Detection | Detector de intención. |
| Entity Extraction | Extractor de entidades. |
| Memory | Sistema de memoria. |
| RAG | Motor de recuperación de información. |
| Prompt Builder | Constructor del prompt. |
| LLM | Modelo de Lenguaje (Gemini). |
| Validator | Response Validator. |
| Tool System | Sistema de herramientas. |

---

# Flujo General

```mermaid
sequenceDiagram

participant C as Client
participant F as Frontend
participant B as Backend
participant I as Intent Detection
participant E as Entity Extraction
participant M as Memory
participant R as RAG
participant P as Prompt Builder
participant G as LLM
participant V as Validator

C->>F: Envía mensaje

F->>B: Solicitud

B->>I: Detectar intención

I-->>B: IntentResult

B->>E: Extraer entidades

E-->>B: EntityResult

B->>M: Recuperar contexto

M-->>B: ConversationMemory

B->>R: Recuperar conocimiento

R-->>B: RetrievalResult

B->>P: Construir Prompt

P-->>G: Prompt

G-->>B: Respuesta

B->>V: Validar respuesta

V-->>B: ValidationResult

B-->>F: Respuesta final

F-->>C: Mostrar respuesta
```

---

# Escenario 1 - Nuevo Cliente

```mermaid
sequenceDiagram

participant Client
participant Backend
participant Memory

Client->>Backend: Primer mensaje

Backend->>Memory: Buscar perfil

Memory-->>Backend: No existe

Backend->>Memory: Crear perfil

Memory-->>Backend: Perfil creado

Backend-->>Client: Continuar conversación
```

---

# Escenario 2 - Cliente Existente

```mermaid
sequenceDiagram

participant Client
participant Backend
participant Memory

Client->>Backend: Nuevo mensaje

Backend->>Memory: Recuperar perfil

Memory-->>Backend: Perfil encontrado

Backend-->>Client: Continuar conversación
```

---

# Escenario 3 - Consulta de Información

```mermaid
sequenceDiagram

participant Client
participant Backend
participant RAG
participant LLM

Client->>Backend: Pregunta

Backend->>RAG: Buscar información

RAG-->>Backend: Documentos

Backend->>LLM: Prompt

LLM-->>Backend: Respuesta

Backend-->>Client: Respuesta
```

---

# Escenario 4 - Recomendación de Paquete

```mermaid
sequenceDiagram

participant Client
participant Backend
participant Intent Detection
participant Entity Extraction
participant RAG
participant LLM

Client->>Backend: Solicita recomendación

Backend->>Intent Detection: Detectar intención

Intent Detection-->>Backend: PACKAGE_RECOMMENDATION

Backend->>Entity Extraction: Extraer datos

Entity Extraction-->>Backend: EntityResult

Backend->>RAG: Buscar paquetes

RAG-->>Backend: Información

Backend->>LLM: Prompt

LLM-->>Backend: Recomendación

Backend-->>Client: Respuesta
```

---

# Escenario 5 - Uso de Herramienta

```mermaid
sequenceDiagram

participant Client
participant Backend
participant Validator
participant Tool System

Client->>Backend: Solicitud

Backend->>Validator: Validar necesidad

Validator-->>Backend: CALL_TOOL

Backend->>Tool System: Ejecutar herramienta

Tool System-->>Backend: Resultado

Backend-->>Client: Respuesta
```

---

# Escenario 6 - Error de Herramienta

```mermaid
sequenceDiagram

participant Client
participant Backend
participant Tool System

Client->>Backend: Solicitud

Backend->>Tool System: Ejecutar

Tool System-->>Backend: Error

Backend-->>Client: Mensaje controlado
```

---

# Escenario 7 - Actualización de Memoria

```mermaid
sequenceDiagram

participant Backend
participant Memory

Backend->>Memory: Actualizar contexto

Memory-->>Backend: Actualización completada
```

---

# Escenario 8 - Información No Disponible

```mermaid
sequenceDiagram

participant Client
participant Backend
participant RAG

Client->>Backend: Consulta

Backend->>RAG: Buscar información

RAG-->>Backend: Sin resultados

Backend-->>Client: Informar indisponibilidad
```

---

# Escenario 9 - Validación Rechazada

```mermaid
sequenceDiagram

participant Backend
participant Validator
participant LLM

Backend->>LLM: Generar respuesta

LLM-->>Backend: Respuesta

Backend->>Validator: Validar

Validator-->>Backend: REGENERATE

Backend->>LLM: Regenerar respuesta

LLM-->>Backend: Nueva respuesta
```

---

# Escenario 10 - Fin de Conversación

```mermaid
sequenceDiagram

participant Client
participant Backend
participant Memory

Client->>Backend: Despedida

Backend->>Memory: Guardar contexto

Memory-->>Backend: Confirmación

Backend-->>Client: Cierre de conversación
```

---

# Principios

Todos los diagramas respetan los siguientes principios:

- El Backend actúa como orquestador.
- Los módulos nunca se comunican directamente entre sí salvo a través del Backend.
- El LLM nunca consulta directamente la Base de Conocimiento.
- El RAG nunca genera respuestas.
- El Validator nunca modifica respuestas.
- El Tool System únicamente ejecuta herramientas autorizadas.
- Memory nunca reemplaza la Base de Conocimiento.
- Cada componente mantiene una única responsabilidad.

---

# Relación con otros documentos

Este documento complementa:

- 01_system_overview.md
- 02_request_pipeline.md
- 03_intent_detection.md
- 04_entity_extraction.md
- 05_memory_system.md
- 06_rag_engine.md
- 07_prompt_builder.md
- 08_response_validator.md
- 09_tool_system.md
- 10_data_models.md
- 11_security.md
- 12_deployment.md

---

# Estado

**Versión:** 1.0

**Estado:** En diseño 