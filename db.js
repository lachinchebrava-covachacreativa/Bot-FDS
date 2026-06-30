const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Crea la tabla si no existe (se llama una vez al iniciar el servidor)
async function inicializarDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mensajes (
      id SERIAL PRIMARY KEY,
      telefono TEXT NOT NULL,
      rol TEXT NOT NULL, -- 'user' o 'assistant'
      contenido TEXT NOT NULL,
      creado_en TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Base de datos lista (tabla mensajes verificada)');
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

// Obtiene el historial de un número (los últimos N mensajes, en orden cronológico)
async function obtenerHistorial(telefono, limite = 20) {
  const resultado = await pool.query(
    'SELECT rol, contenido, creado_en FROM mensajes WHERE telefono = $1 ORDER BY creado_en DESC LIMIT $2',
    [telefono, limite]
  );
  return resultado.rows.reverse(); // orden cronológico ascendente
}

// Obtiene todos los mensajes de todos los números, ordenados cronológicamente
async function obtenerTodosLosMensajes() {
  const resultado = await pool.query(
    'SELECT telefono, rol, contenido, creado_en FROM mensajes ORDER BY creado_en ASC'
  );
  return resultado.rows;
}

module.exports = { inicializarDB, guardarMensaje, obtenerHistorial, obtenerTodosLosMensajes };
