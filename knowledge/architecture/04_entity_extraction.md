# 04 - Entity Extraction

## Propósito

Este documento describe el funcionamiento del módulo de Extracción de Entidades de Aura.

Su objetivo es identificar y estructurar la información relevante contenida en el mensaje del cliente para que pueda ser utilizada por los módulos posteriores del sistema.

El Extractor de Entidades no interpreta la información, no toma decisiones y no genera respuestas. Su única responsabilidad consiste en transformar información no estructurada en datos organizados.

---

# Objetivos

El Extractor de Entidades debe ser capaz de:

- Identificar entidades relevantes dentro del mensaje.
- Convertir información no estructurada en datos estructurados.
- Detectar múltiples entidades en una misma solicitud.
- Normalizar los valores identificados.
- Eliminar duplicados.
- Complementar el contexto conversacional.
- Proporcionar información al Motor RAG para mejorar la recuperación de documentos.

---

# Ubicación dentro del Pipeline

```
Detector de Intención
        │
        ▼
Extractor de Entidades
        │
        ▼
Memoria Conversacional
```

---

# Responsabilidad

El Extractor de Entidades recibe el mensaje normalizado junto con el resultado del Detector de Intención.

Su única responsabilidad consiste en identificar información objetiva presente en el mensaje.

Este módulo:

- No consulta la base de conocimiento.
- No responde preguntas.
- No interpreta políticas.
- No recomienda paquetes.
- No modifica la memoria.
- No ejecuta herramientas.
- No toma decisiones de negocio.

Toda interpretación corresponde a módulos posteriores.

---

# Flujo

```
Mensaje

↓

Analizar contenido

↓

Detectar entidades

↓

Normalizar valores

↓

Eliminar duplicados

↓

Construir resultado

↓

Enviar a Memoria Conversacional
```

---

# ¿Qué es una entidad?

Una entidad es cualquier dato identificable dentro del mensaje que pueda ser utilizado posteriormente por otro componente del sistema.

Las entidades representan hechos.

No representan conclusiones.

Ejemplos:

- Nombre de una persona.
- Tipo de evento.
- Fecha.
- Hora.
- Cantidad de invitados.
- Nombre de un paquete.
- Método de pago.
- Ciudad.
- Número de pedido.
- Estado de un proyecto.

---

# Tipos de Entidades

Aura puede identificar múltiples categorías de entidades.

## Persona

Ejemplos

```
Luis

María

Renatta
```

---

## Evento

Ejemplos

```
Boda

XV Años

Cumpleaños

Graduación

Baby Shower
```

---

## Fecha

Ejemplos

```
14 de diciembre

Mañana

La próxima semana

El sábado
```

Las fechas relativas podrán resolverse posteriormente utilizando el contexto de la conversación.

---

## Hora

Ejemplos

```
6:00 PM

18:30

Mediodía
```

---

## Cantidad

Ejemplos

```
180 invitados

3 cambios

2 invitaciones
```

---

## Paquete

Ejemplos

```
Esencial

Premium

Prestige
```

---

## Método de Pago

Ejemplos

```
Transferencia

PayPal

Mercado Pago

Tarjeta
```

---

## Ubicación

Ejemplos

```
Saltillo

Monterrey

Coahuila
```

---

## Estado del Proyecto

Ejemplos

```
Ya pagué

Ya confirmé

Quiero cancelar

Todavía no decido
```

---

# Múltiples Entidades

Un mismo mensaje puede contener diversas entidades.

Ejemplo

Entrada

```
Hola.

Soy Luis.

Mi boda será el 14 de diciembre.

Tendremos 180 invitados.

Creo que quiero el paquete Premium.
```

Resultado conceptual

```
Persona

• Luis

Evento

• Boda

Fecha

• 14 de diciembre

Invitados

• 180

Paquete

• Premium
```

Todas las entidades detectadas continúan juntas hacia el siguiente módulo.

---

# Normalización

Una vez detectadas las entidades, sus valores son normalizados para mantener consistencia dentro del sistema.

Ejemplo

Entrada

```
premium
```

Salida

```
Premium
```

---

Entrada

```
14/Dic
```

Salida

```
14 de diciembre
```

---

Entrada

```
paypal
```

Salida

```
PayPal
```

La normalización permite que todos los módulos trabajen utilizando un formato consistente.

---

# Resolución de Ambigüedad

Cuando una entidad no pueda determinarse con suficiente certeza, deberá marcarse como ambigua.

Ejemplo

```
Nos vemos el próximo viernes.
```

Si el sistema no dispone del contexto suficiente para determinar la fecha exacta, la entidad permanecerá sin resolver.

La resolución podrá realizarse posteriormente mediante la Memoria Conversacional o durante la construcción del Prompt.

El Extractor de Entidades nunca debe asumir información que no exista.

---

# Entidades Desconocidas

Si el sistema detecta información que no pertenece a ninguna categoría conocida, podrá clasificarla como una entidad desconocida.

Estas entidades podrán ser ignoradas o procesadas posteriormente dependiendo del contexto de la conversación.

El Extractor de Entidades nunca debe crear nuevas categorías automáticamente.

---

# Entrada

El módulo recibe:

- Mensaje normalizado.
- Resultado del Detector de Intención.

---

# Salida

El módulo devuelve una colección de entidades detectadas.

Cada entidad contiene la información necesaria para que los módulos posteriores continúen el procesamiento.

La estructura exacta del resultado se define en:

```
09_data_models.md
```

De esta forma existe un único contrato de datos compartido por toda la arquitectura.

---

# Responsabilidades

El Extractor de Entidades debe:

- Detectar entidades.
- Clasificar entidades.
- Normalizar valores.
- Eliminar duplicados.
- Preparar información estructurada.
- Mantener consistencia en los datos entregados.

---

# Restricciones

El Extractor de Entidades NO debe:

- Consultar la base de conocimiento.
- Interpretar documentos.
- Generar respuestas.
- Ejecutar herramientas.
- Modificar la memoria.
- Recomendar paquetes.
- Aplicar reglas de negocio.
- Resolver políticas.

Todas esas responsabilidades pertenecen a otros módulos.

---

# Consideraciones

Una extracción incorrecta puede provocar:

- Recuperación de documentos irrelevantes.
- Contexto incompleto.
- Respuestas menos precisas.
- Información inconsistente entre módulos.
- Mayor consumo de tokens durante la generación de la respuesta.

Por ello, este módulo debe limitarse a identificar información objetiva presente en el mensaje sin realizar interpretaciones.

---

# Dependencias

## Entrada

Recibe información de:

- 03_intent_detection.md

## Salida

Entrega información a:

- 05_memory_system.md

## Relación con otros documentos

Este módulo trabaja junto con:

- 03_intent_detection.md
- 05_memory_system.md
- 06_rag_engine.md
- 09_data_models.md

---

# Estado

**Versión:** 1.0

**Estado:** En diseño