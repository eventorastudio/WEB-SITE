# Inventario interno de tecnologías de privacidad y funcionamiento

Actualizado: 1 de septiembre de 2026. Inventario basado únicamente en el repositorio; no implica que un proveedor establezca cookies propias de Eventora.

| Tecnología | Proveedor | Finalidad | Persistencia | Área | Categoría | Observaciones |
|---|---|---|---|---|---|---|
| Firebase Authentication | Firebase / Google Cloud | Autenticación y mantenimiento de sesión | Local o sesión, según configuración | Admin / Portal | Funcional | `browserLocalPersistence` y `browserSessionPersistence` |
| localStorage | Navegador | Preferencias de tema, preferencias administrativas y flag de debug | Persistente | Admin / Portal | Funcional/técnica | No se usa para publicidad |
| Service Worker | Navegador | Caché y funcionamiento del Portal | Persistente | Portal | Técnica/funcional | No cachea rutas privadas ni solicitudes Firebase según el código |
| Cache API | Navegador | Caché de recursos estáticos del Portal | Persistente | Portal | Técnica/funcional | Cache `eventora-prestige-static-v4` |
| Firebase App Check | Firebase | Protección de áreas administrativas | Gestionada por SDK | Admin | Seguridad técnica | Usa reCAPTCHA v3 |
| reCAPTCHA v3 | Google | Señales de seguridad para App Check | Gestionada por proveedor | Admin | Seguridad técnica | No es analytics propio |
| Firebase/gstatic CDN | Google | Carga de SDK Firebase | Solicitud técnica | Admin / Portal / RSVP | Infraestructura/CDN | Puede recibir metadatos técnicos |
| Google Fonts | Google | Tipografías remotas | Solicitud técnica | Home / Paquetes / Admin / demos | Presentación/CDN | Sigue remoto en varias páginas |
| Lucide CDN | unpkg | Iconos | Solicitud técnica | Páginas legales / demos | Presentación/CDN | Algunas demos usan `latest` |
| Google Maps | Google | Mapas/enlaces de ubicación | Según proveedor | Demos / invitaciones | Servicio externo | Puede tratar datos técnicos propios |

## No detectado

No se detectaron `document.cookie`, `sessionStorage`, IndexedDB usado directamente, Google Analytics, GTM, Meta Pixel, TikTok Pixel, Hotjar, Mixpanel, Amplitude, PostHog, Clarity ni remarketing propio.
