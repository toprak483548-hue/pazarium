const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL bulunamadı. Neon PostgreSQL bağlantını Render Environment veya .env içine ekle.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? undefined : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined)
});

pool.on('error', (error) => {
  console.error('Beklenmeyen PostgreSQL havuz hatası:', error.message);
});

async function initializeDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, 'sql', 'schema.sql'), 'utf8');
  await pool.query(schema);
}

module.exports = { pool, initializeDatabase };
