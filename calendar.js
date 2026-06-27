const { google } = require('googleapis');

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ['https://www.googleapis.com/auth/calendar']
);

const calendar = google.calendar({ version: 'v3', auth });

async function crearCita({ paciente, telefono, motivo, fechaHoraInicio, fechaHoraFin }) {
  const libre = await verificarDisponibilidad(fechaHoraInicio, fechaHoraFin);

  if (!libre) {
    return { ocupado: true };
  }

  const evento = {
    summary: `Cita: ${paciente}`,
    description: `Motivo: ${motivo}\nTeléfono: ${telefono}`,
    start: {
      dateTime: fechaHoraInicio,
      timeZone: 'America/Mexico_City',
    },
    end: {
      dateTime: fechaHoraFin,
      timeZone: 'America/Mexico_City',
    },
  };

  const respuesta = await calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    resource: evento,
  });

  return respuesta.data;
}

async function verificarDisponibilidad(fechaHoraInicio, fechaHoraFin) {
  const respuesta = await calendar.events.list({
    calendarId: GOOGLE_CALENDAR_ID,
    timeMin: fechaHoraInicio,
    timeMax: fechaHoraFin,
    timeZone: 'America/Mexico_City',
    singleEvents: true,
  });

  return respuesta.data.items.length === 0;
}

module.exports = { crearCita, verificarDisponibilidad };
