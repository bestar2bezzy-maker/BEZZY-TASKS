/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * ÉVALUATION MENSUELLE DES RÔLES
 * ============================================================
 *
 * Ce service prépare et enregistre l'évaluation mensuelle
 * d'un membre.
 *
 * IMPORTANT :
 * Il ne modifie jamais directement le rôle de l'utilisateur.
 *
 * Le changement de rôle sera appliqué au début du mois suivant.
 *
 * ============================================================
 */

const crypto = require('crypto');

const { getDb } = require('../config/database');

const {
  buildRoleEvaluation
} = require('./roleProgression');


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
 * NORMALISATION DU RÔLE
 * ============================================================
 */

function normalizeRole(role) {
  return String(role || 'user')
    .trim()
    .toLowerCase();
}


/*
 * ============================================================
 * RÉCUPÉRER UN UTILISATEUR
 * ============================================================
 */

function getUser(userId) {
  if (!userId) {
    return null;
  }

  const db = getDatabase();

  return db.prepare(`
    SELECT
      id,
      role,
      status,
      email_verified_at
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(userId);
}


/*
 * ============================================================
 * DÉTERMINER LA DÉCISION
 * ============================================================
 *
 * La décision distingue :
 *
 * - le maintien mensuel ;
 * - la promotion ;
 * - l'absence de décision de rétrogradation.
 *
 * ============================================================
 */

function determineDecision({
  role,
  monthlyQuotaReached,
  promotionThresholdReached,
  promotionTargetRole
}) {
  const normalizedRole =
    normalizeRole(role);

  /*
   * ------------------------------------------------------------
   * PROMOTION
   * ------------------------------------------------------------
   *
   * Si le seuil officiel de promotion est atteint
   * et qu'un rôle supérieur existe, la promotion est proposée.
   */

  if (
    promotionThresholdReached &&
    promotionTargetRole
  ) {
    return {
      decision: 'PROMOTE',
      nextRole: promotionTargetRole
    };
  }

  /*
   * ------------------------------------------------------------
   * MAINTIEN
   * ------------------------------------------------------------
   *
   * Si le quota mensuel est atteint, le membre conserve
   * son rôle actuel.
   */

  if (monthlyQuotaReached) {
    return {
      decision: 'MAINTAIN',
      nextRole: null
    };
  }

  /*
   * ------------------------------------------------------------
   * USER SANS PROMOTION
   * ------------------------------------------------------------
   */

  if (normalizedRole === 'user') {
    return {
      decision: 'MAINTAIN',
      nextRole: null
    };
  }

  /*
   * ------------------------------------------------------------
   * RÔLE SUPÉRIEUR SOUS LE QUOTA
   * ------------------------------------------------------------
   *
   * La rétrogradation n'est pas encore activée.
   * Nous enregistrons donc PENDING.
   */

  return {
    decision: 'PENDING',
    nextRole: null
  };
}

/*
 * ============================================================
 * ÉVALUATION MENSUELLE D'UN UTILISATEUR
 * ============================================================
 */

function evaluateUserMonthly(
  userId,
  evaluationYear,
  evaluationMonth
) {
  if (!userId) {
    throw new Error('USER_ID_REQUIRED');
  }

  const year = Number(evaluationYear);
  const month = Number(evaluationMonth);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error('INVALID_EVALUATION_PERIOD');
  }

  const db = getDatabase();

  const user = getUser(userId);

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const role = normalizeRole(user.role);
  const evaluation =
    buildRoleEvaluation(
      user.id,
      role
    );

  if (!evaluation) {
    throw new Error('ROLE_PROGRESSION_CONFIG_NOT_FOUND');
  }

  const decision =
    determineDecision({
      role,
      monthlyQuotaReached:
        evaluation.monthlyQuotaReached,
      promotionThresholdReached:
        evaluation.promotionThresholdReached,
      promotionTargetRole:
        evaluation.promotionTargetRole
    });

  const performanceId =
    crypto.randomUUID();

  const now =
    new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO role_monthly_performance (
      id,
      user_id,
      role_at_evaluation,
      evaluation_year,
      evaluation_month,
      active_referred_users,
      required_active_users,
      bezzy_score,
      quota_reached,
      anti_fraud_passed,
      decision,
      next_role,
      evaluated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    performanceId,
    user.id,
    role,
    year,
    month,
        evaluation.activeReferredUsers,
    evaluation.monthlyRequiredUsers,
    0,
    evaluation.monthlyQuotaReached ? 1 : 0,
    1,
    decision.decision,
    decision.nextRole,
    now
  );

  return {
    id: performanceId,

    userId: user.id,

    roleAtEvaluation: role,

    evaluationYear: year,

    evaluationMonth: month,

    activeReferredUsers:
      evaluation.activeReferredUsers,

    monthlyRequiredUsers:
  evaluation.monthlyRequiredUsers,

monthlyQuotaReached:
  evaluation.monthlyQuotaReached,

promotionThresholdReached:
  evaluation.promotionThresholdReached,
    decision:
      decision.decision,

    nextRole:
      decision.nextRole
  };
}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  evaluateUserMonthly,
  determineDecision
};
