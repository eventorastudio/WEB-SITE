# 10 - Data Models

## Propósito

Este documento define los contratos de datos utilizados por todos los módulos de Aura.

Su objetivo es establecer una única fuente de verdad para las estructuras de datos intercambiadas entre los componentes del sistema.

Todos los documentos de la arquitectura hacen referencia a este archivo cuando describen entradas y salidas.

Este documento no contiene lógica de negocio.

Únicamente define los modelos de datos que permiten la comunicación entre los componentes de Aura.

---

# Objetivos

Este documento tiene como finalidad:

- Definir todos los modelos de datos del sistema.
- Estandarizar los contratos entre módulos.
- Eliminar duplicación de estructuras.
- Facilitar la implementación.
- Reducir el acoplamiento entre componentes.
- Permitir la evolución de la arquitectura sin romper contratos existentes.

---

# Principios de Diseño

Todos los modelos definidos en este documento siguen los siguientes principios.

## Contratos Estables

Una vez publicado un modelo, los cambios deberán ser compatibles con versiones anteriores siempre que sea posible.

---

## Responsabilidad Única

Cada modelo representa un único concepto del dominio.

Los modelos no deben combinar responsabilidades distintas.

---

## Extensibilidad

Los modelos permiten incorporar información adicional mediante propiedades opcionales cuando sea necesario.

---

## Independencia Tecnológica

Los contratos definidos en este documento son independientes del lenguaje de programación, framework o proveedor de infraestructura utilizado durante la implementación.

---

## Consistencia

Todos los modelos utilizan las mismas convenciones de nombres, tipos y organización.

---

# Convenciones

## Nomenclatura

| Elemento | Convención |
|----------|------------|
| Interfaces | PascalCase |
| Enumeraciones | PascalCase |
| Tipos | PascalCase |
| Propiedades | camelCase |
| Constantes | UPPER_SNAKE_CASE |

---

## Identificadores

Todos los objetos persistentes deberán disponer de un identificador único.

```ts
id: UUID
```

---

## Fechas

Todas las fechas se representan utilizando formato ISO-8601.

```ts
Timestamp
```

---

## Metadatos

Los modelos podrán incluir información adicional mediante la propiedad:

```ts
metadata?: Metadata
```

Los metadatos nunca deberán modificar el comportamiento esperado del modelo.

---

# Tipos Base

Los siguientes tipos son reutilizados por toda la arquitectura.

```ts
type UUID = string;

type Timestamp = string;

type ISODate = string;

type URI = string;

type Version = string;
```

---

# Tipos Genéricos

## Metadata

Información adicional asociada a cualquier modelo.

```ts
type Metadata = Record<string, unknown>;
```

---

## JsonValue

Representa cualquier valor válido dentro de un objeto JSON.

```ts
type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonObject
    | JsonArray;
```

---

## JsonObject

```ts
interface JsonObject {
    [key: string]: JsonValue;
}
```

---

## JsonArray

```ts
type JsonArray = JsonValue[];
```

---

# Intent Detection Models

Los siguientes modelos representan la salida generada por el módulo de Detección de Intenciones.

---

## IntentCategory

Categorías de intención soportadas por Aura.

```ts
enum IntentCategory {

    WELCOME,

    NEW_CLIENT,

    GENERAL_INFORMATION,

    PACKAGE_INFORMATION,

    PACKAGE_RECOMMENDATION,

    PAYMENT_INFORMATION,

    POLICY_INFORMATION,

    PROCESS_INFORMATION,

    CHANGE_REQUEST,

    PROJECT_STATUS,

    CONFIRMATION,

    CANCELLATION,

    GOODBYE,

    GENERAL_CONVERSATION,

    OUT_OF_SCOPE,

    UNKNOWN

}
```

---

## Intent

Representa una intención detectada.

```ts
interface Intent {

    id: UUID;

    intent: IntentCategory;

    confidence: number;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador de la intención. |
| intent | IntentCategory | Categoría detectada. |
| confidence | number | Valor entre 0.0 y 1.0. |
| metadata | Metadata | Información adicional del proceso de detección. |

---

## IntentResult

Representa el resultado completo del Detector de Intención.

```ts
interface IntentResult {

    primaryIntent: Intent;

    secondaryIntents: Intent[];

