# Reglas de Firestore para Portal Prestige

Este repositorio no contiene una copia autoritativa de `firestore.rules`. La propuesta revisable está en `firestore.rules.proposed` y su explicación en [`firestore-checkin-numbering-rules-proposal.md`](firestore-checkin-numbering-rules-proposal.md). No se desplegó ninguna regla durante esta corrección.

## Qué protege

- Solo un `usuarios/{uid}` activo, con `rol: 'cliente'` y el `eventId` incluido en `eventosPermitidos` puede entrar al Portal.
- El evento debe habilitar explícitamente `funcionalidades.portalCliente`; los check-ins requieren además `funcionalidades.checkInQR`.
- Un cliente solo lee su evento, sus invitados y, si tiene `historialAccesos`, su historial.
- El update de un invitado permite exclusivamente `pasesUtilizados`, `pasesDisponibles`, `llegadaRegistrada`, `horaLlegada`, `estado`, `fechaActualizacion`, `checkinSecuencia` y `ultimoCheckinId`.
- La regla no permite modificar nombre, correo, teléfono, mesa, total de pases, `qrToken`, `qrActivo`, perfiles ni entitlements.
- Cada lado de la transacción exige al otro mediante `existsAfter()`/`getAfter()`: no se puede incrementar `checkinSecuencia` sin crear el historial correlacionado ni crear historial sin actualizar al invitado.
- El cliente Portal no recibe `update` sobre `eventos/{eventId}`; `estadisticas` debe reconciliarse desde confianza administrativa o backend.

Los documentos nuevos y los que usen el portal deben guardar `pases` como entero positivo. Firestore Rules no puede convertir un string como `"2"` a número; un documento legado con ese formato debe corregirse desde una herramienta administrativa, no desde el portal.

## Publicación manual

1. En Firebase Console abre el proyecto **eventorastudio-d6d95** y ve a **Firestore Database → Rules**.
2. Guarda una copia de las reglas de producción actuales fuera de este repositorio.
3. Compara `firestore.rules` con `firestore.rules.proposed` y fusiona las validaciones de invitado/check-in sin reemplazar rutas administrativas adicionales.
4. Revisa y publica manualmente la regla fusionada solo después de probarla; esta tarea no la desplegó.
5. Prueba con Emulator Suite o con cuentas de prueba los casos de permisos, evento ajeno, entitlement desactivado, documento legado y doble check-in concurrente antes de usarla en un evento real.

No publiques esta política a ciegas si la aplicación ADMIN tiene rutas Firestore adicionales no representadas en este repositorio: la regla raíz es restrictiva deliberadamente y necesita incorporar sus permisos seguros existentes.
