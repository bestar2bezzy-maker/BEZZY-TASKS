
/*
 * ============================================================
 * BEZZY TASKS
 * V33.8
 * ORCHESTRATEUR MENSUEL DE PROGRESSION
 * POSTGRESQL
 * ============================================================
 *
 * Coordonne les évaluations et les promotions mensuelles.
 *
 * Aucune exécution automatique pour le moment.
 * Le cron Render sera configuré ultérieurement.
 *
 * ============================================================
 */

const {
  applyMonthlyRoleTransitions
} = require('./roleTransition');

const {
  runMonthlyRoleEvaluation
} = require('./roleMonthlyRunner');


/*
 * ============================================================
 * CALCUL DU MOIS PRÉCÉDENT
 * ============================================================
 */

function getPreviousMonth(year, month) {
  const currentYear = Number(year);
  const currentMonth = Number(month);

  if (
    !Number.isInteger(currentYear) ||
    !Number.isInteger(currentMonth) ||
    currentMonth < 1 ||
    currentMonth > 12
  ) {
    throw new Error('INVALID_PERIOD');
  }

  if (currentMonth === 1) {
    return {
      year: currentYear - 1,
      month: 12
    };
  }

  return {
    year: currentYear,
    month: currentMonth - 1
  };
}


/*
 * ============================================================
 * VÉRIFIER LE PREMIER JOUR DU MOIS
 * ============================================================
 */

function isFirstDayOfMonth(date = new Date()) {
  return date.getDate() === 1;
}


/*
 * ============================================================
 * OUVERTURE MENSUELLE
 * ============================================================
 */

async function runMonthlyOpening(date = new Date()) {
  if (!isFirstDayOfMonth(date)) {
    throw new Error(
      'MONTHLY_OPENING_ONLY_ON_FIRST_DAY'
    );
  }

  const currentYear = date.getFullYear();
  const currentMonth = date.getMonth() + 1;

  const previousPeriod = getPreviousMonth(
    currentYear,
    currentMonth
  );

  /*
   * Étape 1 : évaluer les membres pour le mois terminé.
   */

  const evaluationResult =
    await runMonthlyRoleEvaluation(
      previousPeriod.year,
      previousPeriod.month
    );

  /*
   * Étape 2 : appliquer les promotions éligibles.
   */

  const transitionResult =
    await applyMonthlyRoleTransitions(
      previousPeriod.year,
      previousPeriod.month
    );

  return {
    success: true,

    currentYear,
    currentMonth,

    appliedEvaluationYear:
      previousPeriod.year,

    appliedEvaluationMonth:
      previousPeriod.month,

    evaluationResult,
    transitionResult
  };
}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  getPreviousMonth,
  isFirstDayOfMonth,
  runMonthlyOpening
};
