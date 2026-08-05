# Verificación de Portal Prestige

No se insertaron, cambiaron ni eliminaron invitados reales. Ejecutar los casos de integración en Firebase Emulator Suite o un proyecto no productivo con perfiles de prueba explícitos.

La prueba automatizada disponible es:

```powershell
node --experimental-vm-modules --test tests/*.test.mjs
```

Comprueba normalización de invitados legados, contadores inconsistentes, formatos de QR, rechazo de `INV-0001`, mensajes específicos y sintaxis de los módulos modificados. No sustituye pruebas con Firestore ni con cámaras reales.

## Check-in y permisos

| Caso | Resultado esperado |
|---|---|
| Sin sesión | Redirección a `portal/index.html`. |
| Perfil inexistente, inactivo o con rol distinto de `cliente` | Pantalla de acceso denegado, sin datos del evento. |
| Evento no asignado o inexistente | Pantalla de acceso denegado, sin listeners. |
| `portalCliente: false` | Pantalla “Función exclusiva de Prestige”. |
| `checkInQR: false` | La ruta Check-in se bloquea como Premium. |
| Invitado con ID `INV-0001` | La transacción usa `invitados/INV-0001`; el código visible no interviene. |
| Invitado con ID automático | La transacción usa `guest.id` del snapshot. |
| Sin `codigoInvitado` | La entrada funciona y el historial guarda `codigoInvitado: ""`. |
| Sin `pasesUtilizados` y/o `pasesDisponibles` | Se infiere el estado operativo y se persisten ambos contadores al primer ingreso. |
| `mesa` numérica | La tarjeta y el check-in muestran el número sin alterar el documento. |
| Un pase / entrada parcial | Incrementa usados, reduce disponibles, conserva o crea `horaLlegada` y guarda `resultado: 'parcial'`. |
| Último pase / entrada completa | Deja disponibles en cero y guarda `resultado: 'aprobado'`. |
| Solicitud superior a disponibles | No escribe nada y muestra una causa específica. |
| Dos dispositivos simultáneos | Solo la transacción que tenga disponibilidad confirma; la otra recibe el estado real de Firestore. |
| Historial | Se crea en la misma transacción con `metodo`, UID, cantidades y timestamp; sin valores `undefined`. |
| Sin permiso / entitlement desactivado / evento ajeno | Firestore responde `permission-denied`; el portal no lo presenta como conexión. |
| Offline | No se anuncia un registro confirmado; el mensaje es de conectividad. |
| Recarga tras publicar | Service Worker usa network-first para HTML y módulos, incluida la lógica del escáner. |

## Cámara y QR

| Caso | Resultado esperado |
|---|---|
| iPhone Safari e iPhone Chrome | Al pulsar **Iniciar cámara** pide permiso mediante `getUserMedia`; si no existe detector nativo usa ZXing local. |
| Android Chrome y Chrome de escritorio | Usa `BarcodeDetector` solo si declara `qr_code`; de otra forma usa ZXing. |
| Permiso denegado | Explica cómo activarlo e incluye el paso específico para Safari/Chrome en iPhone. |
| Sin cámara / cámara ocupada / restricciones incompatibles | Mensaje de `NotFoundError`, `NotReadableError` u `OverconstrainedError` correspondiente. |
| HTTP o contexto inseguro | No solicita la cámara y explica que se requiere HTTPS. |
| Dos o más cámaras | Después del permiso se habilita **Cambiar cámara**; se rota por `deviceId` sin depender del idioma del label. |
| Cerrar, ocultar pestaña, navegar, logout o `pagehide` | Detiene `requestAnimationFrame`, controles ZXing y cada `MediaStreamTrack`; al volver a abrir no debe haber dos streams. |
| QR directo, URL y JSON | Acepta token de 16–256 caracteres y valida que el `eventId` declarado coincida. |
| QR inválido / `INV-0001` | No consulta ni muestra datos personales. |
| QR repetido frente a la cámara | Se pausa tras una lectura válida y aplica cooldown de 2.5 s. |

Anotar navegador, dispositivo, versión de iOS/Android y resultado de cada ejecución antes de habilitar el portal en producción.
