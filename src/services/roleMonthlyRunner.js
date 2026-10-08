/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * MOTEUR GLOBAL D'ÉVALUATION MENSUELLE DES RÔLES
 * ============================================================
 *
 * Ce service parcourt les utilisateurs concernés par le système
 * de progression et lance leur évaluation mensuelle.
 *
 * IMPORTANT :
 *
 * Ce service NE MODIFIE PAS directement les rôles.
 *
 * Il crée uniquement les décisions dans :
 *
 * role_monthly_performance
 *
 * Les transitions seront appliquées séparément au début
 * du mois suivant par roleTransition.js.
 *
 * ============================================================
 */

const { getDb } = require('../config/database');

const {
  evaluateUserMonthly
} = require('./roleMonthlyEvaluation');


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
 * RÉCUPÉRER LES UTILISATEURS À ÉVALUER
 * ============================================================
 *
 * On inclut les rôles qui participent au système de progression.
 *
 * USER
 * AMBASSADEUR
 * MODÉRATEUR
 * ADMINISTRATEUR
 * ELITE
 *
 * ============================================================
 */

function getUsersForMonthlyEvaluation() {
  const db = getDatabase();

  return db.prepare(`
    SELECT
      id,
      role,
      status
    FROM users
    WHERE LOWER(role) IN (
      'user',
      'ambassadeur',
      'moderateur',
      'administrateur',
      'elite'
    )
    ORDER BY created_at ASC
  `).all();
}


/*
 * ============================================================
 * ÉVALUATION GLOBALE
 * ============================================================
 */

function runMonthlyRoleEvaluation(
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

  const users =
    getUsersForMonthlyEvaluation();

  const results = [];

  for (const user of users) {
    try {
      const evaluation =
        evaluateUserMonthly(
          user.id,
          year,
          month
        );

      results.push({
        success: true,
        userId: user.id,
        role: user.role,
        evaluation
      });
    } catch (error) {
      results.push({
        success: false,
        userId: user.id,
        role: user.role,
        error: error.message
      });
    }
  }

  const successful =
    results.filter(
      result => result.success
    ).length;

  const failed =
    results.filter(
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