    detectedAt: Timestamp;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| primaryIntent | Intent | Intención principal. |
| secondaryIntents | Intent[] | Intenciones secundarias. |
| detectedAt | Timestamp | Momento de la detección. |

---

# Entity Extraction Models

Los siguientes modelos representan la información estructurada obtenida del mensaje del usuario.

---

## EntityType

Tipos de entidades reconocidos por Aura.

```ts
enum EntityType {

    PERSON,

    EVENT,

    DATE,

    TIME,

    LOCATION,

    PACKAGE,

    PAYMENT_METHOD,

    PROJECT_STATUS,

    PHONE_NUMBER,

    EMAIL,

    URL,

    UNKNOWN

}
```

---

## EntitySource

Origen desde donde fue obtenida una entidad.

```ts
enum EntitySource {

    USER_MESSAGE,

    MEMORY,

    KNOWLEDGE_BASE,

    TOOL,

    SYSTEM

}
```

---

## Entity

Representa una entidad detectada.

```ts
interface Entity {

    id: UUID;

    type: EntityType;

    value: string;

    normalizedValue: string;

    confidence: number;

    source: EntitySource;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador de la entidad. |
| type | EntityType | Tipo detectado. |
| value | string | Valor original encontrado en el mensaje. |
| normalizedValue | string | Valor normalizado utilizado internamente. |
| confidence | number | Nivel de confianza entre 0.0 y 1.0. |
| source | EntitySource | Origen de la entidad. |
| metadata | Metadata | Información adicional. |

---

## EntityResult

Representa el conjunto de entidades detectadas.

```ts
interface EntityResult {

    entities: Entity[];

    detectedAt: Timestamp;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| entities | Entity[] | Entidades encontradas. |
| detectedAt | Timestamp | Momento de la extracción. |

---

# Relaciones

```
IntentResult
│
├── Intent
│
└── EntityResult
    │
    └── Entity
```

---

# Notas Arquitectónicas

- Todos los niveles de confianza (`confidence`) utilizan un rango entre **0.0** y **1.0**.
- Las entidades siempre conservan el valor original (`value`) y una versión normalizada (`normalizedValue`).
- Ningún modelo contiene lógica de negocio.
- Todos los modelos están preparados para extenderse mediante `metadata`.
- Los modelos son independientes del lenguaje de implementación.

---

# Próxima Sección

La siguiente parte de este documento definirá los modelos correspondientes a:

- Memory System
- Conversation State
- Customer Profile
- Memory Updates
- Memory Snapshots
- RAG Engine
- Knowledge Documents
- Retrieval Results

# Memory Models

Los siguientes modelos representan la información persistente utilizada por Aura para mantener el contexto entre interacciones.

La memoria permite que el sistema recuerde información relevante del cliente sin reemplazar la Base de Conocimiento.

---

## MemoryScope

Define el alcance de una memoria.

```ts
enum MemoryScope {

    CONVERSATION,

    CUSTOMER,

    SYSTEM

}
```

---

## MemoryEntry

Representa una unidad individual de información almacenada.

```ts
interface MemoryEntry {

    id: UUID;

    key: string;

    value: JsonValue;

    scope: MemoryScope;

    createdAt: Timestamp;

    updatedAt: Timestamp;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador único. |
| key | string | Nombre de la memoria. |
| value | JsonValue | Valor almacenado. |
| scope | MemoryScope | Alcance de la memoria. |
| createdAt | Timestamp | Fecha de creación. |
| updatedAt | Timestamp | Última actualización. |
| metadata | Metadata | Información adicional. |

---

## CustomerProfile

Representa la información persistente asociada a un cliente.

```ts
interface CustomerProfile {

    id: UUID;

    customerId: UUID;

    memories: MemoryEntry[];

    createdAt: Timestamp;

    updatedAt: Timestamp;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador del perfil. |
| customerId | UUID | Identificador del cliente. |
| memories | MemoryEntry[] | Memorias asociadas. |
| createdAt | Timestamp | Fecha de creación. |
| updatedAt | Timestamp | Última modificación. |
| metadata | Metadata | Información adicional. |

---

## ConversationState

Representa el estado actual de una conversación.

```ts
interface ConversationState {

    id: UUID;

    conversationId: UUID;

    currentIntent?: Intent;

    entities: Entity[];

    lastInteractionAt: Timestamp;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador del estado. |
| conversationId | UUID | Conversación asociada. |
| currentIntent | Intent | Última intención detectada. |
| entities | Entity[] | Entidades activas. |
| lastInteractionAt | Timestamp | Última interacción registrada. |
| metadata | Metadata | Información adicional. |

---

## ConversationMemory

Representa toda la memoria utilizada durante una conversación.

```ts
interface ConversationMemory {

