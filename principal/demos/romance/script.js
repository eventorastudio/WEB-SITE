const EVENT = Object.freeze({
  demoMode: true,
  title: 'la boda de Sofía y Mateo',
  date: '2027-08-07T17:30:00-06:00',
  music: '../xv-renatta/musica.mp3',
  links: {
    maps: 'https://www.google.com/maps/search/?api=1&query=Arteaga+Coahuila',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Sofia+y+Mateo',
    gifts: 'https://www.amazon.com.mx/',
    instagram: 'https://www.instagram.com/',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi asistencia a ${EVENT.title}. Soy ${guestName} y la invitación contempla ${passes} ${passes === 1 ? 'lugar' : 'lugares'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => guestName,
    guest: ({ guestName }) => `${guestName}, hay historias que solo están completas cuando se comparten.`,
    passes: ({ passes }) => passes === 1 ? 'Hemos guardado un lugar para ti.' : `Hemos guardado ${passes} lugares para ustedes.`
  },
  messages: {
    rsvp: 'En una invitación real, este botón permitirá confirmar tu asistencia directamente por WhatsApp.'
  }
});
EventoraDemo.mount(EVENT);
