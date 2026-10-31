
/*
 * ============================================================
 * BEZZY TASKS
 * V33.8
 * APPLICATION DES TRANSITIONS DE TITRES
 * POSTGRESQL
 * ============================================================
 *
 * Ce service applique les promotions enregistrées.
 *
 * Il modifie uniquement progression_title.
 * Il ne modifie jamais users.role ni users.staff_role.
 *
 * Une décision du mois M est appliquée au début de M+1.
 *
 * ============================================================
 */

const { getPostgresPool } = require('../config/postgres');


/*
 * ============================================================
 * NORMALISATION
 * ============================================================
 */

function normalizeRole(role) {
  return String(role || 'user')
    .trim()
    .toLowerCase();
}


/*
 * ============================================================
 * VÉRIFIER UNE TRANSITION
 * ============================================================
 */

function isValidRoleTransition(currentRole, nextRole) {
  const role = normalizeRole(currentRole);
  const target = normalizeRole(nextRole);

  const allowedTransitions = {
    user: 'ambassadeur',
    ambassadeur: 'moderateur',
    moderateur: 'administrateur',
    administrateur: 'elite'
  };

  return allowedTransitions[role] === target;
}


/*
 * ============================================================
 * APPLIQUER UNE DÉCISION
 * ============================================================
 */

async function applyRoleTransition(performanceId) {
  if (!performanceId) {
    throw new Error('PERFORMANCE_ID_REQUIRED');
  }

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const performanceResult = await client.query(`
      SELECT
        id,
        user_id,
        role_at_evaluation,
        evaluation_year,
        evaluation_month,
        decision,
        next_role,
        applied_at
      FROM role_monthly_performance
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `, [performanceId]);

    const performance = performanceResult.rows[0];

    if (!performance) {
      throw new Error('PERFORMANCE_NOT_FOUND');
    }

    if (performance.applied_at) {
      await client.query('COMMIT');

      return {
        applied: false,
        reason: 'ROLE_TRANSITION_ALREADY_APPLIED',
        performanceId: performance.id,
        userId: performance.user_id,
        appliedAt: performance.applied_at
      };
    }

    const evaluationYear =
      Number(performance.evaluation_year);

    const evaluationMonth =
      Number(performance.evaluation_month);

    const nextMonthStart = new Date(
      evaluationMonth === 12
        ? evaluationYear + 1
        : evaluationYear,
      evaluationMonth === 12
        ? 0
        : evaluationMonth,
      1,
      0,
      0,
      0,
      0
    );

    if (new Date() < nextMonthStart) {
      throw new Error('ROLE_TRANSITION_NOT_YET_AVAILABLE');
    }

    if (performance.decision !== 'PROMOTE') {
      await client.query('COMMIT');

      return {
        applied: false,
        reason: 'NO_PROMOTION_REQUIRED',
        performanceId: performance.id,
        userId: performance.user_id
      };
    }

    if (!performance.next_role) {
      throw new Error('NEXT_ROLE_MISSING');
    }

    const currentRole =
      normalizeRole(performance.role_at_evaluation);

    const nextRole =
      normalizeRole(performance.next_role);

    if (!isValidRoleTransition(currentRole, nextRole)) {
      throw new Error('INVALID_ROLE_TRANSITION');
    }

    const userResult = await client.query(`
      SELECT
        id,
        progression_title
      FROM users
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `, [performance.user_id]);

    const user = userResult.rows[0];

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    const actualRole =
      normalizeRole(user.progression_title);

    if (actualRole !== currentRole) {
      await client.query('COMMIT');

      return {
        applied: false,
        reason: 'ROLE_ALREADY_CHANGED',
        performanceId: performance.id,
        userId: performance.user_id,
        currentRole: actualRole,
        expectedRole: currentRole
      };
    }

    await client.query(`
      UPDATE users
      SET progression_title = $1
      WHERE id = $2
    `, [
      nextRole,
      performance.user_id
    ]);

    const appliedAt = new Date().toISOString();

    await client.query(`
      UPDATE role_monthly_performance
      SET applied_at = $1
      WHERE id = $2
        AND applied_at IS NULL
    `, [
      appliedAt,
      performance.id
    ]);

    await client.query('COMMIT');

    return {
      applied: true,
      performanceId: performance.id,
      userId: performance.user_id,
      previousRole: currentRole,
      newRole: nextRole,
      appliedAt
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;

  } finally {
    client.release();
  }
}


/*
 * ============================================================
 * APPLIQUER LES TRANSITIONS D'UNE PÉRIODE
 * ============================================================
 */

async function applyMonthlyRoleTransitions(
  evaluationYear,
  evaluationMonth
) {
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

  const performancesResult = await pool.query(`
    SELECT id
    FROM role_monthly_performance
    WHERE evaluation_year = $1
      AND evaluation_month = $2
      AND decision = 'PROMOTE'
      AND applied_at IS NULL
    ORDER BY created_at ASC
  `, [
    year,
    month
  ]);

  const performances = performancesResult.rows;
  const results = [];

  for (const performance of performances) {
    try {
      const result = await applyRoleTransition(
        performance.id
      );

      results.push(result);

    } catch (error) {
      results.push({
        applied: false,
        performanceId: performance.id,
        error: error.message
      });
    }
  }

  return {
    evaluationYear: year,
    evaluationMonth: month,
    total: performances.length,
    results
  };
}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  isValidRoleTransition,
  applyRoleTransition,
  applyMonthlyRoleTransitions
};
  
