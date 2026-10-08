/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * HISTORIQUE MENSUEL DES PERFORMANCES DE RÔLE
 * ============================================================
 *
 * Cette table conserve l'évaluation mensuelle de chaque membre
 * participant au système de progression des rôles.
 *
 * Elle permettra de conserver l'historique des :
 *
 * - utilisateurs actifs apportés
 * - quotas requis
 * - scores Bezzy
 * - décisions mensuelles
 * - promotions
 * - maintiens
 * - rétrogradations
 *
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS role_monthly_performance (
  id TEXT PRIMARY KEY,

  user_id TEXT NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  role_at_evaluation TEXT NOT NULL,

  evaluation_year INTEGER NOT NULL,

  evaluation_month INTEGER NOT NULL,

  active_referred_users INTEGER NOT NULL DEFAULT 0,

  required_active_users INTEGER NOT NULL DEFAULT 0,

  bezzy_score INTEGER NOT NULL DEFAULT 0,

  quota_reached INTEGER NOT NULL DEFAULT 0,

  anti_fraud_passed INTEGER NOT NULL DEFAULT 1,

  decision TEXT NOT NULL DEFAULT 'PENDING',

  next_role TEXT,

  evaluated_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    user_id,
    evaluation_year,
    evaluation_month
  )
);

CREATE INDEX IF NOT EXISTS idx_role_monthly_performance_user
ON role_monthly_performance(user_id);

CREATE INDEX IF NOT EXISTS idx_role_monthly_performance_period
ON role_monthly_performance(
  evaluation_year,
  evaluation_month
);

CREATE INDEX IF NOT EXISTS idx_role_monthly_performance_decision
ON role_monthly_performance(decision);
