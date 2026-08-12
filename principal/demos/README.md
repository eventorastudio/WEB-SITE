# Demostraciones públicas

Primera etapa del portafolio Eventora Studio:

- `xv-renatta/`: celebración tropical premium Aloha de Renatta.
- `luxury/`: boda editorial oscura de Victoria y Alejandro.
- `botanical/`: boda de jardín de Regina y Sebastián.
- `midnight/`: XV nocturnos de Valentina.
- `romance/`: boda narrativa de Sofía y Mateo.
- `minimal/`: ceremonia contemporánea de Camila y Diego.

Las seis colecciones aceptan `?nombre=Andrea&pases=2`, usan fallback seguro y
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

No forman parte de esta etapa Celestial, Vintage, Garden, Champagne ni Neon
Party.
