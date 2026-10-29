# Audio de la portada

Coloca aquí el MP3 exclusivo de la pantalla inicial con este nombre:

`inicio.mp3`

Ruta pública final:

`/invitaciones/paulette/audio/inicio/inicio.mp3`

El archivo no se precarga. Solo se solicita cuando el visitante pulsa el control de audio de la portada. Al pulsar **Entrar a la fiesta**, este reproductor se pausa y vuelve a `currentTime = 0`.

Después de copiar el MP3, cambia `enabled: false` a `enabled: true` en `event-data.js` para activar esta pista.

