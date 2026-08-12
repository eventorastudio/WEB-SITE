const EVENT = Object.freeze({
  demoMode: true,
  title: 'la boda de Elena y Gabriel',
  date: '2028-11-11T17:30:00-06:00',
  music: '../xv-renatta/musica.mp3',
  links: {
    maps: 'https://www.google.com/maps/search/?api=1&query=Hotel+Four+Seasons+Mexico+City',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Elena+y+Gabriel',
    gifts: 'https://www.amazon.com.mx/',
    hotel: 'https://www.google.com/travel/hotels/Mexico+City',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi asistencia a ${EVENT.title}. Soy ${guestName}; nuestra Guest Card contempla ${passes} ${passes === 1 ? 'lugar' : 'lugares'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => `Una edición luminosa reservada para ${guestName}.`,
    guest: ({ guestName }) => `${guestName}, brindaremos por este nuevo capítulo contigo.`,
    passes: ({ passes }) => passes === 1 ? 'Un lugar preparado para ti.' : `${passes} lugares preparados para ustedes.`
  }
});

EventoraDemo.mount(EVENT);
