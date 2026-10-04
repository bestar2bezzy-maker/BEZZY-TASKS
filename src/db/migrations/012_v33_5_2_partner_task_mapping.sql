/*
 * ============================================================
 * BEZZY TASKS — PARTNER TASK MAPPING
 * V33.5.2
 * ============================================================
 *
 * Associe une mission Bezzy à une offre externe partenaire.
 *
 * IMPORTANT :
 * - aucune récompense utilisateur n'est créditée ici ;
 * - cette migration prépare uniquement le mapping ;
 * - les identifiants partenaires restent indépendants des
 *   identifiants internes de Bezzy Tasks.
 * ============================================================
 */


/*
 * Identifiant du partenaire propriétaire de l'offre.
 */
ALTER TABLE tasks
ADD COLUMN partner_id TEXT;


/*
 * Identifiant de la mission/offre chez le partenaire.
 */
ALTER TABLE tasks
ADD COLUMN partner_task_id TEXT;


/*
 * Recherche rapide d'une offre partenaire.
 */
CREATE INDEX IF NOT EXISTS
idx_tasks_partner_mapping
ON tasks(
  partner_id,
  partner_task_id
);
