# Reglas de Firestore para Portal Prestige

La política lista para revisión está en [`../../firestore.rules`](../../firestore.rules). No se desplegó ninguna regla durante esta corrección.

## Qué protege

- Solo un `usuarios/{uid}` activo, con `rol: 'cliente'` y el `eventId` incluido en `eventosPermitidos` puede entrar al Portal.
- El evento debe habilitar explícitamente `funcionalidades.portalCliente`; los check-ins requieren además `funcionalidades.checkInQR`.
- Un cliente solo lee su evento, sus invitados y, si tiene `historialAccesos`, su historial.
- El update de un invitado permite exclusivamente `pasesUtilizados`, `pasesDisponibles`, `llegadaRegistrada`, `horaLlegada`, `estado` y `fechaActualizacion`.
- La regla no permite modificar nombre, correo, teléfono, mesa, total de pases, `qrToken`, `qrActivo`, perfiles ni entitlements.
- Cada registro de historial se valida contra `getAfter()` del invitado: el incremento, la disponibilidad y el resultado deben corresponder a la actualización atómica.

Los documentos nuevos y los que usen el portal deben guardar `pases` como entero positivo. Firestore Rules no puede convertir un string como `"2"` a número; un documento legado con ese formato debe corregirse desde una herramienta administrativa, no desde el portal.

## Publicación manual

1. En Firebase Console abre el proyecto **eventorastudio-d6d95** y ve a **Firestore Database → Rules**.
2. Guarda una copia de las reglas de producción actuales fuera de este repositorio.
3. Revisa el diff de [`firestore.rules`](../../firestore.rules), compáralo con las rutas administrativas existentes y fusiónalo si esas rutas usan reglas adicionales.
4. Pega la regla fusionada en el editor, usa **Publish** y confirma que el proyecto seleccionado es `eventorastudio-d6d95`.
5. Prueba con Emulator Suite o con cuentas de prueba los casos de permisos, evento ajeno, entitlement desactivado, documento legado y doble check-in concurrente antes de usarla en un evento real.

No publiques esta política a ciegas si la aplicación ADMIN tiene rutas Firestore adicionales no representadas en este repositorio: la regla raíz es restrictiva deliberadamente y necesita incorporar sus permisos seguros existentes.
