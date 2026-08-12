const EVENT = Object.freeze({
  demoMode: true,
  title: 'la boda de Julieta y Tomás',
  date: '2028-04-22T16:00:00-06:00',
  music: '../xv-renatta/musica.mp3',
  links: {
    maps: 'https://www.google.com/maps/search/?api=1&query=Jardin+de+Monet+San+Miguel+de+Allende',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Julieta+y+Tomas',
    gifts: 'https://www.amazon.com.mx/',
    hotel: 'https://www.google.com/travel/hotels/San+Miguel+de+Allende',
    transport: 'https://www.google.com/maps/',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi asistencia a ${EVENT.title}. Soy ${guestName} y tenemos ${passes} ${passes === 1 ? 'lugar en el jardín' : 'lugares en el jardín'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => `Las puertas del jardín se abren para ${guestName}.`,
    guest: ({ guestName }) => `${guestName}, ven a caminar este día con nosotros.`,
    passes: ({ passes }) => passes === 1 ? 'Una silla entre las flores.' : `${passes} sillas entre las flores.`
  }
});

EventoraDemo.mount(EVENT);
