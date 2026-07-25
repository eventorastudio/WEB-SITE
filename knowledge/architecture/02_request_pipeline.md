# 02 - Request Pipeline

## Propósito

Este documento describe el flujo completo que sigue Aura para procesar una solicitud desde que un cliente envía un mensaje hasta que recibe una respuesta.

El objetivo del pipeline es garantizar que todas las respuestas sean consistentes, verificables y respaldadas por la base de conocimiento de Eventora Studio.

Cada etapa posee una única responsabilidad y se ejecuta de forma secuencial.

---

# Flujo General

```
                Cliente
                    │
                    ▼
        1. Preprocesamiento
                    │
                    ▼
      2. Detector de Intención
                    │
                    ▼
      3. Extractor de Entidades
                    │
                    ▼
     4. Memoria Conversacional
                    │
                    ▼
          5. Motor RAG
                    │
                    ▼
     6. Constructor de Prompt
                    │
                    ▼
      7. Modelo de IA (Gemini)
                    │
                    ▼
     8. Validador de Respuesta
                    │
                    ▼
      9. Sistema de Herramientas
                    │
                    ▼
    10. Administrador de Memoria
                    │
                    ▼
            Respuesta Final
```

---

# Etapa 1 - Preprocesamiento

## Objetivo

Preparar el mensaje recibido antes de iniciar el procesamiento.

## Responsabilidades

- Eliminar caracteres innecesarios.
- Normalizar espacios.
- Detectar el idioma.
- Estandarizar el formato del mensaje.
- Preparar la entrada para el Detector de Intención.

## Entrada

```
Holaaaa!!!

Quiero una invitación 😊😊
```

## Salida

```
Quiero una invitación.
```

---

# Etapa 2 - Detector de Intención

## Objetivo

Determinar qué desea hacer el cliente.

En esta etapa Aura todavía no consulta la base de conocimiento.

Únicamente clasifica la intención principal y las intenciones secundarias presentes en el mensaje.

## Responsabilidades

- Detectar la intención principal.
- Detectar múltiples intenciones.
- Asignar una categoría.
- Enviar el resultado al Extractor de Entidades.

## Ejemplos

### Entrada

```
¿Aceptan PayPal?
```

### Salida

```
consulta_pago
```

---

### Entrada

```
Quiero cambiar mi invitación.
```

### Salida

```
cambio
```

---

### Entrada

```
No sé qué paquete elegir.
```

### Salida

```
recomendacion_paquete
```

---

# Etapa 3 - Extractor de Entidades

## Objetivo

Extraer la información relevante contenida en el mensaje.

Esta etapa no interpreta la información ni genera respuestas.

Únicamente identifica datos estructurados.

## Responsabilidades

- Detectar fechas.
- Detectar eventos.
- Detectar nombres.
- Detectar cantidades.
- Detectar paquetes.
- Detectar métodos de pago.
- Detectar cualquier entidad útil para la conversación.

## Ejemplo

### Entrada

```
Mi boda será el 14 de diciembre.

Somos 180 invitados.
```

### Salida

```
Evento:
Boda

Fecha:
14 de diciembre

Invitados:
180
```

---

# Etapa 4 - Memoria Conversacional

## Objetivo

Recuperar el contexto previamente conocido del cliente.

La memoria permite mantener conversaciones naturales evitando solicitar información que ya fue proporcionada.

## Responsabilidades

- Recuperar información almacenada.
- Complementar el contexto actual.
- Detectar información faltante.
- Evitar preguntas repetidas.

## Ejemplo

### Memoria

```
Evento:
Boda

Fecha:
14 de diciembre
```

### Nuevo mensaje

```
¿Cuánto cuesta?
```

Aura ya conoce el tipo de evento y no necesita volver a preguntarlo.

---

# Etapa 5 - Motor RAG

## Objetivo

Recuperar únicamente los documentos necesarios para responder la consulta.

Aura nunca carga toda la base de conocimiento.

## Responsabilidades

- Buscar documentos relevantes.
- Aplicar prioridad documental.
- Recuperar únicamente el contexto necesario.
- Enviar la información al Constructor de Prompt.

## Ejemplo

### Consulta

```
¿Aceptan PayPal?
```

### Documentos recuperados

```
pagos.md

faq.md
```

---

# Etapa 6 - Constructor de Prompt

## Objetivo

Construir el contexto que será enviado al modelo de IA.

## Responsabilidades

Integrar:

- Consulta del cliente.
- Memoria conversacional.
- Documentos recuperados.
- Personalidad de Aura.
- Reglas del sistema.
- Restricciones de seguridad.

El modelo nunca recibe la base de conocimiento completa.

---

# Etapa 7 - Modelo de IA

## Objetivo

Generar una respuesta utilizando exclusivamente el contexto recibido.

## Responsabilidades

- Interpretar el contexto.
- Elaborar una respuesta.
- Respetar la personalidad de Aura.
- No utilizar información externa.

Toda la información utilizada por el modelo proviene del sistema.

---

# Etapa 8 - Validador de Respuesta

## Objetivo

Verificar la calidad de la respuesta antes de enviarla al cliente.

## Responsabilidades

Comprobar que la respuesta:

- Sea coherente.
- Sea consistente.
- Respete las políticas.
- No invente información.
- Responda todas las preguntas del cliente.
- Utilice correctamente el contexto recuperado.

Si la respuesta no supera la validación, el sistema puede solicitar una nueva generación.

---

# Etapa 9 - Sistema de Herramientas

## Objetivo

Ejecutar acciones externas cuando la conversación lo requiera.

## Responsabilidades

Permitir acciones como:

- Consultar pedidos.
- Consultar pagos.
- Generar cotizaciones.
- Crear contratos.
- Agendar reuniones.
- Enviar correos.
- Enviar mensajes.
- Consultar calendarios.
- Registrar información.

Si la consulta no requiere herramientas, esta etapa se omite.

---

# Etapa 10 - Administrador de Memoria

## Objetivo

Actualizar la memoria de la conversación.

## Responsabilidades

Guardar únicamente información útil para futuras interacciones.

Ejemplos:

- Nombre del cliente.
- Evento.
- Fecha.
- Paquete recomendado.
- Paquete contratado.
- Estado del proyecto.
- Preferencias del cliente.

La memoria nunca reemplaza la base de conocimiento.

---

# Flujo Resumido

```
Mensaje del Cliente

↓

Preprocesamiento

↓

Detector de Intención

↓

Extractor de Entidades

↓

Memoria Conversacional

↓

Motor RAG

↓

Constructor de Prompt

↓

Modelo de IA

↓

Validador de Respuesta

↓

Sistema de Herramientas (si aplica)

↓

Administrador de Memoria

↓

Respuesta Final
```

---

# Reglas del Pipeline

Durante todo el procesamiento se deben cumplir las siguientes reglas:

- La base de conocimiento es la única fuente oficial de información.
- Aura nunca debe inventar información.
- La memoria complementa el contexto, pero no reemplaza la base de conocimiento.
- Cada módulo tiene una única responsabilidad.
- Ningún módulo modifica el comportamiento de otro.
- El orden del pipeline debe mantenerse.
- Las herramientas únicamente se ejecutan cuando una acción externa es necesaria.

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