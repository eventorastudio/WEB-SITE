# Arquitectura de demostraciones Prestige

## Referencias y autoridad

- Referencia comercial: `/paquetes/index.html`, secciones `#esencial`,
  `#premium` y `#prestige`.
- Referencia arquitectónica: `/paquetes/demos/prestige/`.
- Entrada pública de la referencia: el enlace `Ver DEMO` de la tarjeta Prestige
  en `/paquetes/index.html`.
- Archivos propios: `paquetes/demos/prestige/index.html`, `demo.css` y `demo.js`.
- Contrato ejecutable: `principal/demos/prestige-contract.js`.

El Portal Prestige de clientes no forma parte de esta arquitectura.

## Auditoría de la demo Prestige encontrada

Antes de su modernización, el orden real era:

1. Loader y barra de progreso.
2. Control musical y audio.
3. Apertura mediante sobre Prestige.
4. Hero de María y Fernando.
5. Fotografía full-screen.
6. Bienvenida personalizada fija.
7. Video de historia.
8. Cuenta regresiva.
9. Galería de cuatro fotografías.
10. Dress Code para damas y caballeros.
11. Itinerario con ceremonia, recepción y after party.
12. Mesa de regalos con tiendas y transferencia.
13. RSVP con vistas de QR y pase impreso.
14. Retrato final.
15. Explicación de control de accesos, personalización y atención prioritaria.
16. CTA, footer y navegación flotante.

Sus interacciones incluían apertura animada, música después de abrir, video,
parallax, countdown, reveals con Intersection Observer, barra de progreso,
navegación flotante, selector QR/impreso y simulación de aceptar o rechazar.

Problemas encontrados antes de usarla como referencia mantenible:

- Datos del invitado, pases, fecha y lugares repartidos entre HTML y JS.
- Sin soporte para `?nombre=` y `?pases=`.
- Sin `demoMode`; varios botones podían navegar o no tenían destino funcional.
- Fotografías de Unsplash, video de W3Schools, QR remoto, Google Fonts y Lucide
  cargados por hotlink.
- El audio declarado (`assets/audio/music.mp3`) no existía.
- La vista mostraba dos pases asignados, pero no permitía seleccionar cuántos
  pases autorizados se utilizarían.
- El foco de la apertura y los avisos no seguía un contrato accesible común.
- El JS no tenía un objeto de configuración canónico.

## Comparación antes de esta revisión

Esta matriz registra el estado encontrado al iniciar la revisión actual. Las
seis colecciones ya tenían la primera etapa de paridad comercial; el hueco
arquitectónico principal frente a la demo original era la vista dual de acceso.

| Capacidad | Prestige original | Aloha | Luxury | Botanical | Midnight | Romance | Minimal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Apertura propia | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Hero propio | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Parámetros nombre/pases | No | Sí | Sí | Sí | Sí | Sí | Sí |
| Música tras interacción | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Video de bienvenida | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Countdown | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Galería | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Dress Code | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Itinerario | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Múltiples ubicaciones | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Mesa de regalos | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Selección de pases | No | Sí | Sí | Sí | Sí | Sí | Sí |
| Acceso digital/impreso | Sí | No | No | No | No | No | No |
| RSVP | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Navegación interna | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| Demo Mode externo | No | Sí | Sí | Sí | Sí | Sí | Sí |
| Assets sin hotlink | No | Sí | Sí | Sí | Sí | Sí | Sí |

## Cruce comercial

`paquetes/index.html` define Prestige de forma acumulativa: incluye Premium y
Premium incluye Esencial. La demo arquitectónica cubría la mayoría de esas
capacidades, pero presentaba esta inconsistencia:

**INCONSISTENCIA PRESTIGE DETECTADA**

- Paquetes: Premium (y por herencia Prestige) incluye **Selección inteligente
  de pases**.
- Demo Prestige anterior: mostraba dos pases fijos y solo permitía confirmar o
  declinar; no permitía elegir cuántos se utilizarían.

También había una brecha de implementación, no de promesa comercial: la demo
mostraba un nombre fijo y un QR remoto, aunque Prestige promete pases e
información personalizados.

Atención personalizada, más cambios incluidos y atención prioritaria son
beneficios operativos. Se documentan y pueden explicarse, pero no se exigen como
controles interactivos dentro de la invitación.

## Contrato final

`PRESTIGE_DEMO_ARCHITECTURE` define las secciones, interacciones y campos de
configuración. `PRESTIGE_DEMO_FEATURES` es la lista canónica usada por las
pruebas. El contrato exige:

- Apertura, hero, navegación interna y storytelling de bienvenida.
- Personalización segura por nombre y número autorizado de pases.
- Música solo después de interacción y un único audio activo.
- Video preparado para poster, play/pausa y archivo local definitivo.
- Countdown accesible, galería, Dress Code, itinerario y múltiples ubicaciones.
- Maps, regalos y otras acciones externas interceptadas por Demo Mode.
- RSVP, selección de pases, pase personalizado y vista digital/impresa.
- Animación premium con `prefers-reduced-motion`.
- Personalización avanzada, responsive mobile-first y aclaración comercial.
- `demoMode: false` capaz de restaurar los enlaces configurados.

La referencia renovada centraliza datos en `EVENT_CONFIG`, conserva las
secciones funcionales originales, reemplaza hotlinks por composiciones locales,
añade parámetros URL, selección de pases, Demo Notice accesible y Demo Mode.

## Once interpretaciones del acceso Prestige

- Aloha: pase digital de resort y postal impresa.
- Luxury: credencial privada y tarjeta de mesa black-tie.
- Botanical: acceso orgánico y papelería prensada.
- Midnight: guest code luminoso y silver ticket.
- Romance: carta digital y tarjeta impresa sellada.
- Minimal: índice digital y ticket tipográfico.
- Celestial: Celestial Pass y carta estelar impresa.
- Vintage: boleto digital numerado y entrada clásica.
- Garden: Garden Card y tarjeta de acceso al jardín.
- Champagne: Champagne Guest Card digital e impresa.
- Neon Party: All Access Pass y Wristband Card.

Estas vistas comparten comportamiento, no layout. Cada colección conserva su
propio `index.html`, `style.css`, apertura, hero, galería, itinerario, Dress Code,
regalos, CTA y ritmo visual.

## Segunda etapa visual

Las cinco colecciones añadidas conservan el mismo `demo-runtime.js`, el mismo
Demo Mode y el contrato dinámico `PRESTIGE_DEMO_FEATURES`. Se distinguen por su
apertura, hero, galería, itinerario, Dress Code y tratamiento de acceso:

- Celestial: constelación, luna parcial, itinerario estelar y archivo flotante.
- Vintage: postal desplegable, portada de periódico, álbum analógico y programa.
- Garden: puertas ornamentales, profundidad de jardín, sendero y carnet floral.
- Champagne: papelería y cristal, editorial luminosa y composición tipo joyería.
- Neon Party: póster digital, fotografía con flash, lineup y collage controlado.

Los espacios fotográficos son composiciones CSS locales. Para producción se
recomienda sustituirlos por fotografías autorizadas, optimizadas en AVIF/WebP y
con sus dimensiones declaradas, sin cambiar el contrato ni el runtime.
