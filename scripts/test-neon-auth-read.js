
const { getPostgresPool } = require('../src/config/postgres');

async function main() {
  let pool;

  try {
    pool = getPostgresPool();

    const connection = await pool.query(`
      SELECT current_database() AS database_name,
             current_schema() AS schema_name
    `);

    const countResult = await pool.query(`
      SELECT COUNT(*)::int AS user_count
      FROM users
    `);

    const columnsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
    `);

    const columns = new Set(
      columnsResult.rows.map(row => row.column_name)
    );

    const required = [
      'id',
      'email',
      'password_hash',
      'google_sub'
    ];

    const missing = required.filter(
      name => !columns.has(name)
    );

    console.log('Connexion PostgreSQL : OK');
    console.log(
      'Base :',
      connection.rows[0].database_name
    );
    console.log(
      'Nombre de comptes :',
      countResult.rows[0].user_count
    );

    if (missing.length) {
      console.error(
        'Colonnes manquantes :',
        missing.join(', ')
      );
      process.exitCode = 1;
    } else {
      console.log('Colonnes nécessaires : OK');

      if (countResult.rows[0].user_count === 0) {
        console.log(
          'Aucun compte enregistré dans Neon pour le moment.'
        );
      } else {
        console.log(
          'Au moins un compte existe dans Neon.'
        );
      }
    }

    console.log(
      'Test en lecture seule : aucune donnée modifiée.'
    );
  } catch (error) {
    console.error('Échec du test PostgreSQL.');
    console.error(
      'Type :',
      error.code || error.name || 'Erreur inconnue'
    );

    if (error.message === 'DATABASE_URL is not configured') {
      console.error(
        'La variable DATABASE_URL n’est pas configurée dans cet environnement.'
      );
    }

    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

main();
  
