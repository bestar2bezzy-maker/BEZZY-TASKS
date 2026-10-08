/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * CIBLES DE RÉTROGRADATION DES RÔLES
 * ============================================================
 */

ALTER TABLE role_progression_config
ADD COLUMN demotion_target_role TEXT;

UPDATE role_progression_config
SET demotion_target_role = 'user'
WHERE role = 'ambassadeur';

UPDATE role_progression_config
SET demotion_target_role = 'ambassadeur'
WHERE role = 'moderateur';

UPDATE role_progression_config
SET demotion_target_role = 'moderateur'
WHERE role = 'administrateur';

UPDATE role_progression_config
SET demotion_target_role = 'administrateur'
WHERE role = 'elite';