    id: UUID;

    conversationId: UUID;

    entries: MemoryEntry[];

    state: ConversationState;

    version: number;

    createdAt: Timestamp;

    updatedAt: Timestamp;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador de la memoria. |
| conversationId | UUID | Conversación asociada. |
| entries | MemoryEntry[] | Memorias almacenadas. |
| state | ConversationState | Estado actual. |
| version | number | Versión del estado de memoria. |
| createdAt | Timestamp | Fecha de creación. |
| updatedAt | Timestamp | Última actualización. |
| metadata | Metadata | Información adicional. |

---

## MemoryOperation

Operaciones permitidas sobre una memoria.

```ts
enum MemoryOperation {

    CREATE,

    UPDATE,

    DELETE

}
```

---

## MemoryUpdate

Representa una modificación realizada sobre la memoria.

```ts
interface MemoryUpdate {

    id: UUID;

    operation: MemoryOperation;

    entry: MemoryEntry;

    performedAt: Timestamp;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador de la operación. |
| operation | MemoryOperation | Tipo de modificación. |
| entry | MemoryEntry | Registro afectado. |
| performedAt | Timestamp | Momento de la operación. |
| metadata | Metadata | Información adicional. |

---

## MemorySnapshot

Representa una fotografía completa de la memoria en un instante determinado.

```ts
interface MemorySnapshot {

    id: UUID;

    conversationMemory: ConversationMemory;

    capturedAt: Timestamp;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador del snapshot. |
| conversationMemory | ConversationMemory | Estado completo de la memoria. |
| capturedAt | Timestamp | Momento de captura. |
| metadata | Metadata | Información adicional. |

---

# RAG Models

Los siguientes modelos representan los contratos utilizados por el Motor RAG para recuperar información desde la Base de Conocimiento.

---

## RetrievalSource

Origen de un documento recuperado.

```ts
enum RetrievalSource {

    KNOWLEDGE_BASE,

    FAQ,

    POLICY,

    DOCUMENT,

    SYSTEM

}
```

---

## DocumentMetadata

Información descriptiva de un documento.

```ts
interface DocumentMetadata {

    title: string;

    source: RetrievalSource;

    tags: string[];

    version?: Version;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| title | string | Nombre del documento. |
| source | RetrievalSource | Origen del documento. |
| tags | string[] | Etiquetas de clasificación. |
| version | Version | Versión del documento. |
| metadata | Metadata | Información adicional. |

---

## KnowledgeChunk

Representa el fragmento mínimo indexado por el Motor RAG.

```ts
interface KnowledgeChunk {

    id: UUID;

    content: string;

    metadata: DocumentMetadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador del fragmento. |
| content | string | Texto indexado. |
| metadata | DocumentMetadata | Información descriptiva. |

---

## KnowledgeDocument

Representa un documento completo de la Base de Conocimiento.

```ts
interface KnowledgeDocument {

    id: UUID;

    chunks: KnowledgeChunk[];

    metadata: DocumentMetadata;

    createdAt: Timestamp;

    updatedAt: Timestamp;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador del documento. |
| chunks | KnowledgeChunk[] | Fragmentos indexados. |
| metadata | DocumentMetadata | Información descriptiva. |
| createdAt | Timestamp | Fecha de creación. |
| updatedAt | Timestamp | Última modificación. |

---

## RetrievedDocument

Representa un documento seleccionado por el Motor RAG.

```ts
interface RetrievedDocument {

    document: KnowledgeDocument;

    relevanceScore: number;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| document | KnowledgeDocument | Documento recuperado. |
| relevanceScore | number | Relevancia entre 0.0 y 1.0. |

---

## SearchQuery

Representa una consulta enviada al Motor RAG.

```ts
interface SearchQuery {

    id: UUID;

    query: string;

    createdAt: Timestamp;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador de la consulta. |
| query | string | Texto utilizado para la búsqueda. |
| createdAt | Timestamp | Momento de la consulta. |
| metadata | Metadata | Información adicional. |

---

## RetrievalResult

Representa el resultado completo generado por el Motor RAG.

```ts
interface RetrievalResult {

