const EVENT = Object.freeze({
  demoMode: true,
  title: 'los XV de Alexa',
  date: '2028-08-19T20:00:00-06:00',
  music: '../xv-renatta/musica.mp3',
  links: {
    maps: 'https://www.google.com/maps/search/?api=1&query=Foro+Tendenza+Monterrey',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=XV+Alexa',
    gifts: 'https://www.amazon.com.mx/',
    hotel: 'https://www.google.com/travel/hotels/Monterrey',
    instagram: 'https://www.instagram.com/',
    transport: 'https://www.google.com/maps/',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi acceso a ${EVENT.title}. Soy ${guestName}; el ALL ACCESS PASS incluye ${passes} ${passes === 1 ? 'acceso' : 'accesos'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => `${guestName} · YOUR NAME IS ON THE POSTER.`,
    guest: ({ guestName }) => `${guestName}, estás oficialmente en el lineup.`,
    passes: ({ passes }) => passes === 1 ? '01 ALL ACCESS PASS' : `${String(passes).padStart(2, '0')} ALL ACCESS PASSES`
  }
});

EventoraDemo.mount(EVENT);
