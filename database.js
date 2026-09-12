const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { env } = require('./env');
fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });
const db = new Database(env.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const migrationsDir = path.join(__dirname, '../db/migrations');
  for (const file of fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const tx = db.transaction(() => { db.exec(sql); db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(file); });
    tx();
  }
}
migrate();
module.exports = { db, migrate };
