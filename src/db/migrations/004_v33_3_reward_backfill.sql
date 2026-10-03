/*
 * ============================================================
 * BEZZY TASKS — REWARD ENGINE BACKFILL
 * V33.3.1
 * ============================================================
 *
 * Les anciennes offres utilisaient reward_minor comme
 * récompense utilisateur.
 *
 * Pour éviter de perdre leur valeur lors du passage au
 * Reward Engine, on initialise partner_payout_minor
 * avec l'ancien reward_minor uniquement lorsque le payout
 * partenaire n'a pas encore été défini.
 */

UPDATE tasks
SET partner_payout_minor = reward_minor
WHERE partner_payout_minor = 0
  AND reward_minor > 0;
