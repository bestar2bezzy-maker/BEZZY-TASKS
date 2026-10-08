/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * SEUILS OFFICIELS DE PROMOTION DES RÔLES
 * ============================================================
 *
 * Cette migration ajoute un seuil distinct pour la promotion.
 *
 * IMPORTANT :
 *
 * initial_required_users
 * = seuil nécessaire pour accéder au rôle depuis le rôle
 * précédent.
 *
 * monthly_required_users
 * = nombre minimum de filleuls actifs à maintenir chaque mois.
 *
 * Exemple :
 *
 * AMBASSADEUR
 *   promotion : 500
 *   maintien   : 100
 *
 * MODÉRATEUR
 *   promotion : 900
 *   maintien   : 200
 *
 * ADMINISTRATEUR
 *   promotion : 1000
 *   maintien   : 300
 *
 * ELITE
 *   promotion : aucune
 *   maintien   : 500
 *
 * ============================================================
 */

ALTER TABLE role_progression_config
ADD COLUMN promotion_required_users INTEGER NOT NULL DEFAULT 0;


/*
 * ============================================================
 * SEUILS OFFICIELS
 * ============================================================
 */

UPDATE role_progression_config
SET promotion_required_users = 200
WHERE role = 'user';


UPDATE role_progression_config
SET promotion_required_users = 500
WHERE role = 'ambassadeur';


UPDATE role_progression_config
SET promotion_required_users = 900
WHERE role = 'moderateur';


UPDATE role_progression_config
SET promotion_required_users = 1000
WHERE role = 'administrateur';


UPDATE role_progression_config
SET promotion_required_users = 0
WHERE role = 'elite';
