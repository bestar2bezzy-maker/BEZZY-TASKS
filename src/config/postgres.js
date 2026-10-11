
const { Pool } = require('pg');
const env = require('./env');

let pool;

function getPostgresPool() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: true
      },
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });
  }

  return pool;
}

async function checkPostgresConnection() {
  const client = await getPostgresPool().connect();

  try {
    const result = await client.query(`
      SELECT
        NOW() AS server_time,
        current_database() AS database_name
    `);

    return result.rows[0];
  } finally {
    client.release();
  }
}

module.exports = {
  getPostgresPool,
  checkPostgresConnection
};
        
