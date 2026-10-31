
/*
 * ============================================================
 * BEZZY TASKS
 * V33.8
 * SEPARATION DES TITRES ET DES ROLES DU PERSONNEL
 * ============================================================
 *
 * progression_title : titre de progression du membre.
 * staff_role         : rôle réel au sein de l'équipe.
 *
 * Aucun titre de progression ne donne de pouvoir
 * administratif ou de modération.
 *
 * ============================================================
 */

-- 1. Ajouter les colonnes indépendantes.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS progression_title TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS staff_role TEXT NOT NULL DEFAULT 'NONE';


-- 2. Conserver les anciens titres des membres.

UPDATE users
SET progression_title = CASE
  WHEN LOWER(COALESCE(role, '')) IN (
    'user',
    'utilisateur'
  ) THEN 'user'

  WHEN LOWER(COALESCE(role, '')) = 'ambassadeur'
    THEN 'ambassadeur'

  WHEN LOWER(COALESCE(role, '')) IN (
    'moderateur',
    'moderator'
  ) THEN 'moderateur'

  WHEN LOWER(COALESCE(role, '')) IN (
    'administrateur',
    'admin'
  ) THEN 'administrateur'

  WHEN LOWER(COALESCE(role, '')) = 'elite'
    THEN 'elite'

  ELSE 'user'
END
WHERE progression_title IS NULL;


-- 3. Neutraliser l'ancien champ role.
-- Les anciens titres ne doivent plus accorder de droits.

UPDATE users
SET role = 'user'
WHERE role IS DISTINCT FROM 'user';


-- 4. Index pour les futures vérifications du personnel.

CREATE INDEX IF NOT EXISTS idx_users_staff_role
ON users(staff_role);


-- 5. Index pour la progression des membres.

CREATE INDEX IF NOT EXISTS idx_users_progression_title
ON users(progression_title);


-- 6. Vérification des valeurs autorisées.

ALTER TABLE users
ADD CONSTRAINT users_staff_role_check
CHECK (
  staff_role IN (
    'NONE',
    'PLATFORM_MODERATOR',
    'PLATFORM_ADMIN'
  )
);
  
