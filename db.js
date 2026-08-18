const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
// Crea las tablas si no existen
async function inicializarDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mensajes (
      id SERIAL PRIMARY KEY,
      telefono TEXT NOT NULL,
      rol TEXT NOT NULL,
      contenido TEXT NOT NULL,
      creado_en TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS citas (
      id SERIAL PRIMARY KEY,
      telefono TEXT NOT NULL,
      nombre TEXT NOT NULL,
      motivo TEXT NOT NULL,
      fecha_hora TIMESTAMP NOT NULL,
      recordatorio_enviado BOOLEAN DEFAULT FALSE,
      creado_en TIMESTAMP DEFAULT NOW()
    );
  `);
  // Columna nueva para poder cancelar citas (index.js ya llama a
  // cancelarCitaDB, pero esta tabla no tenía forma de marcar una cita como
  // cancelada). ADD COLUMN IF NOT EXISTS es seguro de correr aunque la tabla
  // ya exista en producción: no borra ni toca las filas existentes, y les
  // asigna el DEFAULT FALSE automáticamente.
  await pool.query(`
    ALTER TABLE citas ADD COLUMN IF NOT EXISTS cancelada BOOLEAN DEFAULT FALSE;
  `);
  console.log('Base de datos lista (tabla mensajes y citas verificadas)');
}
// Guarda un mensaje (entrante o saliente)
async function guardarMensaje(telefono, rol, contenido) {
  try {
    await pool.query(
      'INSERT INTO mensajes (telefono, rol, contenido) VALUES ($1, $2, $3)',
      [telefono, rol, contenido]
    );
  } catch (err) {
    console.error('Error guardando mensaje en DB:', err);
  }
}
// Guarda una cita agendada
async function guardarCita(telefono, nombre, motivo, fechaHoraInicio) {
  // A diferencia de guardarMensaje (donde perder un mensaje de log no es
  // grave), aquí SÍ se relanza el error: si el evento ya se creó en Google
  // Calendar pero esta escritura falla en silencio, el paciente recibe un
  // "tu cita quedó agendada" que en realidad no quedó registrada — no se le
  // enviaría recordatorio y "cancelar"/"reagendar" luego no encontrarían
  // nada. Mejor que el bot avise del problema que confirmar en falso.
  try {
    await pool.query(
      'INSERT INTO citas (telefono, nombre, motivo, fecha_hora) VALUES ($1, $2, $3, $4)',
      [telefono, nombre, motivo, fechaHoraInicio]
    );
  } catch (err) {
    console.error('Error guardando cita en DB:', err);
    throw err;
  }
}

// Obtiene la cita activa (no cancelada) más reciente de un teléfono.
// Faltaba por completo en este archivo, aunque index.js ya la usa para
// cancelar y reagendar citas.
async function obtenerCitaPorTelefono(telefono) {
  const resultado = await pool.query(
    `SELECT * FROM citas
     WHERE telefono = $1 AND cancelada = FALSE
     ORDER BY fecha_hora DESC
     LIMIT 1`,
    [telefono]
  );
  return resultado.rows[0] || null;
}

// Marca una cita como cancelada (no la borra, para conservar el historial).
// También faltaba: index.js ya la llama desde el flujo de cancelación.
async function cancelarCitaDB(id) {
  await pool.query('UPDATE citas SET cancelada = TRUE WHERE id = $1', [id]);
}

// Actualiza la fecha/hora de una cita reagendada.
// También faltaba. Importante: resetea recordatorio_enviado a FALSE, porque
// si no, una cita reagendada a otro día nunca recibiría su recordatorio (ya
// habría quedado marcada como "enviado" desde antes de moverla).
async function reagendarCitaDB(id, nuevaFechaHoraInicio) {
  await pool.query(
    'UPDATE citas SET fecha_hora = $1, recordatorio_enviado = FALSE WHERE id = $2',
    [nuevaFechaHoraInicio, id]
  );
}

// Obtiene citas de mañana que aún no han recibido recordatorio
async function obtenerCitasManana() {
  // Rango de mañana en hora de México
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const manana = new Date(ahora);
  manana.setDate(manana.getDate() + 1);
  manana.setHours(0, 0, 0, 0);
  const pasadoManana = new Date(manana);
  pasadoManana.setDate(pasadoManana.getDate() + 1);
  const resultado = await pool.query(
    `SELECT * FROM citas
     WHERE fecha_hora >= $1 AND fecha_hora < $2
     AND recordatorio_enviado = FALSE
     AND cancelada = FALSE`,
    [manana.toISOString(), pasadoManana.toISOString()]
  );
  return resultado.rows;
}
// Marca una cita como recordatorio enviado
async function marcarRecordatorioEnviado(id) {
  await pool.query(
    'UPDATE citas SET recordatorio_enviado = TRUE WHERE id = $1',
    [id]
  );
}
// Obtiene todos los mensajes de todos los números, ordenados cronológicamente
async function obtenerTodosLosMensajes() {
  const resultado = await pool.query(
    'SELECT telefono, rol, contenido, creado_en FROM mensajes ORDER BY creado_en ASC'
  );
  return resultado.rows;
}
// Obtiene el historial de un número
async function obtenerHistorial(telefono, limite = 20) {
  const resultado = await pool.query(
    'SELECT rol, contenido, creado_en FROM mensajes WHERE telefono = $1 ORDER BY creado_en DESC LIMIT $2',
    [telefono, limite]
  );
  return resultado.rows.reverse();
}
module.exports = {
  inicializarDB,
  guardarMensaje,
  guardarCita,
  obtenerCitaPorTelefono,
  cancelarCitaDB,
  reagendarCitaDB,
  obtenerCitasManana,
  marcarRecordatorioEnviado,
  obtenerTodosLosMensajes,
  obtenerHistorial
};
