# Demostraciones públicas

Portafolio Prestige de Eventora Studio:

- `xv-renatta/`: celebración tropical premium Aloha de Renatta.
- `luxury/`: boda editorial oscura de Victoria y Alejandro.
- `botanical/`: boda de jardín de Regina y Sebastián.
- `midnight/`: XV nocturnos de Valentina.
- `romance/`: boda narrativa de Sofía y Mateo.
- `minimal/`: ceremonia contemporánea de Camila y Diego.
- `celestial/`: boda lunar de Isabella y Santiago.
- `vintage/`: boda analógica de Emilia y Nicolás.
- `garden/`: celebración floral de Julieta y Tomás.
- `champagne/`: boda luminosa de Elena y Gabriel.
- `neon-party/`: XV en formato póster de Alexa.

Las once colecciones aceptan `?nombre=Andrea&pases=2`, usan fallback seguro y
reproducen audio únicamente después de abrir la invitación. El archivo compartido
`demo-runtime.js` concentra personalización, apertura, música, countdown, reveals
y el modo de demostración; cada `script.js` conserva su propio objeto `EVENT`.

Todas las demos públicas usan `demoMode: true`. Maps, WhatsApp, mesa de regalos,
hotel, Instagram y calendario abren un aviso interno accesible en vez de salir de
la página. Para convertir una colección en invitación real basta configurar sus
URLs y cambiar a `demoMode: false`; el runtime restaura los enlaces reales.

Las galerías de esta etapa son composiciones CSS locales preparadas para recibir
fotografías definitivas. Antes de convertirlas en plantillas de cliente conviene
reemplazarlas por imágenes optimizadas y autorizadas de cada evento, y sustituir
la pista musical compartida de Aloha por música licenciada específica para cada
colección. El audio se carga con `preload="none"`, por lo que no penaliza la carga
inicial.

## Contrato comercial Prestige

La fuente de verdad es `paquetes/index.html`. La página define paquetes
acumulativos: Premium incluye Esencial y Prestige incluye Premium. La matriz
encontrada es:

| Esencial | Premium (además de Esencial) | Prestige (además de Premium) |
| --- | --- | --- |
| Diseño 100% personalizado | Video de bienvenida | Múltiples ubicaciones |
| Música personalizada | Galería de fotografías | Itinerario del evento |
| Confirmación RSVP | Mesa de regalos | Pases personalizados |
| Cuenta regresiva | Selección inteligente de pases | Control avanzado de invitados |
| Google Maps | Más cambios incluidos | Personalización avanzada |
| Dress Code | Animaciones premium | Atención prioritaria |
| Compatible con cualquier dispositivo |  |  |
| Atención personalizada |  |  |

`prestige-contract.js` conserva la matriz textual y exporta
`PRESTIGE_DEMO_FEATURES`, el contrato de capacidades observables que deben
cumplir las once demos. Atención personalizada, más cambios incluidos y atención
prioritaria son beneficios del servicio; no se convierten artificialmente en
secciones de una invitación.

La auditoría de la demo arquitectónica original, su ruta, orden de secciones,
interacciones, problemas encontrados, matriz comparativa y decisiones
reutilizadas está en `PRESTIGE_ARCHITECTURE.md`.

Todas las colecciones muestran personalización por invitado, pases
personalizados con selección interna y vista digital/impresa, música, RSVP, cuenta regresiva, Google
Maps simulado, Dress Code, video de bienvenida ligero, galería, mesa de regalos,
animaciones, múltiples ubicaciones e itinerario. También conservan un ejemplo
propio de personalización avanzada:

- Aloha: programa tropical, pool notes y destinos de celebración.
- Luxury: agenda black-tie y concierge editorial.
- Botanical: ceremonia/recepción como recorrido de jardín y herbario en movimiento.
- Midnight: secuencia nocturna, segunda ubicación y night desk.
- Romance: historia de pareja, carta audiovisual e itinerario narrativo.
- Minimal: información adicional en bloques tipográficos y agenda indexada.
- Celestial: constelación del día, coordenadas y carta celeste.
- Vintage: periódico, programa impreso y archivo de película.
- Garden: espacios conectados por un sendero y álbum floral.
- Champagne: itinerario-jewel, concierge y editorial luminosa.
- Neon Party: lineup, location drop y party desk.

El texto visible común es **“Demostración Prestige”** y la aclaración indica que
**“las funciones pueden variar según el paquete contratado”**. No se afirma que
estas capacidades estén incluidas necesariamente en Esencial o Premium.