    query: SearchQuery;

    documents: RetrievedDocument[];

    retrievedAt: Timestamp;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| query | SearchQuery | Consulta realizada. |
| documents | RetrievedDocument[] | Documentos recuperados. |
| retrievedAt | Timestamp | Momento de la recuperación. |

---

# Relaciones

```
ConversationMemory
│
├── MemoryEntry
│
├── ConversationState
│   ├── Intent
│   └── Entity
│
├── MemoryUpdate
│
└── MemorySnapshot

KnowledgeDocument
│
├── KnowledgeChunk
│   └── DocumentMetadata
│
└── RetrievedDocument
    └── RetrievalResult
```

---

# Notas Arquitectónicas

- `ConversationMemory` representa el estado completo de una conversación.
- `CustomerProfile` almacena únicamente información persistente del cliente.
- `MemorySnapshot` permite reconstruir el estado de la conversación en un momento determinado.
- La Base de Conocimiento siempre se representa mediante `KnowledgeDocument`.
- El Motor RAG nunca devuelve documentos completos directamente al modelo; siempre lo hace mediante `RetrievalResult`.
- `relevanceScore` utiliza un rango entre **0.0** y **1.0**.
- Los metadatos de documentos se centralizan en `DocumentMetadata` para evitar duplicación.

# Prompt Models

Los siguientes modelos representan la información utilizada por el Prompt Builder para construir el contexto enviado al Modelo de Lenguaje.

---

## PromptSectionType

Define los diferentes bloques que pueden formar parte de un prompt.

```ts
enum PromptSectionType {

    SYSTEM,

    MEMORY,

    KNOWLEDGE,

    USER,

    TOOL,

    CONTEXT

}
```

---

## PromptSection

Representa una sección individual del prompt.

```ts
interface PromptSection {

    id: UUID;

    type: PromptSectionType;

    content: string;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador de la sección. |
| type | PromptSectionType | Tipo de sección. |
| content | string | Contenido textual. |
| metadata | Metadata | Información adicional. |

---

## Prompt

Representa el prompt completo enviado al Modelo de Lenguaje.

```ts
interface Prompt {

    id: UUID;

    sections: PromptSection[];

    createdAt: Timestamp;

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador del prompt. |
| sections | PromptSection[] | Secciones que forman el prompt. |
| createdAt | Timestamp | Momento de construcción. |
| metadata | Metadata | Información adicional. |

---

## PromptContext

Representa toda la información utilizada para construir un prompt.

```ts
interface PromptContext {

    memory: ConversationMemory;

    retrieval: RetrievalResult;

    intent: IntentResult;

    entities: EntityResult;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| memory | ConversationMemory | Contexto conversacional. |
| retrieval | RetrievalResult | Información obtenida por RAG. |
| intent | IntentResult | Resultado del detector de intención. |
| entities | EntityResult | Entidades detectadas. |

---

# Response Validation Models

Estos modelos representan la salida generada por el Response Validator.

---

## ValidationStatus

Estado general de una validación.

```ts
enum ValidationStatus {

    SUCCESS,

    WARNING,

    ERROR

}
```

---

## ValidationDecision

Acción que deberá realizar el sistema después de validar la respuesta.

```ts
enum ValidationDecision {

    APPROVED,

    REGENERATE,

    CALL_TOOL,

    REJECT

}
```

---

## ValidationSeverity

Nivel de importancia de un problema detectado.

```ts
enum ValidationSeverity {

    LOW,

    MEDIUM,

    HIGH,

    CRITICAL

}
```

---

## ValidationRule

Representa una regla utilizada durante el proceso de validación.

```ts
interface ValidationRule {

    id: UUID;

    name: string;

    description: string;

}
```

---

## ValidationIssue

Representa un problema encontrado durante la validación.

```ts
interface ValidationIssue {

    id: UUID;

    rule: ValidationRule;

    severity: ValidationSeverity;

