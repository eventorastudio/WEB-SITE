# Storage para multimedia del Invitation Builder

## Estado auditado en Fase 4

- `admin/firebase.js` declara `storageBucket: "eventorastudio-d6d95.firebasestorage.app"`, pero no importa ni inicializa Firebase Storage.
- El módulo exporta una única app Firebase, Auth, Firestore y App Check. Fase 4 no creó una segunda app ni alteró App Check.
- No existe `firebase.json`, `.firebaserc` ni `storage.rules` operativo en este repositorio.
- No había servicio de Storage, `getStorage`, uploads reanudables, URLs de descarga ni borrado de objetos.
- Por lo anterior, un nombre de bucket en la configuración no prueba que el bucket esté operativo ni que sus Rules sean seguras.

Clasificación: **bucket referenciado; integración ausente; Rules locales ausentes; disponibilidad remota no verificada**.

El Builder funciona en `local-first`. `invitation-media-service.js` mantiene `canUpload: false`; no intenta escribir, borrar o consultar objetos remotos. `storage.rules.proposed` es sólo una propuesta no enlazada y no desplegada.

## Convención preparada

```text
eventos/{eventId}/invitacion/media/{role}/{mediaId}.{ext}
```

Roles permitidos: `cover`, `gallery`, `video`, `videoPoster`, `music`. El nombre original nunca forma parte del path. El documento futuro conservará metadatos, `storagePath` y `downloadUrl`; nunca `File`, `Blob`, Base64 o Data URL.

## Pasos manuales antes de habilitar uploads

1. Verificar en Firebase Console que el bucket pertenece al proyecto correcto, región, plan, retención, CORS y costos previstos.
2. Confirmar que los custom claims reales usan exclusivamente `CEO`, `ADMINISTRADOR` y `DISENADOR` para `invitations:edit`.
3. Revisar `storage.rules.proposed`, añadir pruebas de Rules en Emulator Suite y comprobar denegación para usuario sin claim, otro evento, path no permitido, MIME falso y sobrepeso.
4. Definir explícitamente la política de lectura pública de una invitación publicada. La propuesta actual permite lectura sólo al equipo interno y deniega el resto.
5. Decidir la política de App Check para Storage, habilitar enforcement primero en monitoreo y confirmar clientes autorizados.
6. Crear/revisar `firebase.json` y `.firebaserc` de forma consciente; no copiar una configuración de otro proyecto.
7. Integrar `getStorage(app)` en `admin/firebase.js`, reutilizando la app existente. No llamar `initializeApp()` de nuevo.
8. Implementar en `invitation-media-service.js` un único upload reanudable con cancelación, retry, progreso y borrado restringido al path propiedad del mismo evento.
9. Probar la integración completa en Emulator Suite y después en un evento no productivo con archivos ficticios.
10. Desplegar Rules sólo mediante una acción manual revisada. Cambiar `canUpload` a `true` únicamente después de validar Rules y App Check desplegados.
11. Para publicación, añadir una función backend que vuelva a verificar firma,
    MIME, dimensiones/duración y ownership; genere thumbnails derivados y, si el
    producto lo requiere, transcoding. La validación cliente y las Storage Rules
    no sustituyen esa inspección server-side.

## Límites técnicos actuales

| Recurso | Formatos | Entrada máxima | Duración | Procesado local |
| --- | --- | ---: | ---: | --- |
| Cover/galería/poster | JPEG, PNG, WebP | 20 MiB | — | decode, límite 40 MP, resize, re-encode y retiro de metadata |
| Video | MP4, WebM | 80 MiB | 5 min | metadata y decode del navegador; sin transcodificación |
| Música | MP3, M4A/AAC, OGG | 20 MiB | 15 min | metadata y decode del navegador; sin transcodificación |

Cover usa lado largo máximo de 2400 px; galería y poster, 1920 px. PNG conserva PNG para mantener alpha; JPEG y WebP se reencodan como WebP con calidad 0.88. El máximo técnico de galería es 20 y no representa una promesa comercial.

Estos límites controlan memoria, latencia y costo, pero no sustituyen cuotas, alertas de facturación, lifecycle rules, thumbnails server-side ni transcodificación futura.
