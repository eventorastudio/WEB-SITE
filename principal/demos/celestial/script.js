const EVENT = Object.freeze({
  demoMode: true,
  title: 'la boda de Isabella y Santiago',
  date: '2028-05-27T18:00:00-06:00',
  music: '../xv-renatta/musica.mp3',
  links: {
    maps: 'https://www.google.com/maps/search/?api=1&query=Observatorio+Arteaga+Coahuila',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Isabella+y+Santiago',
    gifts: 'https://www.amazon.com.mx/',
    hotel: 'https://www.google.com/travel/hotels/Arteaga',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi asistencia a ${EVENT.title}. Soy ${guestName} y nuestra invitación contempla ${passes} ${passes === 1 ? 'lugar' : 'lugares'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => `Una constelación reservada para ${guestName}.`,
    guest: ({ guestName }) => `${guestName}, tu nombre ya forma parte de esta noche.`,
    passes: ({ passes }) => passes === 1 ? 'Una estrella reservada para ti.' : `${passes} estrellas reservadas para ustedes.`
  }
});

EventoraDemo.mount(EVENT);
