# Proveedores y encargados — Eventora Studio

Inventario interno basado únicamente en referencias encontradas en el repositorio. Actualizado: 27 de agosto de 2026.

## Clasificación

- **CONFIRMADO:** proveedores y servicios listados abajo fueron detectados en el repositorio.
- **CRITERIO ESTABILIZADO:** Firebase/Google Cloud pueden ser Personas Encargadas o proveedores ulteriores; Google Maps puede ser Responsable independiente respecto de ciertos datos técnicos; WhatsApp/Meta puede tener roles distintos según el tratamiento.
- **PENDIENTE TÉCNICO:** regiones efectivas, retención del proveedor, configuración de recursos remotos y persistencia.
- **RECOMENDACIÓN:** evaluar self-hosting de fuentes e iconos para reducir dependencias de terceros.

| Proveedor | Evidencia | Función | Datos potenciales | Estado legal |
|---|---|---|---|---|
| Firebase / Google Cloud | SDK y servicios en Admin, invitación, RSVP y Portal | Authentication, Firestore, Storage y operación técnica | cuentas, eventos, invitados, RSVP, media y metadatos técnicos | posible Persona Encargada/proveedor ulterior; confirmar contrato, región, transferencias y retención |
| Google Fonts | hojas de estilo | tipografías | solicitud técnica y metadatos de navegador | [PENDIENTE: CONFIRMAR CONFIGURACIÓN Y EVALUAR SELF-HOSTING] |
| Lucide CDN | `unpkg.com/lucide...` | iconos | solicitud técnica | [PENDIENTE: CONFIRMAR NECESIDAD Y EVALUAR SELF-HOSTING] |
| WhatsApp / Meta | enlaces `wa.me` | contacto comercial/RSVP | datos y metadatos técnicos que la persona incluya | rol variable; Meta puede tratar ciertos datos conforme a sus propias finalidades |
| Google Maps | enlaces/funciones de ubicación | mapas | datos compartidos al salir y ciertos datos técnicos | posible Responsable independiente; sujeto a su aviso |
| Instagram | enlace social | presencia/contacto | datos compartidos al salir | tercero externo, sujeto a su aviso |

El inventario detallado de tecnologías de almacenamiento, seguridad, CDN y servicios externos se encuentra en `docs/privacy-technologies-inventory.md`.

No se encontraron referencias activas a Google Analytics, Meta Pixel, TikTok Pixel, Hotjar ni trackers publicitarios. Actualizar este inventario antes de incorporar cualquiera.
