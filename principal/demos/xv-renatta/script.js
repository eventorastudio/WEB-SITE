const EVENT = Object.freeze({
  demoMode: true,
  title: 'los XV de Renatta',
  date: '2027-06-20T17:00:00-06:00',
  music: 'musica.mp3',
  links: {
    maps: 'https://maps.app.goo.gl/o7g5fjQbHxmXxnxK7',
    calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=XV+Renatta',
    gifts: 'https://www.amazon.com.mx/',
    instagram: 'https://www.instagram.com/',
    rsvp: ({ guestName, passes }) => `https://wa.me/528443884334?text=${encodeURIComponent(`Hola, confirmo mi asistencia a ${EVENT.title}. Soy ${guestName} y tenemos ${passes} ${passes === 1 ? 'lugar reservado' : 'lugares reservados'}.`)}`
  },
  copy: {
    opening: ({ guestName }) => `Una postal reservada para ${guestName}.`,
    guest: ({ guestName }) => `Aloha, ${guestName}. Esta celebración tiene tu nombre en la lista.`,
    passes: ({ passes }) => passes === 1 ? '1 acceso reservado para ti' : `${passes} accesos reservados para ustedes`
  },
  messages: {
    maps: 'En la invitación real, este botón abrirá Google Maps con la ubicación de la pool party.',
    calendar: 'En la invitación real, esta opción permitirá guardar los XV de Renatta en el calendario.',
    gifts: 'En la invitación real, este botón llevará a la mesa de regalos configurada por los anfitriones.',
    instagram: 'En la invitación final, este enlace podrá dirigir al perfil y hashtag de la celebración.',
    rsvp: 'En la invitación real, este botón permitirá confirmar asistencia directamente por WhatsApp.'
  }
});

EventoraDemo.mount(EVENT);
