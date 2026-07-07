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
  try {
    await pool.query(
      'INSERT INTO citas (telefono, nombre, motivo, fecha_hora) VALUES ($1, $2, $3, $4)',
      [telefono, nombre, motivo, fechaHoraInicio]
    );
  } catch (err) {
    console.error('Error guardando cita en DB:', err);
  }
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
     AND recordatorio_enviado = FALSE`,
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
  obtenerCitasManana,
  marcarRecordatorioEnviado,
  obtenerTodosLosMensajes,
  obtenerHistorial
};
