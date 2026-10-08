# Política operativa de hosting y mantenimiento

## Oferta vigente

- Hosting: `$99 MXN / mes` o `$999 MXN / año`.
- Hosting + mantenimiento: `$199 MXN / mes` o `$1,999 MXN / año`.
- La renovación usa el precio vigente o el previamente acordado al renovar.
- No hay cobros automáticos ni renovación automática de tarjetas.

## Hosting + mantenimiento

Incluye alojamiento, una revisión preventiva cada 30 días, una revisión general cada 3 meses y hasta 2 solicitudes de cambios menores por periodo mensual. Las solicitudes no son acumulables: al comenzar un nuevo periodo el contador vuelve conceptualmente a cero. El servicio depende de mantener vigente el periodo contratado.

### Revisión preventiva mensual

1. Sitio responde y carga correctamente.
2. HTTPS/SSL cuando aplique.
3. Navegación y enlaces principales.
4. Botones, WhatsApp y formularios existentes.
5. Imágenes y recursos rotos.
6. Visualización móvil básica.
7. Errores visibles y disponibilidad general.
8. Registrar el resultado en `projects/{projectId}/updates`.

### Revisión general trimestral

Además de lo anterior, revisar responsive en 375/390/430 y escritorio, enlaces rotos, datos de contacto y horarios, metadata básica, SEO técnico básico, rendimiento general, integraciones existentes y contenido obsoleto detectable.

## Cambios menores

Una solicitud puede agrupar varios cambios pequeños relacionados dentro de una intervención razonable. Incluye textos, precios, horarios, teléfonos, WhatsApp, dirección, imágenes, enlaces, redes sociales, productos o servicios existentes, correcciones pequeñas de contenido y ajustes visuales dentro de componentes ya creados.

Un cambio menor modifica contenido o elementos existentes sin alterar sustancialmente la arquitectura o funcionalidad. El cliente debe proporcionar textos, precios, fotografías, horarios y datos correctos.

## Fuera de plan

No incluye nuevas páginas o secciones complejas, rediseños completos, nuevas funcionalidades, ecommerce, carrito, pagos, reservas complejas, nuevas integraciones, APIs, automatizaciones complejas, migraciones grandes, campañas, producción continua de contenido, fotografía, video, branding, publicidad, SEO avanzado ni desarrollo fuera del alcance original. Se cotizan por separado. Una solicitud adicional puede registrarse como `extra` sin aumentar el contador incluido.

## Registro operativo

El panel `/proyectos/` conserva el contador y el periodo mensual en el proyecto. Al registrar una solicitud incluida, la operación protegida verifica el periodo y el límite de forma atómica; si el periodo venció, inicia uno nuevo con uso cero. Las actividades preventivas y trimestrales actualizan sus próximas fechas y crean un registro en `projects/{projectId}/updates`.

Campos relevantes: `maintenanceFrequency`, `maintenanceRequestsLimit`, `maintenanceRequestsUsed`, `maintenancePeriodStart`, `maintenancePeriodEnd`, `lastMaintenanceReviewAt`, `nextMaintenanceReviewAt`, `lastQuarterlyReviewAt`, `nextQuarterlyReviewAt` y `maintenanceRenewalDate`.

## Incidencias y terceros

Las fallas atribuibles a infraestructura o configuración bajo control de Eventora se atienden con prioridad razonable. No se promete soporte 24/7, respuesta inmediata, disponibilidad absoluta ni SLA empresarial. WhatsApp, Google Maps, Instagram, Facebook, dominios y otros proveedores tienen condiciones y disponibilidad propias.

## Renovación

Al renovar, revisar el estado del sitio, el periodo contratado, los datos de contacto y las condiciones vigentes. Para un sitio publicado bajo una dirección temporal, planear posteriormente la migración a dominio propio, retiro de `noindex`, canonical, sitemap y actualización de JSON-LD/Open Graph.
