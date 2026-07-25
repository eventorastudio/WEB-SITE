# 03 - Intent Detection

## Propósito

Este documento describe el funcionamiento del Detector de Intención de Aura.

Su objetivo es identificar qué desea hacer el cliente antes de consultar la base de conocimiento.

La detección de intención permite que el sistema recupere únicamente la información necesaria, seleccione el flujo adecuado y reduzca el costo de procesamiento.

---

# Objetivos

El Detector de Intención debe ser capaz de:

- Identificar la intención principal del cliente.
- Detectar múltiples intenciones en un mismo mensaje.
- Calcular un nivel de confianza para cada intención detectada.
- Clasificar la consulta dentro de una categoría conocida.
- Enviar el resultado al Extractor de Entidades.
- Reducir el espacio de búsqueda del Motor RAG.

---

# Ubicación dentro del Pipeline

```
Preprocesamiento
        │
        ▼
Detector de Intención
        │
        ▼
Extractor de Entidades
```

---

# Responsabilidad

El Detector de Intención analiza el mensaje inmediatamente después del preprocesamiento.

Su única responsabilidad es clasificar la intención del cliente.

Este módulo:

- No consulta la base de conocimiento.
- No interpreta documentos.
- No genera respuestas.
- No ejecuta herramientas.
- No modifica la memoria conversacional.

Su salida únicamente describe qué desea hacer el cliente.

---

# Flujo

```
Mensaje Normalizado

↓

Analizar contenido

↓

Detectar intención principal

↓

Detectar intenciones secundarias

↓

Calcular nivel de confianza

↓

Clasificar categorías

↓

Enviar resultado al Extractor de Entidades
```

---

# Categorías de Intención

Las categorías iniciales del sistema son:

- Bienvenida
- Nuevo Cliente
- Información General
- Consulta de Paquetes
- Recomendación de Paquete
- Consulta de Pagos
- Consulta de Políticas
- Consulta del Proceso
- Solicitud de Cambios
- Estado del Proyecto
- Confirmación
- Cancelación
- Despedida
- Conversación General
- Fuera del Alcance
- Desconocida

Estas categorías pueden ampliarse conforme evolucione Aura.

---

# Múltiples Intenciones

Un mismo mensaje puede contener varias intenciones.

Ejemplo

Entrada

```
Hola.

Me caso en diciembre.

¿Qué paquete me recomiendas?

¿Aceptan PayPal?
```

Resultado conceptual

```
Intención Principal

• Recomendación de Paquete

Intenciones Secundarias

• Nuevo Cliente

• Consulta de Pagos

• Bienvenida
```

Cada intención será utilizada posteriormente por el Motor RAG para recuperar únicamente los documentos necesarios.

---

# Prioridad de Intenciones

Cuando existen varias intenciones, Aura debe establecer un orden de prioridad.

Ejemplo

Entrada

```
Hola.

Quiero cambiar mi invitación.

¿Aceptan Mercado Pago?
```

Prioridad

```
1. Solicitud de Cambios

2. Consulta de Pagos

3. Bienvenida
```

La prioridad permite optimizar la recuperación de documentos y mejorar la calidad de la respuesta.

---

# Nivel de Confianza

Además de identificar las intenciones presentes en el mensaje, el Detector de Intención asigna un nivel de confianza (*confidence score*) a cada una.

El nivel de confianza representa la probabilidad de que una intención haya sido identificada correctamente.

Su propósito es proporcionar información adicional a los módulos posteriores cuando la clasificación sea ambigua.

## Ejemplo

Entrada

```
Hola.

Estoy buscando información sobre los paquetes y también quisiera saber cómo puedo pagar.
```

Resultado conceptual

```
Intención Principal

• Consulta de Paquetes
  Confianza: 0.96

Intenciones Secundarias

• Consulta de Pagos
  Confianza: 0.89

• Bienvenida
  Confianza: 0.77
```

El rango del nivel de confianza es:

- **1.00** → Confianza máxima.
- **0.00** → Sin confianza.

El método utilizado para calcular este valor depende del modelo empleado durante la implementación y no forma parte de esta especificación.

---

# Intenciones Desconocidas

Si el mensaje no puede clasificarse dentro de ninguna categoría conocida, Aura asignará la intención:

```
desconocida
```

Posteriormente, el sistema decidirá el siguiente paso del flujo.

El Detector de Intención nunca debe inventar una categoría inexistente.

---

# Entrada

El módulo recibe un mensaje previamente normalizado.

Ejemplo

```
Quiero una invitación para mi boda.

No sé cuál paquete elegir.

¿Aceptan PayPal?
```

---

# Salida

El Detector de Intención devuelve una estructura con:

- Intención principal.
- Intenciones secundarias.
- Nivel de confianza para cada intención.
- Información necesaria para que el siguiente módulo continúe el procesamiento.

La estructura exacta de esta salida se define en:

```
09_data_models.md
```

Con ello se mantiene un único contrato de datos para todo el sistema y se evita duplicar especificaciones entre documentos.

---

# Responsabilidades

El Detector de Intención debe:

- Clasificar la intención principal.
- Detectar intenciones secundarias.
- Detectar múltiples objetivos.
- Calcular el nivel de confianza.
- Reducir el espacio de búsqueda del Motor RAG.
- Mantener una clasificación consistente.

---

# Restricciones

El Detector de Intención NO debe:

- Consultar la base de conocimiento.
- Interpretar documentos.
- Generar respuestas.
- Recomendar paquetes.
- Ejecutar herramientas.
- Modificar la memoria.
- Tomar decisiones de negocio.

Todas esas responsabilidades pertenecen a otros módulos.

---

# Consideraciones

Una detección incorrecta de intención puede provocar:

- Recuperación de documentos incorrectos.
- Uso de contexto irrelevante.
- Incremento de alucinaciones.
- Respuestas incompletas.
- Mayor consumo de tokens.

Por ello, este módulo constituye uno de los componentes más importantes de la arquitectura.

---

# Dependencias

## Entrada

Recibe información de:

- Preprocesamiento

## Salida

Entrega información a:

- 04_entity_extraction.md

## Relación con otros documentos

Este módulo trabaja junto con:

- 02_request_pipeline.md
- 04_entity_extraction.md
- 06_rag_engine.md
- 09_data_models.md

---

# Estado

**Versión:** 1.0

**Estado:** En diseño