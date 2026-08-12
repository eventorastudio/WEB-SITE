const EVENT = Object.freeze({
  demoMode: true,
  title: 'la boda de Regina y Sebastián',
  date: '2027-04-24T16:30:00-06:00',
  music: '../xv-renatta/musica.mp3',
  links: {
    maps: 'https://www.google.com/maps/search/?api=1&query=Arteaga+Coahuila',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Regina+y+Sebastian',
    gifts: 'https://www.amazon.com.mx/',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi asistencia a ${EVENT.title}. Soy ${guestName} y la invitación contempla ${passes} ${passes === 1 ? 'lugar' : 'lugares'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => `Una pieza de papelería reservada para ${guestName}.`,
    guest: ({ guestName }) => `${guestName}, nos encantará verte florecer con nosotros.`,
    passes: ({ passes }) => passes === 1 ? 'Una silla reservada en el jardín.' : `${passes} sillas reservadas en el jardín.`
  }
});
EventoraDemo.mount(EVENT);
