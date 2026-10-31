
/*
 * ============================================================
 * BEZZY TASKS
 * V33.8
 * SERVICE DE PROGRESSION DES TITRES
 * POSTGRESQL
 * ============================================================
 *
 * Les titres de progression sont indépendants des rôles
 * du personnel de la plateforme.
 *
 * USER
 *   ↓
 * AMBASSADEUR
 *   ↓
 * MODÉRATEUR
 *   ↓
 * ADMINISTRATEUR
 *   ↓
 * ELITE
 *
 * Ce service ne donne aucun droit administratif.
 * Il prépare uniquement les données de progression.
 *
 * ============================================================
 */

const { getPostgresPool } = require('../config/postgres');


/*
 * ============================================================
 * COMPTER LES UTILISATEURS ACTIFS PARRAINÉS
 * ============================================================
 */

async function countActiveReferredUsers(userId) {
  if (!userId) {
    return 0;
  }

  const pool = getPostgresPool();

  const configResult = await pool.query(`
    SELECT
      requires_verified_account,
      requires_platform_activity,
      minimum_activities,
      activity_window_days,
      anti_fraud_required
    FROM active_user_config
    WHERE id = 1
      AND is_active = 1
    LIMIT 1
  `);

  const config = configResult.rows[0];

  if (!config) {
    return 0;
  }

  /*
   * Pour cette version, le comptage repose sur
   * la vérification de l'adresse e-mail.
   *
   * Les contrôles d'activité et anti-fraude seront
   * branchés lorsque leurs données seront disponibles.
   */

  const conditions = [
    'referred_by_user_id = $1'
  ];

  if (Number(config.requires_verified_account) === 1) {
    conditions.push('email_verified_at IS NOT NULL');
  }

  const result = await pool.query(`
    SELECT COUNT(*)::INTEGER AS total
    FROM users
    WHERE ${conditions.join(' AND ')}
  `, [userId]);

  return Number(result.rows[0]?.total || 0);
}


/*
 * ============================================================
 * LIRE LA CONFIGURATION D'UN TITRE
 * ============================================================
 */

async function getRoleProgressionConfig(title) {
  if (!title) {
    return null;
  }

  const pool = getPostgresPool();

  const result = await pool.query(`
    SELECT
      role,
      initial_required_users,
      monthly_required_users,
      promotion_required_users,
      promotion_target_role,
      demotion_target_role,
      is_active
    FROM role_progression_config
    WHERE LOWER(role) = LOWER($1)
      AND is_active = 1
    LIMIT 1
  `, [String(title)]);

  return result.rows[0] || null;
}


/*
 * ============================================================
 * LIRE LES CONDITIONS DE PROGRESSION
 * ============================================================
 */

async function getProgressionRequirements(title) {
  const config = await getRoleProgressionConfig(title);

  if (!config) {
    return null;
  }

  return {
    role: config.role,

    initialRequiredUsers:
      Number(config.initial_required_users || 0),

    monthlyRequiredUsers:
      Number(config.monthly_required_users || 0),

    promotionRequiredUsers:
      Number(config.promotion_required_users || 0),

    promotionTargetRole:
      config.promotion_target_role || null,

    demotionTargetRole:
      config.demotion_target_role || null
  };
}


/*
 * ============================================================
 * PRÉPARER L'ÉVALUATION D'UN MEMBRE
 * ============================================================
 */

async function buildRoleEvaluation(userId, title) {
  if (!userId || !title) {
    return null;
  }

  const normalizedTitle =
    String(title).trim().toLowerCase();

  const activeReferredUsers =
    await countActiveReferredUsers(userId);

  const requirements =
    await getProgressionRequirements(normalizedTitle);

  if (!requirements) {
    return null;
  }

  const monthlyQuotaReached =
    activeReferredUsers >=
    requirements.monthlyRequiredUsers;

  const promotionThresholdReached =
    requirements.promotionRequiredUsers > 0 &&
    activeReferredUsers >=
    requirements.promotionRequiredUsers;

  return {
    userId,

    title: normalizedTitle,

    activeReferredUsers,

    initialRequiredUsers:
      requirements.initialRequiredUsers,

    monthlyRequiredUsers:
      requirements.monthlyRequiredUsers,

    promotionRequiredUsers:
      requirements.promotionRequiredUsers,

    monthlyQuotaReached,

    promotionThresholdReached,

    promotionTargetRole:
      requirements.promotionTargetRole,

    demotionTargetRole:
      requirements.demotionTargetRole
  };
}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  countActiveReferredUsers,
  getRoleProgressionConfig,
  getProgressionRequirements,
  buildRoleEvaluation
};
                                        
