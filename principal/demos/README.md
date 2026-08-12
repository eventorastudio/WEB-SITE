# Demostraciones públicas

Primera etapa del portafolio Eventora Studio:

- `xv-renatta/`: Colección Aloha existente, conservada sin cambios.
- `luxury/`: boda editorial oscura de Victoria y Alejandro.
- `botanical/`: boda de jardín de Regina y Sebastián.
- `midnight/`: XV nocturnos de Valentina.
- `romance/`: boda narrativa de Sofía y Mateo.
- `minimal/`: ceremonia contemporánea de Camila y Diego.

Todas las nuevas colecciones aceptan `?nombre=Andrea&pases=2`, usan fallback
seguro, reproducen audio solo después de abrir la invitación y mantienen evento,
ubicación, WhatsApp y música en el objeto `EVENT` de su propio `script.js`.

Las galerías de esta etapa son composiciones CSS locales preparadas para recibir
fotografías definitivas. Antes de convertirlas en plantillas de cliente conviene
reemplazarlas por imágenes optimizadas y autorizadas de cada evento, y sustituir
la pista musical compartida de Aloha por música licenciada específica para cada
colección. El audio se carga con `preload="none"`, por lo que no penaliza la carga
inicial.

No forman parte de esta etapa Celestial, Vintage, Garden, Champagne ni Neon
Party.
