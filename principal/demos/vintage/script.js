const EVENT = Object.freeze({
  demoMode: true,
  title: 'la boda de Emilia y Nicolás',
  date: '2028-09-16T16:30:00-06:00',
  music: '../xv-renatta/musica.mp3',
  links: {
    maps: 'https://www.google.com/maps/search/?api=1&query=Hacienda+San+Lorenzo+Parras',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Emilia+y+Nicolas',
    gifts: 'https://www.amazon.com.mx/',
    hotel: 'https://www.google.com/travel/hotels/Parras',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi asistencia a ${EVENT.title}. Soy ${guestName}; el boleto contempla ${passes} ${passes === 1 ? 'entrada' : 'entradas'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => `Correspondencia especial para ${guestName}.`,
    guest: ({ guestName }) => `${guestName}, guardamos esta edición de nuestra historia para ti.`,
    passes: ({ passes }) => passes === 1 ? 'Una entrada numerada.' : `${passes} entradas numeradas.`
  }
});

EventoraDemo.mount(EVENT);
