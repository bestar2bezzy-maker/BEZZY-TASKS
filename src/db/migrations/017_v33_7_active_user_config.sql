/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * CONFIGURATION UTILISATEUR ACTIF
 * ============================================================
 *
 * Cette configuration définit les conditions minimales utilisées
 * par le moteur de progression pour déterminer si un utilisateur
 * peut être comptabilisé comme utilisateur actif.
 *
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS active_user_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  requires_verified_account INTEGER NOT NULL DEFAULT 1,

  requires_platform_activity INTEGER NOT NULL DEFAULT 1,

  minimum_activities INTEGER NOT NULL DEFAULT 1,

  activity_window_days INTEGER NOT NULL DEFAULT 30,

  anti_fraud_required INTEGER NOT NULL DEFAULT 1,

  is_active INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

/*
 * ============================================================
 * CONFIGURATION PAR DÉFAUT
 * ============================================================
 */

INSERT OR IGNORE INTO active_user_config (
  id,
  requires_verified_account,
  requires_platform_activity,
  minimum_activities,
  activity_window_days,
  anti_fraud_required
)
VALUES (
  1,
  1,
  1,
  1,
  30,
  1
);
