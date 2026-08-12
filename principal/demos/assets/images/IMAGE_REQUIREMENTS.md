# Auditoría y requisitos fotográficos

Auditoría realizada el 12 de agosto de 2026 antes de descargar nuevos recursos. La arquitectura Prestige, `EVENT_CONFIG`, `demoMode` y los controles funcionales quedan fuera del alcance de sustitución.

## Criterio general

- Objetivo por colección: 4 fotografías locales, únicas y curadas (hero, escena/venue y dos imágenes de galería o detalle).
- Heroes: archivo WebP de hasta 1920 px, no lazy, con recorte móvil específico.
- Galerías y escenas secundarias: WebP de hasta 1200–1400 px, cargadas de forma diferida cuando se representen con `<img>`.
- Los fondos CSS conservarán proporciones estables mediante `aspect-ratio` o alturas existentes.
- No se sustituirán secciones donde la tipografía, el espacio negativo o la ilustración aporten más que una fotografía.

## Mapa por colección

| Colección | Superficie auditada | Recurso actual / problema | Fotografía ideal |
|---|---|---|---|
| Aloha | Hero `.hero` | `fondo.png`; fotografía repetida y PNG pesado | Resort tropical luminoso con piscina, palmeras y cielo cálido; espacio para texto a la izquierda |
| Aloha | Poster `.film-poster` | Ilustración genérica CSS | Detalle de hibisco o coctelería tropical elegante |
| Aloha | Ubicación `.location-visual` | Repite `fondo.png` | Agua turquesa y arquitectura de resort, encuadre horizontal |
| Aloha | Galería `.postcard-card` | La misma imagen tres veces | Tres escenas distintas: piscina, vegetación/flores y celebración veraniega |
| Aloha | Dress code | `dresscode.png` de 1.9 MB | Mantener solo si la optimización conserva calidad; reemplazar por moda tropical si mejora |
| Luxury | Hero `.hero-visual` | Silueta CSS oscura | Retrato editorial black-tie, preferentemente espalda/perfil, negros profundos |
| Luxury | Video `.film-frame` | Gradiente abstracto | Hotel o recepción oscura con blanco, cristal y champagne |
| Luxury | Venue `.venue-photo` | Gradiente marrón sin espacio real | Salón de lujo sobrio, mármol o luz arquitectónica |
| Luxury | Dress `.dress-figures` | Dos siluetas CSS | Tuxedo y vestido editorial sin rusticidad |
| Luxury | Galería `.gallery-grid span` | Tres gradientes | Pareja black-tie, mesa blanca/negra y detalle champagne, todos distintos |
| Botanical | Hero `.hero-art` | Planta ilustrada CSS | Vegetación refinada, hojas y luz natural; composición orgánica |
| Botanical | Video `.moving-herbarium` | Hojas CSS animadas | Herbario, invernadero o follaje en movimiento visual |
| Botanical | Dress `.garden-frame` | Gradiente verde genérico | Textura de eucalipto/hojas y tonos salvia |
| Botanical | Galería `.memory-strip div` | Tres gradientes | Invernadero, mesa con eucalipto y detalle botánico editorial |
| Midnight | Hero `.hero-light` | Silueta CSS | Retrato nocturno elegante o salón azul profundo, sin estética cyberpunk |
| Midnight | Video `.film-light` | Haz de luz abstracto | Fiesta nocturna sofisticada con iluminación azul |
| Midnight | Venue `.venue-image` | Skyline CSS | Salón/city lights nocturno con lectura arquitectónica |
| Midnight | Dress `.silhouettes` | Siluetas CSS | Moda formal nocturna en azul, negro y plata |
| Midnight | Galería `.night-gallery div` | Tres gradientes | Retrato nocturno, ballroom azul y detalle de luces/plata |
| Romance | Hero `.portrait` | Retrato simulado con gradientes | Pareja íntima o manos, luz suave, paleta vino/blush |
| Romance | Video `.film-letter` | Carta CSS | Cartas, votos, manos o papelería romántica |
| Romance | Venue `.venue-card.featured` | Bloque vino sin imagen | Ceremonia íntima a la luz de velas |
| Romance | Galería `.photo-story div` | Tres gradientes | Historia en tres tiempos: manos, bouquet y pareja/silueta |
| Minimal | Hero `.hero-crop` | Silueta geométrica CSS | Retrato bridal limpio con espacio negativo y arquitectura moderna |
| Minimal | Video `.motion-frame` | Banda abstracta | Arquitectura neutra o moda editorial monocroma |
| Minimal | Editorial `.editorial-image` | Gradiente full-screen | Espacio arquitectónico blanco/gris con sujeto pequeño |
| Minimal | Galería `.gallery div` | Dos gradientes | Detalle floral blanco y composición arquitectónica minimalista |
| Celestial | Hero (composición lunar) | Cielo y órbitas CSS | Celebración real durante blue hour o pareja bajo cielo nocturno |
| Celestial | Video `.eclipse-frame` | Eclipse CSS | Luna/cielo nocturno real, elegante y poco saturado |
| Celestial | Lugares / dress | Fondos abstractos | Recepción exterior con velas, azul tinta y plata |
| Celestial | Galería `.floating-archive figure` | Cuatro gradientes | Blue hour, mesa con velas, silueta nocturna y detalle luminoso |
| Vintage | Hero `.lead-photo` | Retrato simulado CSS | Pareja o novia con estética analógica y arquitectura clásica |
| Vintage | Video `.film-strip` | Tres gradientes | Cámara de película y fotogramas reales |
| Vintage | Venue `.venue-cut` | Arquitectura simulada | Interior clásico europeo o automóvil antiguo |
| Vintage | Galería `.analog-album figure` | Gradientes en marcos | Papel/cartas, coche clásico, cámara y momento B&N |
| Garden | Hero `.garden-depth` | Jardín ilustrado CSS | Jardín europeo con arco, flores y arquitectura exterior |
| Garden | Video `.pergola-frame` | Pérgola CSS | Pérgola/fuente real con luz de primavera |
| Garden | Dress `.floral-frame` | Hojas CSS | Vestimenta en exterior floral, tonos pastel |
| Garden | Galería `.garden-album figure` | Gradientes | Arco floral, mesa exterior, fuente/pérgola y detalle de flores |
| Champagne | Hero `.hero-photo` | Silueta CSS beige | Editorial bridal luminosa, marfil y champagne, con cristal/luz |
| Champagne | Video `.glass-frame` | Vidrio abstracto CSS | Copas de champagne y reflejos de cristal |
| Champagne | Venue `.venue-photo` | Gradiente beige | Recepción luminosa en hotel, flores crema y dorado suave |
| Champagne | Dress `.silk-look` | Siluetas CSS | Seda/marfil editorial con contraste suficiente |
| Champagne | Galería `.editorial-gallery figure` | Tres gradientes | Cristal, mesa, novia editorial y detalle de seda, sin exceso amarillo |
| Neon Party | Hero `.flash-photo` | Silueta CSS | Flash editorial de fiesta con magenta/violeta y sujeto no frontal |
| Neon Party | Video `.motion-poster` | Póster abstracto | DJ o dancefloor premium con iluminación controlada |
| Neon Party | Venue `.venue-poster` | Gradiente azul/violeta | Club elegante o booth de DJ, no rave/cyberpunk |
| Neon Party | Dress `.look-poster` | Silueta CSS | Moda nocturna con flash y pieza protagonista |
| Neon Party | Galería `.flash-collage figure` | Tres gradientes | DJ, pista y momento de celebración con encuadres distintos |

## Estado inicial de peso

- Aloha contiene aproximadamente 15.9 MB de recursos locales, dominados por `musica.mp3`, `FONDO1.png`, `fondo.png` y `dresscode.png`.
- Las otras diez colecciones no contienen imágenes raster locales propias; su peso fotográfico inicial es 0 bytes.
- La medición final separará fotografía añadida de audio y recursos funcionales existentes.
