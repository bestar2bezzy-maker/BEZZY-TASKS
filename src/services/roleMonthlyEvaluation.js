
/*
 * ============================================================
 * BEZZY TASKS
 * V33.8
 * ÉVALUATION MENSUELLE DES TITRES
 * POSTGRESQL
 * ============================================================
 *
 * Ce service évalue la progression d'un membre.
 *
 * Il utilise progression_title et ne modifie jamais
 * users.role ni users.staff_role.
 *
 * Le changement de titre est appliqué séparément.
 *
 * ============================================================
 */

const crypto = require('crypto');

const { getPostgresPool } = require('../config/postgres');

const {
  buildRoleEvaluation
} = require('./roleProgression');


/*
 * ============================================================
 * NORMALISATION DU TITRE
 * ============================================================
 */

function normalizeRole(role) {
  return String(role || 'user')
    .trim()
    .toLowerCase();
}


/*
 * ============================================================
 * DÉTERMINER LA DÉCISION
 * ============================================================
 */

function determineDecision({
  role,
  monthlyQuotaReached,
  promotionThresholdReached,
  promotionTargetRole,
  demotionTargetRole
}) {
  const normalizedRole = normalizeRole(role);

  if (
    promotionThresholdReached &&
    promotionTargetRole
  ) {
    return {
      decision: 'PROMOTE',
      nextRole: promotionTargetRole
    };
  }

  if (monthlyQuotaReached) {
    return {
      decision: 'MAINTAIN',
      nextRole: null
    };
  }

  if (
    demotionTargetRole &&
    normalizedRole !== 'user'
  ) {
    return {
      decision: 'DEMOTE',
      nextRole: demotionTargetRole
    };
  }

  return {
    decision: 'MAINTAIN',
    nextRole: null
  };
}


/*
 * ============================================================
 * ÉVALUATION MENSUELLE D'UN UTILISATEUR
 * ============================================================
 */

async function evaluateUserMonthly(
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

  const pool = getPostgresPool();

  const userResult = await pool.query(`
    SELECT
      id,
      progression_title,
      status,
      email_verified_at
    FROM users
    WHERE id = $1
    LIMIT 1
  `, [userId]);

  const user = userResult.rows[0];

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const title = normalizeRole(user.progression_title);

  const evaluation = await buildRoleEvaluation(
    user.id,
    title
  );

  if (!evaluation) {
    throw new Error('ROLE_PROGRESSION_CONFIG_NOT_FOUND');
  }

  const decision = determineDecision({
    role: title,

    monthlyQuotaReached:
      evaluation.monthlyQuotaReached,

    promotionThresholdReached:
      evaluation.promotionThresholdReached,

    promotionTargetRole:
      evaluation.promotionTargetRole,

    demotionTargetRole:
      evaluation.demotionTargetRole
  });

  const performanceId = crypto.randomUUID();

  const now = new Date().toISOString();

  const result = await pool.query(`
    INSERT INTO role_monthly_performance (
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
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13
    )
    ON CONFLICT (
      user_id,
      evaluation_year,
      evaluation_month
    )
    DO UPDATE SET
      role_at_evaluation = EXCLUDED.role_at_evaluation,
      active_referred_users = EXCLUDED.active_referred_users,
      required_active_users = EXCLUDED.required_active_users,
      bezzy_score = EXCLUDED.bezzy_score,
      quota_reached = EXCLUDED.quota_reached,
      anti_fraud_passed = EXCLUDED.anti_fraud_passed,
      decision = EXCLUDED.decision,
      next_role = EXCLUDED.next_role,
      evaluated_at = EXCLUDED.evaluated_at
    RETURNING id
  `, [
    performanceId,
    user.id,
    title,
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
  ]);

  return {
    id: result.rows[0].id,

    userId: user.id,

    roleAtEvaluation: title,

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

    decision: decision.decision,

    nextRole: decision.nextRole
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
  
