const { createSign } = require('crypto');
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
// Calendario exclusivo de la sucursal División del Norte. Las citas de
// Torres Adalid (y las anteriores a que existieran dos sucursales) usan
// GOOGLE_CALENDAR_ID. Este calendario debe estar compartido con la cuenta de
// servicio (con permiso para "Hacer cambios en eventos").
const GOOGLE_CALENDAR_ID_DIVISION_DEL_NORTE = process.env.GOOGLE_CALENDAR_ID_DIVISION_DEL_NORTE;

// Devuelve el ID del calendario que corresponde a una sucursal. Si piden
// División del Norte y no está configurado su calendario, lanza error en vez
// de agendar en el calendario equivocado sin avisar.
function calendarIdPara(sucursal) {
  if (sucursal === 'División del Norte') {
    if (!GOOGLE_CALENDAR_ID_DIVISION_DEL_NORTE) {
      throw new Error('Falta la variable de entorno GOOGLE_CALENDAR_ID_DIVISION_DEL_NORTE');
    }
    return GOOGLE_CALENDAR_ID_DIVISION_DEL_NORTE;
  }
  return GOOGLE_CALENDAR_ID;
}
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf8')
);

// Color de los eventos de valoración en Google Calendar.
// Google Calendar solo admite los 11 colores predefinidos de su paleta
// (colorId '1' a '11'); no acepta códigos hex libres. '4' = "Flamingo",
// el tono más parecido a rosa (salmón/coral rosado) disponible.
const COLOR_ID_ROSA = '4';

function generarJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(credentials.private_key, 'base64url');
  return `${header}.${payload}.${signature}`;
}
async function obtenerAccessToken() {
  const jwt = generarJWT();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('No se pudo obtener access token: ' + JSON.stringify(data));
  return data.access_token;
}
function agregarZonaHoraria(fechaISO) {
  if (fechaISO.includes('+') || fechaISO.includes('Z') || /[+-]\d{2}:\d{2}$/.test(fechaISO)) {
    return fechaISO;
  }
  return fechaISO + '-06:00';
}
async function verificarDisponibilidad(fechaHoraInicio, fechaHoraFin, sucursal) {
  const calendarId = calendarIdPara(sucursal);
  const token = await obtenerAccessToken();
  const params = new URLSearchParams({
    timeMin: agregarZonaHoraria(fechaHoraInicio),
    timeMax: agregarZonaHoraria(fechaHoraFin),
    singleEvents: 'true',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.items.length === 0;
}
const DIRECCIONES_SUCURSAL = {
  'Torres Adalid': 'Torres Adalid 205, INT 201, Colonia Del Valle, CDMX',
  'División del Norte': 'Avenida División del Norte 1354, Piso 2, Consultorio 202, Colonia Letrán Valle, Benito Juárez, CDMX',
};
async function crearCita({ paciente, telefono, motivo, sucursal, fechaHoraInicio, fechaHoraFin }) {
  const calendarId = calendarIdPara(sucursal);
  const libre = await verificarDisponibilidad(fechaHoraInicio, fechaHoraFin, sucursal);
  if (!libre) return { ocupado: true };
  const token = await obtenerAccessToken();
  const evento = {
    summary: `Cita: ${paciente}`,
    description: `Motivo: ${motivo}\nSucursal: ${sucursal || 'No especificada'}\nTeléfono: ${telefono}`,
    ...(DIRECCIONES_SUCURSAL[sucursal] ? { location: DIRECCIONES_SUCURSAL[sucursal] } : {}),
    start: { dateTime: agregarZonaHoraria(fechaHoraInicio), timeZone: 'America/Mexico_City' },
    end: { dateTime: agregarZonaHoraria(fechaHoraFin), timeZone: 'America/Mexico_City' },
    colorId: COLOR_ID_ROSA,
  };
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(evento),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}

// --- Las siguientes tres funciones faltaban por completo en este archivo,
// aunque index.js ya las importa y las usa para cancelar/reagendar citas.
// Sin ellas, esos dos flujos fallaban en tiempo de ejecución. ---

async function buscarEventoCalendar(nombrePaciente, fechaHoraAprox, sucursal) {
  const calendarId = calendarIdPara(sucursal);
  const token = await obtenerAccessToken();
  const inicioISO = agregarZonaHoraria(fechaHoraAprox);
  const inicio = new Date(inicioISO);

  // Ventana amplia alrededor de la hora guardada en la base de datos, por si
  // hubiera alguna pequeña diferencia de formato/segundos.
  const desde = new Date(inicio.getTime() - 60 * 60 * 1000).toISOString();
  const hasta = new Date(inicio.getTime() + 3 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin: desde,
    timeMax: hasta,
    singleEvents: 'true',
    q: nombrePaciente,
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  if (!data.items || data.items.length === 0) return null;

  // Si hay más de un resultado (poco probable), toma el más cercano a la
  // fecha/hora buscada.
  const objetivo = inicio.getTime();
  data.items.sort((a, b) => {
    const ta = new Date(a.start?.dateTime || a.start?.date).getTime();
    const tb = new Date(b.start?.dateTime || b.start?.date).getTime();
    return Math.abs(ta - objetivo) - Math.abs(tb - objetivo);
  });
  return data.items[0];
}

async function cancelarEventoCalendar(eventId, sucursal) {
  const calendarId = calendarIdPara(sucursal);
  const token = await obtenerAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
  // Google responde 204 sin cuerpo cuando el borrado sale bien.
  if (res.status !== 204 && res.status !== 200) {
    const data = await res.json().catch(() => ({}));
    throw new Error(JSON.stringify(data.error || { status: res.status }));
  }
  return true;
}

async function reagendarEventoCalendar(eventId, nuevaFechaHoraInicio, nuevaFechaHoraFin, sucursal) {
  const calendarId = calendarIdPara(sucursal);
  const token = await obtenerAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { dateTime: agregarZonaHoraria(nuevaFechaHoraInicio), timeZone: 'America/Mexico_City' },
        end: { dateTime: agregarZonaHoraria(nuevaFechaHoraFin), timeZone: 'America/Mexico_City' },
      }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}

module.exports = {
  crearCita,
  verificarDisponibilidad,
  cancelarEventoCalendar,
  buscarEventoCalendar,
  reagendarEventoCalendar,
};
