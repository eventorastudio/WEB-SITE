# 01 - System Overview

## Propósito

Este documento describe la arquitectura general de Aura y la interacción entre los principales componentes del sistema.

Su objetivo es proporcionar una visión de alto nivel sobre el funcionamiento de Aura antes de profundizar en cada uno de sus módulos.

Los detalles de implementación se documentan en los archivos correspondientes dentro de la carpeta `architecture`.

---

# ¿Qué es Aura?

Aura es el asistente inteligente de Eventora Studio.

Su propósito es asistir a los clientes durante todo el proceso comercial, proporcionando respuestas precisas, consistentes y alineadas con la información oficial de la empresa.

Aura utiliza un modelo de lenguaje como motor de razonamiento, pero todas sus respuestas deben estar respaldadas por la base de conocimiento de Eventora Studio.

La arquitectura está diseñada para minimizar alucinaciones, mantener la consistencia entre conversaciones y facilitar la evolución del sistema.

---

# Objetivos

La arquitectura de Aura busca cumplir los siguientes objetivos:

- Utilizar la base de conocimiento como única fuente oficial de información.
- Reducir al mínimo las alucinaciones del modelo.
- Mantener una personalidad consistente en todas las conversaciones.
- Aplicar correctamente las políticas de Eventora Studio.
- Mantener el contexto durante toda la conversación.
- Permitir la integración de nuevas herramientas sin modificar la arquitectura principal.
- Facilitar el mantenimiento y la escalabilidad del sistema.

---

# Arquitectura General

Aura está compuesta por módulos independientes.

Cada módulo tiene una única responsabilidad dentro del flujo de procesamiento.

El resultado de un módulo se convierte en la entrada del siguiente.

```
Cliente
    │
    ▼
Preprocesamiento
    │
    ▼
Detector de Intención
    │
    ▼
Extractor de Entidades
    │
    ▼
Memoria Conversacional
    │
    ▼
Motor RAG
    │
    ▼
Constructor de Prompt
    │
    ▼
Modelo de IA (Gemini)
    │
    ▼
Validador de Respuesta
    │
    ▼
Sistema de Herramientas
    │
    ▼
Administrador de Memoria
    │
    ▼
Respuesta Final
```

---

# Componentes

## Preprocesamiento

Normaliza el mensaje recibido antes de iniciar el procesamiento.

---

## Detector de Intención

Identifica qué desea hacer el cliente.

---

## Extractor de Entidades

Obtiene información relevante del mensaje, como fechas, tipo de evento, cantidad de invitados, métodos de pago, paquetes mencionados y demás datos útiles para la conversación.

---

## Memoria Conversacional

Recupera el contexto previamente conocido del cliente para evitar preguntas repetidas y mantener la continuidad de la conversación.

---

## Motor RAG

Recupera únicamente los documentos necesarios desde la base de conocimiento utilizando la consulta del cliente y el contexto de la conversación.

---

## Constructor de Prompt

Construye el contexto que será enviado al modelo de IA utilizando:

- Consulta del cliente.
- Memoria conversacional.
- Documentos recuperados.
- Personalidad de Aura.
- Reglas del sistema.

---

## Modelo de IA

Genera una respuesta utilizando únicamente el contexto proporcionado por el sistema.

---

## Validador de Respuesta

Verifica que la respuesta:

- Sea consistente con la base de conocimiento.
- No contradiga las políticas.
- No contenga información inventada.
- Responda correctamente a la solicitud del cliente.

---

## Sistema de Herramientas

Permite que Aura interactúe con servicios externos cuando una acción no puede resolverse únicamente mediante conversación.

Ejemplos:

- Consultar pedidos.
- Consultar pagos.
- Generar cotizaciones.
- Enviar mensajes.
- Crear contratos.
- Agendar reuniones.

---

## Administrador de Memoria

Actualiza la memoria de la conversación almacenando únicamente la información relevante para futuras interacciones.

---

# Fuente de Verdad

La carpeta `knowledge` constituye la única fuente oficial de información de Eventora Studio.

Toda respuesta relacionada con la empresa debe estar respaldada por alguno de sus documentos.

Si la información solicitada no existe dentro de la base de conocimiento, Aura debe reconocer esa limitación y evitar generar información no documentada.

---

# Principios de Diseño

La arquitectura sigue los siguientes principios:

- Modularidad.
- Separación de responsabilidades.
- Escalabilidad.
- Transparencia.
- Consistencia.
- Mantenibilidad.
- Baja tasa de alucinaciones.
- Fácil integración de nuevas herramientas.

---

# Alcance

Este documento presenta únicamente la visión general del sistema.

Los detalles de cada componente se encuentran en los siguientes documentos:

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

# Dependencias

## Entrada

Recibe información de:

- Cliente

## Salida

Entrega información a:

- Cliente

## Relación con otros documentos

Este documento describe el flujo general del sistema.

Los detalles de cada etapa se desarrollan en:

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