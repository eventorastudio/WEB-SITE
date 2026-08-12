const EVENT = Object.freeze({
  demoMode: true,
  title: 'la ceremonia de Camila y Diego',
  date: '2027-11-15T17:00:00-06:00',
  music: '../xv-renatta/musica.mp3',
  links: {
    maps: 'https://www.google.com/maps/search/?api=1&query=Saltillo+Coahuila',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Camila+y+Diego',
    gifts: 'https://www.amazon.com.mx/',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi asistencia a ${EVENT.title}. Soy ${guestName}; la invitación contempla ${passes} ${passes === 1 ? 'lugar' : 'lugares'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => `${guestName} / ESTA EDICIÓN ES PARA TI.`,
    guest: ({ guestName }) => `${guestName} / ESTA INVITACIÓN ES PARA TI.`,
    passes: ({ passes }) => passes === 1 ? '01 LUGAR RESERVADO' : `${String(passes).padStart(2, '0')} LUGARES RESERVADOS`
  }
});
EventoraDemo.mount(EVENT);
