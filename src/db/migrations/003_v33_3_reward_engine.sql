/*
 * ============================================================
 * BEZZY TASKS — REWARD ENGINE
 * V33.3
 * ============================================================
 *
 * Le montant payé par le partenaire devient la base
 * économique de l'offre.
 *
 * reward_minor reste conservé temporairement pour compatibilité.
 * Le Reward Engine deviendra progressivement la source
 * officielle du montant utilisateur.
 */

ALTER TABLE tasks
ADD COLUMN partner_payout_minor INTEGER NOT NULL DEFAULT 0
CHECK (partner_payout_minor >= 0);

ALTER TABLE tasks
ADD COLUMN reward_rate_bps INTEGER NOT NULL DEFAULT 2000
CHECK (reward_rate_bps >= 0 AND reward_rate_bps <= 10000);

ALTER TABLE tasks
ADD COLUMN max_user_reward_minor INTEGER
CHECK (
  max_user_reward_minor IS NULL
  OR max_user_reward_minor >= 0
);

ALTER TABLE tasks
ADD COLUMN min_platform_margin_minor INTEGER NOT NULL DEFAULT 0
CHECK (min_platform_margin_minor >= 0);

ALTER TABLE tasks
ADD COLUMN reward_model TEXT NOT NULL DEFAULT 'PARTNER_SHARE';

CREATE INDEX IF NOT EXISTS idx_tasks_reward_model
ON tasks(reward_model);

CREATE INDEX IF NOT EXISTS idx_tasks_partner_payout
ON tasks(partner_payout_minor);
