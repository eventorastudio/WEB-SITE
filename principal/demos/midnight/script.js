const EVENT = Object.freeze({
  demoMode: true,
  title: 'los XV de Valentina',
  date: '2027-12-04T20:00:00-06:00',
  music: '../xv-renatta/musica.mp3',
  links: {
    maps: 'https://www.google.com/maps/search/?api=1&query=Centro+Convex+Monterrey',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=XV+Valentina',
    hotel: 'https://www.google.com/travel/hotels/Monterrey',
    gifts: 'https://www.amazon.com.mx/',
    instagram: 'https://www.instagram.com/',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi acceso a ${EVENT.title}. Soy ${guestName}; la invitación contempla ${passes} ${passes === 1 ? 'acceso' : 'accesos'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => `${guestName} · tu acceso privado está listo.`,
    guest: ({ guestName }) => `${guestName}, la noche tiene tu nombre.`,
    passes: ({ passes }) => passes === 1 ? '01 acceso en la guest list' : `${String(passes).padStart(2, '0')} accesos en la guest list`
  }
});
EventoraDemo.mount(EVENT);
