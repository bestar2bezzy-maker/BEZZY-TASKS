/*
 * ============================================================
 * BEZZY TASKS — PARTNER USER MAPPING
 * V33.5.3
 * ============================================================
 *
 * Relie l'identifiant utilisateur externe d'un partenaire
 * au véritable utilisateur Bezzy Tasks.
 *
 * Aucun crédit de récompense n'est effectué ici.
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS partner_user_mappings (
  id TEXT PRIMARY KEY,

  partner_id TEXT NOT NULL,

  external_user_id TEXT NOT NULL,

  user_id TEXT NOT NULL
    REFERENCES users(id),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    partner_id,
    external_user_id
  )
);


/*
 * Recherche rapide d'un utilisateur partenaire.
 */
CREATE INDEX IF NOT EXISTS
idx_partner_user_mappings_lookup
ON partner_user_mappings (
  partner_id,
  external_user_id
);


/*
 * Recherche inverse :
 * retrouver les identifiants partenaires
 * associés à un utilisateur Bezzy.
 */
CREATE INDEX IF NOT EXISTS
idx_partner_user_mappings_user
ON partner_user_mappings (
  user_id
);
