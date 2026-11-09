
const { getPostgresPool } = require('../src/config/postgres');

const AUTH_TABLES = [
  'users',
  'email_verification_tokens',
  'password_reset_tokens',
  'refresh_tokens'
];

async function main() {
  let pool;

  try {
    pool = getPostgresPool();

    const connection = await pool.query(`
      SELECT current_database() AS database_name,
             current_schema() AS schema_name
    `);

    console.log('Connexion PostgreSQL : OK');
    console.log('Base :', connection.rows[0].database_name);
    console.log('Schéma :', connection.rows[0].schema_name);

    const columnsResult = await pool.query(`
      SELECT table_name,
             column_name,
             data_type,
             is_nullable,
             column_default,
             ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position
    `, [AUTH_TABLES]);

    const foundTables = new Set(
      columnsResult.rows.map(row => row.table_name)
    );

    console.log('\n=== COLONNES ET TYPES ===');

    for (const table of AUTH_TABLES) {
      console.log(`\nTABLE : ${table}`);

      if (!foundTables.has(table)) {
        console.log('  TABLE ABSENTE');
        continue;
      }

      for (const row of columnsResult.rows.filter(
        item => item.table_name === table
      )) {
        console.log(
          `  ${row.column_name} | type=${row.data_type}` +
          ` | nullable=${row.is_nullable}` +
          ` | default=${row.column_default ?? 'NULL'}`
        );
      }
    }

    const constraintsResult = await pool.query(`
      SELECT
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_catalog = kcu.constraint_catalog
       AND tc.constraint_schema = kcu.constraint_schema
       AND tc.constraint_name = kcu.constraint_name
       AND tc.table_name = kcu.table_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_catalog = ccu.constraint_catalog
       AND tc.constraint_schema = ccu.constraint_schema
       AND tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = ANY($1::text[])
      ORDER BY
        tc.table_name,
        tc.constraint_type,
        tc.constraint_name
    `, [AUTH_TABLES]);

    console.log('\n=== CONTRAINTES D’AUTHENTIFICATION ===');

    if (constraintsResult.rows.length === 0) {
      console.log('Aucune contrainte trouvée.');
    }

    for (const row of constraintsResult.rows) {
      const reference = row.foreign_table_name
        ? `${row.foreign_table_name}.${row.foreign_column_name}`
        : 'N/A';

      console.log(
        `  ${row.table_name} | ${row.constraint_type}` +
        ` | ${row.constraint_name}` +
        ` | colonne=${row.column_name ?? 'N/A'}` +
        ` | référence=${reference}`
      );
    }

    const countResult = await pool.query(`
      SELECT COUNT(*)::int AS user_count
      FROM users
    `);

    console.log(
      '\nNombre de comptes dans Neon :',
      countResult.rows[0].user_count
    );

    console.log(
      'Diagnostic en lecture seule : aucune donnée modifiée.'
    );
  } catch (error) {
    console.error('Échec du diagnostic PostgreSQL.');
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
      
