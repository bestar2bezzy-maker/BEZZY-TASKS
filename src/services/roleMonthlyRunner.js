
/*
 * ============================================================
 * BEZZY TASKS
 * V33.8
 * MOTEUR GLOBAL D'ÉVALUATION MENSUELLE
 * POSTGRESQL
 * ============================================================
 *
 * Ce service récupère les membres et lance leur évaluation.
 *
 * Il utilise progression_title.
 * Il ne modifie aucun rôle du personnel.
 *
 * ============================================================
 */

const { getPostgresPool } = require('../config/postgres');

const {
  evaluateUserMonthly
} = require('./roleMonthlyEvaluation');


/*
 * ============================================================
 * RÉCUPÉRER LES UTILISATEURS À ÉVALUER
 * ============================================================
 */

async function getUsersForMonthlyEvaluation() {
  const pool = getPostgresPool();

  const result = await pool.query(`
    SELECT
      id,
      progression_title,
      status
    FROM users
    WHERE LOWER(COALESCE(progression_title, 'user')) IN (
      'user',
      'ambassadeur',
      'moderateur',
      'administrateur',
      'elite'
    )
    ORDER BY created_at ASC
  `);

  return result.rows;
}


/*
 * ============================================================
 * ÉVALUATION GLOBALE
 * ============================================================
 */

async function runMonthlyRoleEvaluation(
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

  const users = await getUsersForMonthlyEvaluation();

  const results = [];

  for (const user of users) {
    const title = String(
      user.progression_title || 'user'
    ).trim().toLowerCase();

    try {
      const evaluation = await evaluateUserMonthly(
        user.id,
        year,
        month
      );

      results.push({
        success: true,
        userId: user.id,
        title,
        evaluation
      });

    } catch (error) {
      results.push({
        success: false,
        userId: user.id,
        title,
        error: error.message
      });
    }
  }

  const successful = results.filter(
    result => result.success
  ).length;

  const failed = results.filter(
    result => !result.success
  ).length;

  return {
    evaluationYear: year,
    evaluationMonth: month,
    totalUsers: users.length,
    successful,
    failed,
    results
  };
}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  getUsersForMonthlyEvaluation,
  runMonthlyRoleEvaluation
};
