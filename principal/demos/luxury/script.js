const EVENT = Object.freeze({
  demoMode: true,
  title: 'la boda de Victoria y Alejandro',
  date: '2027-10-18T17:00:00-06:00',
  music: '../xv-renatta/musica.mp3',
  links: {
    maps: 'https://www.google.com/maps/search/?api=1&query=Casa+Madero+Parras+Coahuila',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Victoria+y+Alejandro',
    gifts: 'https://www.amazon.com.mx/',
    hotel: 'https://www.google.com/travel/hotels/Parras',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi asistencia a ${EVENT.title}. Soy ${guestName} y la invitación contempla ${passes} ${passes === 1 ? 'lugar' : 'lugares'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => `Edición privada reservada para ${guestName}.`,
    guest: ({ guestName }) => `Una invitación reservada especialmente para ${guestName}.`,
    passes: ({ passes }) => passes === 1 ? 'Un lugar en nuestra mesa.' : `${passes} lugares en nuestra mesa.`
  }
});
EventoraDemo.mount(EVENT);
