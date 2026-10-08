/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * CONFIGURATION DE LA PROGRESSION DES RÔLES
 * ============================================================
 *
 * Les quotas sont centralisés ici afin que le moteur de
 * progression n'ait pas de valeurs "en dur" dans le code.
 *
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS role_progression_config (
  role TEXT PRIMARY KEY,

  initial_required_users INTEGER NOT NULL DEFAULT 0,

  monthly_required_users INTEGER NOT NULL DEFAULT 0,

  promotion_target_role TEXT,

  is_active INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

/*
 * ============================================================
 * CONFIGURATION OFFICIELLE
 * ============================================================
 */

INSERT OR IGNORE INTO role_progression_config (
  role,
  initial_required_users,
  monthly_required_users,
  promotion_target_role
)
VALUES
  ('user', 0, 0, 'ambassadeur'),

  ('ambassadeur', 200, 100, 'moderateur'),

  ('moderateur', 500, 200, 'administrateur'),

  ('administrateur', 900, 300, 'elite'),

  ('elite', 1000, 500, NULL);
