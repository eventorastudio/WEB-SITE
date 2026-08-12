# Portal Prestige

Aplicación independiente para clientes autorizados de Eventora Studio. No importa controladores, UI, roles ni servicios administrativos; `portal/firebase.js` es únicamente un puente a la inicialización Firebase central para no duplicar configuración ni App Check.

## Arquitectura

```text
portal/
├── index.html                    acceso Prestige
├── dashboard.html                resumen y actividad reciente
├── check-in.html                 lector nativo + fallback ZXing + captura manual
├── invitados.html                búsqueda y entrada manual
├── actividad.html                historial protegido
├── core/                         estado, bus, UI, guards y entitlements
├── services/                     única capa con Firebase
├── modules/                      UI y ciclo init/destroy
├── assets/                       CSS e icono PWA
├── docs/                         reglas y checklist de prueba
├── vendor/                       dependencias locales versionadas
└── service-worker.js             cache de interfaz con módulos network-first
```

`shared/guest-contract.js` es el contrato puro común de invitados. La extracción mantiene el contrato ADMIN existente y permite que el portal use los mismos estados, mesa numérica y normalización sin importar un servicio administrativo.

## Autorización

Antes de revelar cualquier pantalla se exige:

1. Sesión Firebase activa.
2. Documento `usuarios/{uid}` existente, con `activo: true` y `rol: 'cliente'`.
3. El ID de evento solicitado pertenece a `eventosPermitidos`.
4. El documento existe y declara `funcionalidades.portalCliente: true`.
5. La página exige también su entitlement: `seguimientoEnVivo`, `checkInQR` o `historialAccesos`.

No existe una consulta que enumere todos los eventos. El selector, cuando hay más de uno, lee únicamente IDs ya asignados al perfil.

## Check-in

Un QR aceptado contiene un token aleatorio de 16–256 caracteres, en JSON `{ eventId, token }`, URL con `?t=TOKEN`, o token directo para captura manual. No se admite `INV-0001` como QR.

`checkin-service.js` usa una transacción Firestore que relee el evento y el invitado por su **ID de documento**, valida y normaliza sus contadores operativos, actualiza `pasesUtilizados` y `pasesDisponibles`, conserva `horaLlegada` tras el primer ingreso y crea el historial en la misma confirmación. Por tanto, dos dispositivos no pueden confirmar los mismos pases restantes. La UI no confirma una llegada hasta que la transacción resuelve. El cliente Portal no actualiza el documento padre del evento; esa reconciliación agregada requiere un backend confiable o el mecanismo administrativo.

El escáner abre la cámara mediante `getUserMedia` a partir de una acción explícita. Usa `BarcodeDetector` solo si confirma soporte `qr_code`; de lo contrario, o si el motor nativo falla, usa el fallback local **@zxing/browser 0.2.0** (`portal/vendor/zxing-browser-0.2.0.min.js`, MIT, obtenido del paquete oficial). Así Safari en iPhone no depende de `BarcodeDetector` ni de un CDN de producción.

## Pasos manuales previos a producción

1. Crear perfiles `usuarios/{uid}` desde una operación administrativa segura; el cliente no puede autoasignarse eventos ni features.
2. Añadir entitlements explícitos al evento (`portalCliente`, `checkInQR`, `seguimientoEnVivo`, `historialAccesos`). No usar solo el paquete comercial.
3. Generar y guardar para cada pase QR `qrToken` aleatorio criptográficamente seguro y `qrActivo: true`; nunca emplear códigos secuenciales como token.
4. Copiar primero las Rules desplegadas desde Firebase Console a `firestore.rules`, compararlas con `firestore.rules.proposed` y publicar manualmente la fusión solo después de probarla con Emulator Suite. No se hizo ningún despliegue.
5. Configurar el dominio del portal entre los dominios permitidos de Firebase Auth y App Check/reCAPTCHA. No se cambió FirebaseConfig, ninguna key ni App Check.
6. Servir el portal por HTTPS; `getUserMedia`, BarcodeDetector y la instalación PWA lo requieren.

## Fuera de alcance

No incluye facturación, pagos, CRM, editor de invitaciones, creación/configuración de eventos, cambios de planes, reversión de check-in ni una cola offline. La reversión se muestra deshabilitada porque requiere un endpoint administrativo con auditoría.
