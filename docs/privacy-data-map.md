# Mapa de datos personales — Eventora Studio

Documento interno de auditoría. No contiene tokens, identificadores de eventos reales ni credenciales. Actualizado: 27 de agosto de 2026.

## Clasificación

- **CONFIRMADO:** Luis Pablo García Moncada es persona física y opera bajo el nombre comercial Eventora Studio. Las categorías, finalidades y usos descritos abajo corresponden a la arquitectura auditada.
- **PENDIENTE ABOGADO:** caracterización definitiva de Responsable/Persona Encargada, domicilio, transferencias y contratos.
- **PENDIENTE CONTADOR:** tratamiento fiscal y CFDI.
- **PENDIENTE TÉCNICO:** depuración real, retención de logs y mecanismos de persistencia.
- **PENDIENTE PROPIETARIO:** vigencia pública del enlace y decisiones operativas aún no definidas.

| Categoría | Datos observados | Ubicación general | Finalidad | Acceso/publicación | Retención |
|---|---|---|---|---|---|
| Cliente y cuenta | correo de acceso, identidad y contacto proporcionado | Firebase Authentication y `usuarios/{uid}` | acceso, soporte y administración | personal autorizado; no publicación pública | Durante la relación y el tiempo necesario para obligaciones legales, contractuales, fiscales, seguridad o defensa de derechos; depuración operativa aún por definir |
| Evento | nombre, tipo, fecha, hora, lugar, descripción, configuración y paquete | `eventos/{eventId}` | configurar y publicar invitación | autorizado; parte puede publicarse | Objetivo: 50 días posteriores a la fecha del evento, salvo obligación legal, contractual, de seguridad o defensa de derechos |
| Invitados | nombre, correo, teléfono, pases, mesa, estado y notas | `eventos/{eventId}/invitados/{guestId}` | personalización, RSVP y acceso | organizador autorizado; proyección limitada al invitado | Objetivo: 30 días posteriores a la fecha del evento, con la misma reserva legal |
| RSVP | configuración, acceso, respuesta, pases y estado | subcolecciones `rsvp*` | recibir y reconciliar confirmaciones | organizador y flujo correspondiente | Objetivo: 30 días posteriores a la fecha del evento, con la misma reserva legal |
| QR y pases | identificadores técnicos y estado de acceso | invitado, `rsvpAccess`, proyecciones controladas y Portal | emitir y validar accesos | invitado correspondiente y personal autorizado | Objetivo: 30 días posteriores a la fecha del evento, con la misma reserva legal |
| Multimedia | nombre, MIME, tamaño, dimensiones, texto alternativo, caption y binario | documentos media en Firestore y Firebase Storage | mostrar y alojar contenido | organizador y URL proyectada; DEMO sólo si se comparte expresamente | Objetivo: 50 días posteriores a la fecha del evento, con la misma reserva legal |
| Logs técnicos | metadatos que puedan generar navegador/proveedor | infraestructura del proveedor; no confirmado repositorio propio | seguridad y diagnóstico | personal autorizado y proveedor | [PENDIENTE: CONFIRMAR RETENCIÓN DE LOGS CON CONFIGURACIÓN Y PROVEEDORES] |

## Proveedores detectados

- Firebase / Google Cloud: Authentication, Firestore, Storage y servicios técnicos.
- Google Fonts y Lucide CDN: recursos de presentación en páginas que los cargan.
- WhatsApp, Google Maps, Instagram y otros enlaces: el usuario queda sujeto a sus avisos al salir del sitio.

No incluir aquí secretos, tokens, public keys, IDs reales ni datos de invitados.

Tecnologías de persistencia: puede haber mecanismos técnicos estrictamente necesarios para autenticación y funcionamiento. No se ha auditado de forma específica la persistencia de sesión o las tecnologías de almacenamiento utilizadas.

[PENDIENTE: AUDITAR MECANISMOS REALES DE PERSISTENCIA DE SESIÓN Y TECNOLOGÍAS DE ALMACENAMIENTO]
Firebase/Google Cloud se documenta como posible Persona Encargada o proveedor ulterior/subcontratado según el flujo. Google Maps puede actuar como Responsable independiente respecto de ciertos datos técnicos; WhatsApp/Meta puede tener roles distintos según el tratamiento. La ubicación y transferencias no se deben afirmar sin verificación contractual y técnica.
