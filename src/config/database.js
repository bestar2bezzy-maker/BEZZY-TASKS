const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('./env');

let db;

function getDb() {
  if (!db) {
    const dbPath = path.resolve(env.DB_PATH);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }

  return db;
}

function initDb() {
  const database = getDb();
  const migrationsDir = path.join(__dirname, '../db/migrations');

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrations = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const hasMigration = database.prepare(
    'SELECT 1 FROM schema_migrations WHERE id = ?'
  );

  const markMigration = database.prepare(
    'INSERT INTO schema_migrations (id) VALUES (?)'
  );

  for (const file of migrations) {
    if (!hasMigration.get(file)) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      const transaction = database.transaction(() => {
        database.exec(sql);
        markMigration.run(file);
      });

      transaction();
    }
  }

  return database;
}

module.exports = {
  getDb,
  initDb
};
