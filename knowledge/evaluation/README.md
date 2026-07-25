# Evaluation

La carpeta **evaluation** contiene los casos utilizados para evaluar el comportamiento de Aura una vez finalizado su entrenamiento.

A diferencia de la carpeta **training**, cuyo objetivo es enseñar cómo debe responder, esta carpeta funciona como un conjunto de pruebas independientes que permiten verificar si Aura aplica correctamente el conocimiento adquirido.

Los casos de evaluación representan conversaciones reales que pueden involucrar una o varias intenciones, diferentes niveles de dificultad y situaciones donde Aura debe combinar información de múltiples documentos.

---

# Objetivos

Las evaluaciones buscan comprobar que Aura sea capaz de:

- Detectar correctamente la intención del cliente.
- Identificar múltiples intenciones cuando existan.
- Seleccionar los documentos adecuados para responder.
- Resolver conflictos entre documentos siguiendo la prioridad establecida.
- Mantener la personalidad definida en `aura.md`.
- Respetar las políticas de la empresa.
- No inventar información.
- Guiar la conversación hacia el siguiente paso adecuado.

---

# Filosofía

Una evaluación no enseña.

Una evaluación únicamente mide el desempeño de Aura.

Por esta razón:

- No contiene explicaciones didácticas.
- No busca entrenar un comportamiento.
- No corrige respuestas.
- No modifica la base de conocimiento.

Cada caso representa una prueba objetiva cuyo resultado debe ser consistente sin importar cuántas veces se ejecute.

---

# Organización

Cada archivo contiene un único caso de evaluación.

```
evaluation/

README.md

EV-001.md
EV-002.md
EV-003.md
...
EV-020.md
```

Cada evaluación incrementa progresivamente su dificultad.

Los primeros casos verifican una sola intención.

Los últimos casos combinan múltiples intenciones, emociones, políticas y escenarios ambiguos.

---

# Estructura de un caso

Todos los archivos utilizan exactamente la misma plantilla.

1. Metadatos
2. Objetivo
3. Caso
4. Respuesta esperada
5. Documentos que debe consultar
6. Criterios de evaluación
7. Errores críticos
8. Resultado esperado

Esta estructura permite comparar fácilmente diferentes versiones de Aura utilizando siempre los mismos escenarios.

---

# Principios

Toda evaluación debe cumplir las siguientes reglas.

## 1. Basarse únicamente en la base de conocimiento

Las respuestas esperadas únicamente pueden construirse utilizando la información disponible dentro de la carpeta `knowledge`.

---

## 2. No asumir información

Si el caso no proporciona un dato, Aura no debe inventarlo.

---

## 3. Mantener la personalidad

Durante toda la evaluación Aura debe conservar el comportamiento definido en `aura.md`.

---

## 4. Respetar la prioridad documental

Cuando existan varios documentos relacionados, Aura debe resolver cualquier conflicto siguiendo el orden establecido en `prompts.md`.

---

## 5. Evaluar comportamiento, no redacción

El objetivo no es que Aura utilice exactamente las mismas palabras.

Lo importante es verificar que:

- Tome las decisiones correctas.
- Consulte los documentos adecuados.
- Mantenga la personalidad.
- Respete las políticas.
- Proporcione una respuesta útil.

---

# Niveles de dificultad

Las evaluaciones pueden clasificarse según su complejidad.

## Baja

Una única intención.

Un solo documento principal.

Sin conflictos.

---

## Media

Dos o tres intenciones.

Dos o más documentos.

Puede existir incertidumbre.

---

## Alta

Varias intenciones.

Conflictos entre documentos.

Necesidad de priorizar información.

---

## Muy alta

Conversaciones largas.

Cambios de contexto.

Emociones.

Objeciones.

Casos ambiguos.

Uso simultáneo de varios documentos.

---

# Criterios generales de aprobación

Una evaluación se considera satisfactoria cuando Aura:

- Detecta correctamente todas las intenciones.
- Consulta los documentos apropiados.
- No contradice ninguna política.
- No inventa información.
- Mantiene una conversación natural.
- Conserva la personalidad de Eventora Studio.
- Conduce correctamente al siguiente paso.

---

# Objetivo final

El propósito de esta carpeta es garantizar que cualquier nueva versión de Aura mantenga un comportamiento consistente, confiable y alineado con los estándares de Eventora Studio.

Si una evaluación deja de aprobarse después de realizar cambios en la base de conocimiento o en los prompts, dicho cambio debe revisarse antes de ser considerado una nueva versión estable.