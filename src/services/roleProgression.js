/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * SERVICE DE PROGRESSION DES RÔLES
 * ============================================================
 *
 * Ce service centralise les calculs nécessaires au système :
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
 * Il ne modifie pas encore les rôles.
 * Il prépare uniquement les données nécessaires à leur évaluation.
 *
 * ============================================================
 */

const crypto = require('crypto');

const { getDb } = require('../config/database');


/*
 * ============================================================
 * OUTILS
 * ============================================================
 */

function getDatabase() {
  return getDb();
}


/*
 * ============================================================
 * COMPTER LES UTILISATEURS ACTIFS PARRAINÉS
 * ============================================================
 *
 * Retourne le nombre de filleuls directs d'un utilisateur
 * qui respectent les conditions configurées comme utilisateur
 * actif.
 *
 * ============================================================
 */

function countActiveReferredUsers(userId) {
  if (!userId) {
    return 0;
  }

  const db = getDatabase();

  const config = db.prepare(`
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
  `).get();

  if (!config) {
    return 0;
  }

  const windowDays =
    Number(config.activity_window_days) > 0
      ? Number(config.activity_window_days)
      : 30;

  const minimumActivities =
    Number(config.minimum_activities) > 0
      ? Number(config.minimum_activities)
      : 1;

  /*
   * NOTE :
   * Les colonnes exactes d'activité et d'anti-fraude seront
   * branchées sur leurs tables respectives lorsque le moteur
   * anti-fraude sera finalisé.
   *
   * Pour cette première version, on compte uniquement les
   * comptes vérifiés lorsque cette exigence est activée.
   */

  let sql = `
    SELECT COUNT(*) AS total
    FROM users u
    WHERE u.referred_by_user_id = ?
  `;

  const params = [userId];

  if (Number(config.requires_verified_account) === 1) {
    sql += `
      AND u.email_verified_at IS NOT NULL
    `;
  }

  /*
   * Les paramètres suivants sont conservés pour permettre au
   * moteur d'évoluer sans modifier son interface.
   */

  void requiresPlatformActivity(config);
  void minimumActivities;
  void windowDays;
  void antiFraudRequired(config);

  const result = db.prepare(sql).get(...params);

  return Number(result?.total || 0);
}

/*
 * ============================================================
 * LECTURE DE LA CONFIGURATION D'UN RÔLE
 * ============================================================
 */

function getRoleProgressionConfig(role) {
  if (!role) {
    return null;
  }

  const db = getDatabase();

  return db.prepare(`
    SELECT
      role,
      initial_required_users,
      monthly_required_users,
      promotion_required_users,
      promotion_target_role,
      is_active
    FROM role_progression_config
    WHERE role = ?
      AND is_active = 1
    LIMIT 1
  `).get(String(role).toLowerCase());
}


/*
 * ============================================================
 * LECTURE DES CONDITIONS DE PROGRESSION
 * ============================================================
 */

function getProgressionRequirements(role) {
  const config = getRoleProgressionConfig(role);

  if (!config) {
    return null;
  }

  return {
    role: config.role,

    monthlyRequiredUsers:
      Number(config.monthly_required_users || 0),

    promotionRequiredUsers:
      Number(config.promotion_required_users || 0),

    promotionTargetRole:
      config.promotion_target_role || null
  };
}

/*
 * ============================================================
 * PRÉPARER L'ÉVALUATION D'UN MEMBRE
 * ============================================================
 */

function buildRoleEvaluation(userId, role) {
  if (!userId || !role) {
    return null;
  }

  const normalizedRole =
    String(role).toLowerCase();

  const activeReferredUsers =
    countActiveReferredUsers(userId);

  const requirements =
    getProgressionRequirements(
      normalizedRole
    );

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

    role: normalizedRole,

    activeReferredUsers,

    monthlyRequiredUsers:
      requirements.monthlyRequiredUsers,

    promotionRequiredUsers:
      requirements.promotionRequiredUsers,

    monthlyQuotaReached,

    promotionThresholdReached,

    promotionTargetRole:
      requirements.promotionTargetRole
  };
    }


/*
 * ============================================================
 * UTILITAIRES INTERNES
 * ============================================================
 */

function requiresPlatformActivity(config) {
  return Number(config.requires_platform_activity) === 1;
}

function antiFraudRequired(config) {
  return Number(config.anti_fraud_required) === 1;
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