    message: string;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador del problema. |
| rule | ValidationRule | Regla incumplida. |
| severity | ValidationSeverity | Nivel de gravedad. |
| message | string | Descripción del problema. |

---

## ValidationResult

Representa el resultado completo de una validación.

```ts
interface ValidationResult {

    status: ValidationStatus;

    decision: ValidationDecision;

    issues: ValidationIssue[];

    validatedAt: Timestamp;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| status | ValidationStatus | Estado general. |
| decision | ValidationDecision | Acción a ejecutar. |
| issues | ValidationIssue[] | Problemas detectados. |
| validatedAt | Timestamp | Momento de validación. |

---

# Tool Models

Estos modelos representan la comunicación entre Aura y las herramientas externas.

---

## ToolCapability

Capacidades soportadas por una herramienta.

```ts
enum ToolCapability {

    READ,

    WRITE,

    SEARCH,

    CREATE,

    UPDATE,

    DELETE,

    EXECUTE

}
```

---

## ToolStatus

Estado de ejecución de una herramienta.

```ts
enum ToolStatus {

    PENDING,

    RUNNING,

    SUCCESS,

    FAILED

}
```

---

## ToolDefinition

Describe una herramienta disponible para Aura.

```ts
interface ToolDefinition {

    id: UUID;

    name: string;

    description: string;

    capabilities: ToolCapability[];

    metadata?: Metadata;

}
```

---

## ToolRequest

Representa una solicitud enviada a una herramienta.

```ts
interface ToolRequest {

    id: UUID;

    tool: ToolDefinition;

    parameters: JsonObject;

    requestedAt: Timestamp;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador de la solicitud. |
| tool | ToolDefinition | Herramienta objetivo. |
| parameters | JsonObject | Parámetros enviados. |
| requestedAt | Timestamp | Momento de la solicitud. |

---

## ToolResult

Representa la información producida por una herramienta.

```ts
interface ToolResult {

    data: JsonValue;

    metadata?: Metadata;

}
```

---

## ToolExecution

Representa el estado de una ejecución.

```ts
interface ToolExecution {

    id: UUID;

    request: ToolRequest;

    status: ToolStatus;

    startedAt: Timestamp;

    finishedAt?: Timestamp;

}
```

---

## ToolResponse

Representa la respuesta completa de una herramienta.

```ts
interface ToolResponse {

    execution: ToolExecution;

    result?: ToolResult;

    error?: string;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| execution | ToolExecution | Información de ejecución. |
| result | ToolResult | Resultado producido. |
| error | string | Mensaje de error si ocurrió alguno. |

---

# Relaciones

```
PromptContext
│
├── ConversationMemory
├── RetrievalResult
├── IntentResult
└── EntityResult
        │
        ▼
Prompt
│
└── PromptSection

ValidationResult
│
├── ValidationIssue
│       │
│       └── ValidationRule
│
└── ValidationDecision

ToolDefinition
│
├── ToolRequest
│       │
│       └── ToolExecution
│               │
│               └── ToolResponse
│                       │
│                       └── ToolResult
```

---

# Notas Arquitectónicas

- Un `Prompt` siempre está compuesto por múltiples `PromptSection`.
- El `Prompt Builder` nunca construye texto plano directamente; primero organiza el contexto mediante secciones.
- `ValidationDecision` determina el siguiente paso del pipeline y es independiente del `ValidationStatus`.
- `ToolDefinition` describe una herramienta; `ToolExecution` representa una ejecución específica de esa herramienta.
- `ToolRequest` y `ToolResponse` son contratos de comunicación, mientras que `ToolExecution` modela el ciclo de vida de la ejecución.

# Security Models

Los siguientes modelos representan los contratos relacionados con la autorización, auditoría y políticas de acceso dentro de Aura.

Estos modelos no implementan mecanismos de autenticación.

Únicamente describen la estructura de los datos utilizados por la arquitectura.

---

## Permission

Representa un permiso disponible dentro del sistema.

```ts
interface Permission {

    id: UUID;

    name: string;

    description: string;

}
```

---

## Role

Representa un conjunto de permisos.

```ts
interface Role {

    id: UUID;

    name: string;

    permissions: Permission[];

}
```

---

## AccessPolicy

Representa una política utilizada para controlar el acceso a recursos.

```ts
interface AccessPolicy {

    id: UUID;

    resource: string;

    roles: Role[];

