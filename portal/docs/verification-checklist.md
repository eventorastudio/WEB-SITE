# Checklist de verificación manual

No se insertaron eventos, clientes ni invitados de demostración. Ejecutar estas pruebas en Firebase Emulator Suite o en un proyecto no productivo con perfiles explícitos.

| Caso | Resultado esperado |
|---|---|
| Sin sesión | Redirección a `portal/index.html`. |
| Perfil inexistente, inactivo o con rol distinto | Pantalla de acceso denegado, sin datos del evento. |
| Evento no asignado o inexistente | Pantalla de acceso denegado, sin listeners. |
| `portalCliente: false` | Pantalla “Función exclusiva de Prestige”. |
| `checkInQR: false` | La ruta Check-in se bloquea como Premium. |
| Token QR válido | Se muestra el invitado y se permite registrar hasta los pases disponibles. |
| Token inválido, QR ajeno o QR desactivado | Estado denegado; no escribe documentos. |
| Entrada parcial | Incrementa `pasesUtilizados`, reduce disponibles y escribe resultado `parcial`. |
| Exceso o simultaneidad en dos equipos | Solo una transacción confirma los pases restantes. |
| Entrada manual | Registra `metodo: 'manual'` y aparece en historial. |
| Pérdida de red | Check-in bloqueado; no se anuncia un registro confirmado. |
| Cámara denegada / sin `BarcodeDetector` | Se muestra explicación y permanece el ingreso manual. |
| Cambio de página, pestaña oculta, cierre de sesión | La cámara y listeners se liberan. |
| 320–430 px, 768 px, 1024 px, 1440 px | Sin scroll horizontal, botones táctiles de 44 px y navegación operable. |

El portal solo implementa la interfaz oscura Prestige; no ofrece selector claro/oscuro, por lo que no existe una segunda variante de tema que validar en esta fase.
