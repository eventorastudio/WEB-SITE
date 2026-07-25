# 09 - Tool System

## Propósito

Este documento describe el funcionamiento del Sistema de Herramientas (Tool System) de Aura.

Su objetivo es ejecutar herramientas externas cuando el flujo de la conversación lo requiera.

El Tool System actúa como un intermediario entre Aura y los servicios externos.

Nunca toma decisiones sobre cuándo utilizar una herramienta.

Su única responsabilidad consiste en ejecutar herramientas autorizadas y devolver sus resultados.

---

# Objetivos

El Tool System debe ser capaz de:

- Ejecutar herramientas externas.
- Validar que una herramienta esté disponible.
- Enviar los parámetros necesarios.
- Obtener los resultados de la ejecución.
- Manejar errores durante la ejecución.
- Devolver la información al flujo principal.

---

# Ubicación dentro del Pipeline

```
Response Validator
        │
        ▼
Tool System
        │
        ▼
Memory Manager / Respuesta Final
```

---

# Responsabilidad

El Tool System recibe una solicitud para ejecutar una herramienta específica.

Su responsabilidad consiste únicamente en administrar la ejecución.

Este módulo:

- No interpreta respuestas.
- No consulta la Base de Conocimiento.
- No genera texto.
- No modifica la memoria.
- No toma decisiones comerciales.

Su trabajo termina cuando devuelve el resultado de la herramienta.

---

# Flujo

```
Recibir solicitud

↓

Validar herramienta

↓

Preparar parámetros

↓

Ejecutar herramienta

↓

Recibir resultado

↓

Validar ejecución

↓

Enviar resultado al flujo principal
```

---

# ¿Qué es una herramienta?

Una herramienta es cualquier servicio externo que Aura puede utilizar para realizar una acción que un modelo de lenguaje no puede ejecutar por sí mismo.

Ejemplos:

- Consultar una API.
- Enviar un mensaje.
- Crear una cita.
- Obtener información en tiempo real.
- Registrar datos.
- Procesar pagos.
- Consultar disponibilidad.
- Generar archivos.

---

# Tipos de Herramientas

Aura puede utilizar diferentes tipos de herramientas.

## APIs

Servicios REST u otros servicios externos.

Ejemplos

- WhatsApp Business
- Mercado Pago
- Stripe
- Google Maps

---

## Servicios Internos

Funciones propias del sistema.

Ejemplos

- Buscar un cliente.
- Consultar un proyecto.
- Registrar una solicitud.
- Obtener estadísticas.

---

## Automatizaciones

Procesos que ejecutan acciones específicas.

Ejemplos

- Enviar recordatorios.
- Confirmar citas.
- Actualizar estados.
- Registrar eventos.

---

# Validación

Antes de ejecutar una herramienta, el sistema debe verificar que:

- La herramienta exista.
- Se encuentre disponible.
- Los parámetros requeridos estén presentes.
- La solicitud sea válida.

Si alguna validación falla, la ejecución no deberá realizarse.

---

# Ejecución

Cuando todas las validaciones sean correctas, el Tool System ejecutará la herramienta correspondiente.

La ejecución debe realizarse de forma aislada del resto del sistema.

Cada herramienta debe comportarse como un componente independiente.

---

# Manejo de Errores

Durante la ejecución pueden presentarse diferentes situaciones.

Ejemplos

- Servicio no disponible.
- Tiempo de espera agotado.
- Error de autenticación.
- Parámetros inválidos.
- Error interno del servicio.

El Tool System deberá capturar estos errores y devolver un resultado consistente al flujo principal.

Nunca debe ocultar errores.

---

# Resultado de la Ejecución

Después de ejecutar una herramienta, el sistema devuelve uno de los siguientes resultados.

## Ejecución Exitosa

La herramienta completó correctamente la operación solicitada.

---

## Ejecución Fallida

La herramienta no pudo completar la operación.

El flujo principal decidirá cómo continuar.

El Tool System no toma esa decisión.

---

# Seguridad

El Tool System únicamente puede ejecutar herramientas previamente registradas y autorizadas.

Nunca debe ejecutar:

- Código arbitrario.
- Herramientas desconocidas.
- Servicios no autorizados.
- Solicitudes externas no validadas.

Toda herramienta debe formar parte de la arquitectura oficial de Aura.

---

# Entrada

El módulo recibe:

- Solicitud de ejecución.
- Nombre de la herramienta.
- Parámetros necesarios.

---

# Salida

El Tool System devuelve el resultado de la ejecución junto con la información necesaria para que el flujo principal continúe.

La estructura exacta del resultado se define en:

```
10_data_models.md
```

---

# Responsabilidades

El Tool System debe:

- Validar herramientas.
- Ejecutar herramientas autorizadas.
- Gestionar parámetros.
- Capturar errores.
- Devolver resultados.
- Mantener aislamiento entre herramientas y el resto del sistema.

---

# Restricciones

El Tool System NO debe:

- Generar respuestas.
- Consultar la Base de Conocimiento.
- Interpretar resultados.
- Actualizar memoria.
- Tomar decisiones.
- Ejecutar herramientas no autorizadas.

Su única responsabilidad consiste en administrar la ejecución.

---

# Consideraciones

Un sistema de herramientas mal diseñado puede provocar:

- Ejecuciones no autorizadas.
- Fallos de seguridad.
- Resultados inconsistentes.
- Dependencias innecesarias entre módulos.
- Mayor dificultad para incorporar nuevos servicios.

Por ello, todas las herramientas deben ser independientes y desacopladas del resto de la arquitectura.

---

# Dependencias

## Entrada

Recibe información de:

- 08_response_validator.md

## Salida

Entrega información a:

- Memory Manager
- Respuesta Final

## Relación con otros documentos

Este módulo trabaja junto con:

- 08_response_validator.md
- 10_data_models.md
- 11_security.md

---

# Estado

**Versión:** 1.0

**Estado:** En diseño