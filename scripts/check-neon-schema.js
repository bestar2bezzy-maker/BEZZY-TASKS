
const { getPostgresPool } = require('../src/config/postgres');

const REQUIRED_TABLES = [
  'users',
  'tasks',
  'task_completions',
  'ledger_entries',
  'email_verification_tokens',
  'password_reset_tokens',
  'refresh_tokens',
  'notifications',
  'audit_logs',
  'fraud_events',
  'schema_migrations',
  'active_user_config',
  'role_progression_config',
  'permission_catalog',
  'role_permissions',
  'role_monthly_performance',
  'feature_registry',
  'advertiser_accounts',
  'advertiser_transactions',
  'campaign_budgets',
  'partner_user_mappings',
  'task_verification_events'
];

async function main() {
  const pool = getPostgresPool();

  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);

    const existing = new Set(
      result.rows.map((row) => row.table_name)
    );

    const missing = REQUIRED_TABLES.filter(
      (name) => !existing.has(name)
    );

    console.log(`Tables requises : ${REQUIRED_TABLES.length}`);
    console.log(
      `Tables trouvées : ${REQUIRED_TABLES.length - missing.length}`
    );

    if (missing.length > 0) {
      console.error('Tables manquantes :');
      missing.forEach((name) => console.error(`- ${name}`));
      process.exitCode = 1;
      return;
    }

    console.log('Structure de base Neon : OK');
    console.log(
      'Aucune donnée n’a été créée, modifiée ou supprimée.'
    );
  } catch (error) {
    console.error('Impossible de vérifier la structure Neon.');
    console.error(
      'Type :',
      error.code || error.name || 'Erreur inconnue'
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
  
