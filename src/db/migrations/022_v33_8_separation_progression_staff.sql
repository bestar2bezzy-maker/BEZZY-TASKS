/*
 * ============================================================
 * BEZZY TASKS
 * V33.8
 * SEPARATION DES TITRES ET DES ROLES DU PERSONNEL
 * ============================================================
 */

-- 1. Colonnes indépendantes.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS progression_title TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS staff_role TEXT NOT NULL DEFAULT 'NONE';


-- 2. Préserver les anciens titres de progression.

UPDATE users
SET progression_title = CASE
  WHEN LOWER(COALESCE(role, '')) IN ('user', 'utilisateur')
    THEN 'user'
  WHEN LOWER(COALESCE(role, '')) = 'ambassadeur'
    THEN 'ambassadeur'
  WHEN LOWER(COALESCE(role, '')) IN ('moderateur', 'moderator')
    THEN 'moderateur'
  WHEN LOWER(COALESCE(role, '')) IN ('administrateur', 'admin')
    THEN 'administrateur'
  WHEN LOWER(COALESCE(role, '')) = 'elite'
    THEN 'elite'
  ELSE 'user'
END
WHERE progression_title IS NULL;


-- 3. Neutraliser les anciens rôles d'accès.

UPDATE users
SET role = 'user'
WHERE role IS DISTINCT FROM 'user';


-- 4. Index.

CREATE INDEX IF NOT EXISTS idx_users_staff_role
ON users(staff_role);

CREATE INDEX IF NOT EXISTS idx_users_progression_title
ON users(progression_title);


-- 5. Contrainte compatible avec une réexécution.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_staff_role_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_staff_role_check
    CHECK (
      staff_role IN (
        'NONE',
        'PLATFORM_MODERATOR',
        'PLATFORM_ADMIN'
      )
    );
  END IF;
END
$$;
