/*
 * ============================================================
 * BEZZY TASKS
 * V33.7
 * APPLICATION DES TRANSITIONS DE RÔLE
 * ============================================================
 *
 * Ce service applique les décisions enregistrées par le moteur
 * d'évaluation mensuelle.
 *
 * IMPORTANT :
 * Une décision du mois M est appliquée au début du mois M+1.
 *
 * ============================================================
 */

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
 * VÉRIFIER LA TRANSITION
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
 *
 * La fonction reçoit l'évaluation d'un mois terminé.
 *
 * Elle vérifie ensuite que la transition est autorisée avant
 * de modifier le rôle.
 *
 * ============================================================
 */

function applyRoleTransition(performanceId) {
  if (!performanceId) {
    throw new Error('PERFORMANCE_ID_REQUIRED');
  }

  const db = getDatabase();

  const performance = db.prepare(`
    SELECT
      id,
      user_id,
      role_at_evaluation,
      evaluation_year,
      evaluation_month,
      decision,
      next_role
    FROM role_monthly_performance
    WHERE id = ?
    LIMIT 1
  `).get(performanceId);

  if (!performance) {
    throw new Error('PERFORMANCE_NOT_FOUND');
  }

  /*
   * Seules les décisions PROMOTE sont appliquées
   * par cette première version.
   */
  if (performance.decision !== 'PROMOTE') {
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

  /*
   * Sécurité :
   * aucune transition arbitraire n'est autorisée.
   */
  if (
    !isValidRoleTransition(
      currentRole,
      nextRole
    )
  ) {
    throw new Error('INVALID_ROLE_TRANSITION');
  }

  /*
   * Vérifier le rôle actuel avant modification.
   *
   * Cela évite d'écraser une modification effectuée
   * entre-temps par un administrateur.
   */
  const user = db.prepare(`
    SELECT
      id,
      role
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(performance.user_id);

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const actualRole =
    normalizeRole(user.role);

  if (actualRole !== currentRole) {
    return {
      applied: false,
      reason: 'ROLE_ALREADY_CHANGED',
      performanceId: performance.id,
      userId: performance.user_id,
      currentRole: actualRole,
      expectedRole: currentRole
    };
  }

  /*
   * Application de la transition.
   */
  const result = db.prepare(`
    UPDATE users
    SET role = ?
    WHERE id = ?
      AND role = ?
  `).run(
    nextRole,
    performance.user_id,
    currentRole
  );

  if (result.changes !== 1) {
    return {
      applied: false,
      reason: 'ROLE_UPDATE_FAILED',
      performanceId: performance.id,
      userId: performance.user_id
    };
  }

  return {
    applied: true,
    performanceId: performance.id,
    userId: performance.user_id,
    previousRole: currentRole,
    newRole: nextRole
  };
}


/*
 * ============================================================
 * APPLIQUER LES TRANSITIONS D'UNE PÉRIODE
 * ============================================================
 *
 * Exemple :
 *
 * applyMonthlyRoleTransitions(2026, 9)
 *
 * applique les décisions prises pour septembre 2026,
 * donc destinées à prendre effet en octobre 2026.
 *
 * ============================================================
 */

function applyMonthlyRoleTransitions(
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

  const db = getDatabase();

  const performances = db.prepare(`
    SELECT id
    FROM role_monthly_performance
    WHERE evaluation_year = ?
      AND evaluation_month = ?
      AND decision = 'PROMOTE'
    ORDER BY created_at ASC
  `).all(
    year,
    month
  );

  const results = [];

  for (const performance of performances) {
    try {
      results.push(
        applyRoleTransition(
          performance.id
        )
      );
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
 