    metadata?: Metadata;

}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|------------|------|-------------|
| id | UUID | Identificador de la política. |
| resource | string | Recurso protegido. |
| roles | Role[] | Roles autorizados. |
| metadata | Metadata | Información adicional. |

---

## SecurityEventType

Tipos de eventos de seguridad.

```ts
enum SecurityEventType {

    AUTHENTICATION,

    AUTHORIZATION,

    TOOL_ACCESS,

    POLICY_VIOLATION,

    VALIDATION_FAILURE,

    SYSTEM

}
```

---

## SecurityEvent

Representa un evento relacionado con la seguridad.

```ts
interface SecurityEvent {

    id: UUID;

    type: SecurityEventType;

    timestamp: Timestamp;

    description: string;

    metadata?: Metadata;

}
```

---

## AuditEvent

Representa un evento utilizado para auditoría.

```ts
interface AuditEvent {

    id: UUID;

    timestamp: Timestamp;

    action: string;

    resource: string;

    metadata?: Metadata;

}
```

---

# Global Models

Los siguientes modelos son reutilizables por cualquier componente de la arquitectura.

---

## ErrorInfo

Representa información estructurada sobre un error.

```ts
interface ErrorInfo {

    code: string;

    message: string;

    details?: Metadata;

}
```

---

## Pagination

Representa información de paginación.

```ts
interface Pagination {

    page: number;

    pageSize: number;

    totalItems: number;

    totalPages: number;

}
```

---

## SystemEvent

Representa cualquier evento producido por Aura.

```ts
interface SystemEvent {

    id: UUID;

    name: string;

    timestamp: Timestamp;

    metadata?: Metadata;

}
```

---

# Relaciones Globales

```
Intent Detection
│
├── Intent
│
└── IntentResult
│
▼
Entity Extraction
│
├── Entity
│
└── EntityResult
│
▼
Memory System
│
├── MemoryEntry
├── CustomerProfile
├── ConversationState
├── ConversationMemory
├── MemoryUpdate
└── MemorySnapshot
│
▼
RAG Engine
│
├── SearchQuery
├── KnowledgeDocument
├── KnowledgeChunk
├── RetrievedDocument
└── RetrievalResult
│
▼
Prompt Builder
│
├── PromptContext
├── Prompt
└── PromptSection
│
▼
Response Validator
│
├── ValidationRule
├── ValidationIssue
└── ValidationResult
│
▼
Tool System
│
├── ToolDefinition
├── ToolRequest
├── ToolExecution
├── ToolResponse
└── ToolResult
│
▼
Security
│
├── Permission
├── Role
├── AccessPolicy
├── SecurityEvent
└── AuditEvent
```

---

# Reglas de Versionado

Todos los contratos definidos en este documento deberán evolucionar siguiendo las siguientes reglas.

## Cambios Compatibles

Se consideran compatibles:

- Agregar propiedades opcionales.
- Agregar nuevos valores a una enumeración.
- Incorporar nuevos modelos.
- Agregar nuevos metadatos.

---

## Cambios No Compatibles

Se consideran incompatibles:

- Eliminar propiedades existentes.
- Cambiar el tipo de una propiedad.
- Renombrar propiedades.
- Eliminar valores de una enumeración.
- Modificar el significado de un contrato.

---

## Evolución

Cuando un contrato requiera un cambio incompatible deberá definirse una nueva versión del modelo.

La versión anterior deberá mantenerse mientras existan componentes que dependan de ella.

---

# Convenciones para Nuevos Modelos

Todo nuevo modelo incorporado a Aura deberá cumplir las siguientes reglas.

- Utilizar PascalCase.
- Utilizar propiedades en camelCase.
- Contener una única responsabilidad.
- Evitar lógica de negocio.
- Reutilizar tipos existentes.
- Reutilizar Metadata cuando sea necesario.
- Evitar duplicación de información.
- Mantener compatibilidad con versiones anteriores.

---

# Dependencias

Este documento es referenciado por:

- 03_intent_detection.md
- 04_entity_extraction.md
- 05_memory_system.md
- 06_rag_engine.md
- 07_prompt_builder.md
- 08_response_validator.md
- 09_tool_system.md
- 11_security.md
- 12_deployment.md

---

# Estado

**Versión:** 1.0

**Estado:** En diseño

